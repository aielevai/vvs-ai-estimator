import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, handleOptions, normalizeCustomerSupplied } from "../_shared/http.ts";

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

const VALENTIN_AI_PROMPT = `Du er VVS-ekspert for Valentin VVS ApS og skal analysere kundeforespørgsler for at identificere specifikke materialer og komponenter.

Analyser denne email grundigt og returner struktureret JSON med:

1. **customer**: Navn, email, telefon, adresse, customer_type (private/business/contractor)

2. **project**: 
   - type: bathroom_renovation, kitchen_plumbing, pipe_installation, district_heating, floor_heating, radiator_installation, service_call
   - description: Detaljeret beskrivelse af arbejdet
   - estimated_size: { value: NUMERISK, unit: "m2"|"meter"|"stk" }
   - complexity: simple, medium, complex, emergency
   - urgency: normal, urgent, emergency
   
3. **signals**:
   - basement: boolean (kælder)
   - elevator: boolean (elevator til adgang)
   - floor: number (etage)
   - customer_supplied: array of strings (["wc_bowl", "flush_plate", "faucet_basin", "faucet_shower"])
   - ceiling_height: number (loftshøjde i meter)
   - difficult_access: boolean

3. **materiale_analyse**: 
   - specifikke_komponenter: Array af objekter med {komponent: string, mængde: number, enhed: string, specifikationer: string}
   - tekniske_krav: Array af tekniske specifikationer (diameter, kapacitet, type, etc.)
   - kvalitetsniveau: basic, standard, premium
   - særlige_behov: Array af særlige materialer eller komponenter

4. **pricing_hints**:
   - base_hours_estimate: Forventet arbejdstimer
   - complexity_multiplier: 1.0-3.0 
   - material_complexity: standard, medium, high

**Eksempel på specifikke_komponenter:**
[
  {komponent: "Gulvvarmerør", mængde: 80, enhed: "meter", specifikationer: "16mm PEX-rør"},
  {komponent: "Radiatorer", mængde: 5, enhed: "stk", specifikationer: "600x800mm, hvid"},
  {komponent: "Termostatventiler", mængde: 5, enhed: "stk", specifikationer: "Danfoss RA-N"}
]

**Vigtige regler:**
- IDENTIFICER ALTID specifikke komponenter når muligt
- Vær præcis med mængder og specifikationer
- Brug DANSK terminologi og beskrivelser
- Vær konservativ med kompleksitet og timer
- Inkluder tekniske detaljer som diametre, dimensioner, typer

Returner KUN valid JSON - ingen anden tekst.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();

  try {
    const { emailContent, subject } = await req.json();
    
    if (!emailContent) {
      return err('Email content required', 400);
    }

    console.log('Analyzing email with GPT-5:', { subject, contentLength: emailContent.length });

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Fix encoding in email content before sending to AI
    const cleanSubject = fixEncoding(subject || 'Ingen emne');
    const cleanContent = fixEncoding(emailContent);
    
    const content = `EMNE: ${cleanSubject}\nINDHOLD:\n${cleanContent}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-2025-08-07',
        max_completion_tokens: 12000,
        messages: [
          { role: 'system', content: VALENTIN_AI_PROMPT },
          { role: 'user', content }
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', response.status, errorData);
      throw new Error(`OpenAI API error: ${response.status} ${errorData}`);
    }

    const completion = await response.json();
    let aiResult = {};

    try {
      const aiContent = completion.choices[0].message?.content || '{}';
      console.log('Raw AI response:', aiContent);
      aiResult = JSON.parse(aiContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      aiResult = {};
    }

    // FASE 6: Guardrails og sanitering
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
      
      // Filtrer telefon/postnr-lignende værdier
      const asStr = String(Math.round(v));
      if (asStr.length >= 6 || /^2\d{7}$/.test(asStr) || /^\d{4}$/.test(asStr)) {
        console.log(`Filtered suspicious size value: ${asStr} (likely phone/postal)`);
        return { value: typeDefault, unit: unitDefault };
      }
      
      return { value: v, unit: u };
    };

    // Hent profil for default værdier
    const { data: profile } = await supabase
      .from('pricing_profiles')
      .select('*')
      .eq('project_type', (aiResult as any).project?.type)
      .single();

    if ((aiResult as any).project) {
      (aiResult as any).project.estimated_size = sanitizeEstimatedSize(
        (aiResult as any).project.estimated_size,
        profile?.unit ?? 'm2',
        profile?.average_size ?? 1
      );
    }

    // Complexity multiplier
    const complexityMap: Record<string, number> = {
      simple: 0.8,
      medium: 1.0,
      complex: 1.3,
      emergency: 1.5
    };
    
    if (!(aiResult as any).pricing_hints) (aiResult as any).pricing_hints = {};
    (aiResult as any).pricing_hints.complexity_multiplier = complexityMap[(aiResult as any).project?.complexity] ?? 1.0;

    // Kundeleveret heuristik + kælder-signal
    const text = cleanContent.toLowerCase();
    if (!(aiResult as any).signals) (aiResult as any).signals = {};
    
    // Default: alle kundeleveret (som array)
    let suppliedItems = ['wc_bowl', 'flush_plate', 'faucets'];
    
    // Hvis kunden faktisk giver VVS-nr, slår vi kundeleveret fra
    if (/\b(vvs[- ]?nr|vvs[- ]?nummer|ean|varenr)\b/.test(text)) {
      suppliedItems = [];  // Ingenting er kundeleveret
    }
    
    // Normaliser for sikkerhed (i tilfælde AI returnerer objekt)
    (aiResult as any).signals.customer_supplied = normalizeCustomerSupplied(suppliedItems);
    
    (aiResult as any).signals.basement = /\bkælder\b/.test(text) || 
      (aiResult as any).project?.description?.toLowerCase?.().includes('kælder');

    // Enhance the AI result with additional logic
    const enhanced = enhanceAnalysis(aiResult as any, emailContent);

    console.log('Enhanced analysis result:', enhanced);

    return ok(enhanced);

  } catch (error) {
    console.error('AI Analysis error:', error);
    return err(error);
  }
});

