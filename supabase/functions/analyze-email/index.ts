import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, handleOptions, normalizeCustomerSupplied } from "../_shared/http.ts";
import { callAI, parseAIJson, type AIMessage } from "../_shared/ai-client.ts";

// Fix encoding issues in email text
function fixEncoding(text: string): string {
  if (!text) return '';

  const map: Record<string, string> = {
    'Ã¦': 'æ', 'Ã˜': 'Ø', 'Ã¸': 'ø', 'Ã…': 'Å', 'Ã¥': 'å',
    'Ã†': 'Æ', 'Â²': '²', 'Â°': '°', 'Â½': '½', 'Â¼': '¼', 'Â¾': '¾',
    'adevÃ¦relse': 'badeværelse', 'pÃ¥': 'på', 'mÂ²': 'm²',
    'r�dgods': 'rødgods', 'rÃ¸r': 'rør', 'kÃ¸kken': 'køkken',
    '�': '' // Remove replacement character
  };

  let fixed = text;
  for (const [garbled, correct] of Object.entries(map)) {
    fixed = fixed.replaceAll(garbled, correct);
  }
  return fixed;
}

// SIMPLIFIED PROMPT: Focus on what AI can determine WITHOUT database access
// Materials and prices are handled by material-lookup with BOM generator + database
const VALENTIN_AI_PROMPT = `Du er VVS-ekspert for Valentin VVS ApS. Analyser kundeforespørgslen og udtræk struktureret information.

VIGTIGT: Du skal KUN identificere projekt-information og kundedata. Specifikke materialer og priser håndteres af vores materiale-database - identificer IKKE produktkoder eller priser.

Returner JSON med følgende struktur:

{
  "customer": {
    "name": "string | null",
    "email": "string | null",
    "phone": "string | null",
    "address": "string | null",
    "customer_type": "private | business | contractor"
  },
  "project": {
    "type": "bathroom_renovation | kitchen_plumbing | pipe_installation | district_heating | floor_heating | radiator_installation | service_call",
    "description": "Detaljeret beskrivelse af arbejdet på dansk",
    "estimated_size": { "value": number, "unit": "m2 | meter | stk | job" },
    "complexity": "simple | medium | complex | emergency",
    "urgency": "normal | urgent | emergency"
  },
  "signals": {
    "basement": boolean,
    "elevator": boolean,
    "floor": number,
    "customer_supplied": ["wc_bowl", "flush_plate", "faucet_basin", "faucet_shower"],
    "ceiling_height": number | null,
    "difficult_access": boolean,
    "old_building": boolean,
    "new_construction": boolean
  },
  "pricing_hints": {
    "base_hours_estimate": number,
    "complexity_multiplier": number (1.0-1.5)
  }
}

**Vigtige regler:**
- Udtræk størrelse fra teksten hvis nævnt (fx "12 m²", "15 meter rør")
- Vær KONSERVATIV med timer-estimat
- customer_supplied: Hvad leverer kunden selv? (armatur, toilet, fliser etc.)
- old_building = true hvis hus fra før 1980 eller nævner "gammel"
- basement = true hvis arbejdet er i kælder
- difficult_access = true hvis vanskelig adgang nævnes

Returner KUN valid JSON - ingen anden tekst.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();

  try {
    const body = await req.json();
    const { emailContent, subject, caseId } = body;

    if (!emailContent) {
      return err('Email content required', 400);
    }

    console.log('📧 Analyzing email with GPT-5.2:', { subject, contentLength: emailContent.length });

    // Fix encoding in email content before sending to AI
    const cleanSubject = fixEncoding(subject || 'Ingen emne');
    const cleanContent = fixEncoding(emailContent);

    const content = `EMNE: ${cleanSubject}\nINDHOLD:\n${cleanContent}`;

    // Use GPT-5.2 with Chat Completions API and high reasoning
    const messages: AIMessage[] = [
      { role: 'system', content: VALENTIN_AI_PROMPT },
      { role: 'user', content }
    ];

    let aiResult: any = {};

    try {
      const aiResponse = await callAI(messages, {
        model: 'gpt-5.2',
        reasoning_effort: 'high',
        max_completion_tokens: 16000,
      });

      console.log('📝 Raw AI response:', aiResponse.output_text.substring(0, 500));

      aiResult = parseAIJson(aiResponse.output_text);
      console.log('✅ AI analysis parsed successfully');
    } catch (parseError) {
      console.error('❌ Failed to parse AI response:', parseError);
      // Return empty result - let downstream handle missing data
      aiResult = {};
    }

    // GUARDRAILS: Sanitize and validate AI output
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.57.4");
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const sanitizeEstimatedSize = (x: any, unitDefault: string, typeDefault: number) => {
      const v = Number(x?.value ?? x ?? 0);
      const u = String(x?.unit ?? unitDefault);

      if (!isFinite(v) || v <= 0) {
        return { value: typeDefault, unit: unitDefault };
      }

      // Filter phone/postal-like values
      const asStr = String(Math.round(v));
      if (asStr.length >= 6 || /^2\d{7}$/.test(asStr) || /^\d{4}$/.test(asStr)) {
        console.log(`⚠️ Filtered suspicious size value: ${asStr} (likely phone/postal)`);
        return { value: typeDefault, unit: unitDefault };
      }

      return { value: v, unit: u };
    };

    // Get profile for default values
    const { data: profile } = await supabase
      .from('pricing_profiles')
      .select('*')
      .eq('project_type', aiResult?.project?.type)
      .maybeSingle();

    if (aiResult?.project) {
      aiResult.project.estimated_size = sanitizeEstimatedSize(
        aiResult.project.estimated_size,
        profile?.unit ?? 'm2',
        profile?.average_size ?? 1
      );
    }

    // Complexity multiplier validation
    const complexityMap: Record<string, number> = {
      simple: 0.8,
      medium: 1.0,
      complex: 1.3,
      emergency: 1.5
    };

    if (!aiResult.pricing_hints) aiResult.pricing_hints = {};
    aiResult.pricing_hints.complexity_multiplier = complexityMap[aiResult.project?.complexity] ?? 1.0;

    // Customer supplied heuristics + basement signal
    const text = cleanContent.toLowerCase();
    if (!aiResult.signals) aiResult.signals = {};

    // Default: common items are customer supplied (unless VVS numbers mentioned)
    let suppliedItems = ['wc_bowl', 'flush_plate', 'faucets'];

    // If customer provides VVS numbers, nothing is customer supplied
    if (/\b(vvs[- ]?nr|vvs[- ]?nummer|ean|varenr)\b/.test(text)) {
      suppliedItems = [];
    }

    aiResult.signals.customer_supplied = normalizeCustomerSupplied(
      aiResult.signals.customer_supplied || suppliedItems
    );

    // Basement detection
    aiResult.signals.basement = /\bkælder\b/.test(text) ||
      aiResult.project?.description?.toLowerCase?.().includes('kælder') ||
      aiResult.signals.basement === true;

    // Enhance the AI result with additional logic
    const enhanced = enhanceAnalysis(aiResult, emailContent);

    console.log('✅ Enhanced analysis result:', JSON.stringify(enhanced, null, 2).substring(0, 500));

    // Save analysis to cases.extracted_data
    if (caseId) {
      const { error: updateError } = await supabase
        .from('cases')
        .update({
          extracted_data: enhanced,
          status: 'analyzed'
        })
        .eq('id', caseId);

      if (updateError) {
        console.warn('⚠️ Failed to save analysis to case:', updateError);
      } else {
        console.log('✅ Analysis saved to case:', caseId);
      }
    }

    return ok(enhanced);

  } catch (error) {
    console.error('💥 AI Analysis error:', error);
    return err(error);
  }
});

function enhanceAnalysis(ai: any, email: string) {
  ai = ai || {};
  ai.project = ai.project || {};
  const text = (email || '').toLowerCase();

  // Extract size from text patterns (12 m2 / 12m² / 12 meter)
  const sizeMatch = text.match(/(\d+(?:[\.,]\d+)?)\s*(m2|m²|meter|metre|kvadratmeter)/i);

  if (!ai.project.estimated_size || !ai.project.estimated_size.value) {
    if (sizeMatch) {
      ai.project.estimated_size = {
        value: parseFloat(sizeMatch[1].replace(',', '.')),
        unit: /m2|m²|kvadrat/.test(sizeMatch[2]) ? 'm2' : 'meter'
      };
    } else {
      // Fallback: use project type averages with modifiers
      const projectConfig = getProjectConfig(ai.project.type || 'service_call');
      let multiplier = 1.0;

      if (text.includes('lille') || text.includes('small')) multiplier = 0.7;
      if (text.includes('stor') || text.includes('stort') || text.includes('large')) multiplier = 1.4;
      if (text.includes('hele') || text.includes('komplet')) multiplier = 1.5;

      ai.project.estimated_size = {
        value: Math.round((projectConfig.averageSize || 1) * multiplier),
        unit: projectConfig.unit || 'job'
      };
    }
  }

  // Validate and fix size unit mismatch for project types
  if (ai.project.type === 'district_heating') {
    ai.project.estimated_size = { value: 1, unit: 'connection' };
  }

  if (ai.project.type === 'pipe_installation' && ai.project.estimated_size?.unit !== 'meter') {
    ai.project.estimated_size.unit = 'meter';
    if (ai.project.estimated_size.value > 100) {
      ai.project.estimated_size.value = Math.min(ai.project.estimated_size.value, 50);
    }
  }

  // Enhance complexity detection
  if (!ai.project.complexity) ai.project.complexity = 'medium';
  if (text.includes('gammel') || text.includes('196') || text.includes('197')) {
    ai.project.complexity = 'complex';
    if (!ai.signals) ai.signals = {};
    ai.signals.old_building = true;
  }
  if (text.includes('kælder') || text.includes('krybekælder')) {
    ai.project.complexity = 'complex';
  }
  if (text.includes('akut') || text.includes('haster') || text.includes('læk')) {
    ai.project.complexity = 'emergency';
    ai.project.urgency = 'emergency';
  }

  // Calculate pricing hints
  ai.pricing_hints = ai.pricing_hints || {};
  const complexityMultipliers: Record<string, number> = {
    simple: 0.8,
    medium: 1.0,
    complex: 1.3,
    emergency: 1.5
  };
  ai.pricing_hints.complexity_multiplier = complexityMultipliers[ai.project.complexity] || 1.0;

  // Base hours estimate for UI display (actual calculation in calculate-quote)
  const projectConfig = getProjectConfig(ai.project.type);
  const sizeValue = ai.project.estimated_size?.value || 1;
  const estimatedHours = projectConfig.baseHours * sizeValue / (projectConfig.averageSize || 1);

  ai.pricing_hints.base_hours_estimate = Math.round(estimatedHours * ai.pricing_hints.complexity_multiplier * 2) / 2;

  return ai;
}

function getProjectConfig(type: string) {
  const configs: Record<string, { baseHours: number; unit: string; averageSize: number }> = {
    bathroom_renovation: { baseHours: 8, unit: "m2", averageSize: 10 },
    kitchen_plumbing: { baseHours: 4, unit: "m2", averageSize: 8 },
    pipe_installation: { baseHours: 0.7, unit: "meter", averageSize: 15 },
    district_heating: { baseHours: 16, unit: "connection", averageSize: 1 },
    floor_heating: { baseHours: 1.5, unit: "m2", averageSize: 35 },
    radiator_installation: { baseHours: 4, unit: "units", averageSize: 3 },
    service_call: { baseHours: 3, unit: "job", averageSize: 1 }
  };
  return configs[type] || configs.service_call;
}