function enhanceAnalysis(ai: any, email: string) {
  ai = ai || {};
  ai.project = ai.project || {};
  const text = (email || '').toLowerCase();

  // Extract size from text patterns (12 m2 / 12m² / 12 meter)
  const sizeMatch = text.match(/(\d+(?:[\.,]\d+)?)\s*(m2|m²|meter|metre|kvadratmeter)/i);
  
  if (!ai.project.estimated_size) {
    if (sizeMatch) {
      ai.project.estimated_size = parseFloat(sizeMatch[1].replace(',', '.'));
      ai.project.size_unit = /m2|m²|kvadrat/.test(sizeMatch[2]) ? 'm2' : 'meter';
    } else {
      // Fallback: use project type averages with modifiers
      const projectConfig = getProjectConfig(ai.project.type || 'service_call');
      let multiplier = 1.0;
      
      if (text.includes('lille') || text.includes('small')) multiplier = 0.7;
      if (text.includes('stor') || text.includes('stort') || text.includes('large')) multiplier = 1.4;
      if (text.includes('hele') || text.includes('komplet')) multiplier = 1.5;
      
      ai.project.estimated_size = Math.round((projectConfig.averageSize || 1) * multiplier);
      ai.project.size_unit = projectConfig.unit || 'job';
    }
  }

  // Validate and fix size unit mismatch for project types
  if (ai.project.type === 'district_heating' && ai.project.size_unit !== 'connection') {
    ai.project.estimated_size = 1; // Always 1 connection for district heating
    ai.project.size_unit = 'connection';
  }
  
  if (ai.project.type === 'pipe_installation' && ai.project.size_unit !== 'meter') {
    ai.project.size_unit = 'meter';
    // If size seems too large for pipe work, cap it
    if (ai.project.estimated_size > 100) {
      ai.project.estimated_size = Math.min(ai.project.estimated_size, 50);
    }
  }

  // Enhance complexity detection
  if (!ai.project.complexity) ai.project.complexity = 'medium';
  if (text.includes('gammel') || text.includes('196') || text.includes('197')) {
    ai.project.complexity = 'complex';
  }
  if (text.includes('kælder') || text.includes('krybekælder')) {
    ai.project.complexity = 'complex';
  }
  if (text.includes('akut') || text.includes('haster') || text.includes('læk')) {
    ai.project.complexity = 'emergency';
    ai.project.urgency = 'emergency';
  }

  // Calculate pricing hints - simplified, actual calculation happens in calculate-quote
  ai.pricing_hints = ai.pricing_hints || {};
  const complexityMultipliers = { simple: 0.8, medium: 1.0, complex: 1.3, emergency: 1.5 };
  ai.pricing_hints.complexity_multiplier = (complexityMultipliers as any)[ai.project.complexity] || 1.0;

  // Store basic estimate for UI display, but don't do full calculation here
  // The actual calculation with historical calibration happens in calculate-quote
  const projectConfig = getProjectConfig(ai.project.type);
  const estimatedHours = projectConfig.baseHours * (ai.project.estimated_size || 1) / (projectConfig.averageSize || 1);
  
  ai.pricing_hints.base_hours_estimate = Math.round(estimatedHours * ai.pricing_hints.complexity_multiplier * 2) / 2;
  ai.pricing_hints.material_complexity = ai.project.complexity === 'complex' ? 'high' : 'standard';

  return ai;
}

function getProjectConfig(type: string) {
  const configs = {
    bathroom_renovation: { baseHours: 8, unit: "m2", averageSize: 10 },
    kitchen_plumbing: { baseHours: 4, unit: "m2", averageSize: 8 },
    pipe_installation: { baseHours: 0.7, unit: "meter", averageSize: 15 },
    district_heating: { baseHours: 16, unit: "connection", averageSize: 1, additionalPerUnit: 0.5 },
    floor_heating: { baseHours: 1.5, unit: "m2", averageSize: 35 },
    radiator_installation: { baseHours: 4, unit: "units", averageSize: 3 },
    service_call: { baseHours: 3, unit: "job", averageSize: 1 }
  };
  return configs[type as keyof typeof configs] || configs.service_call;
}