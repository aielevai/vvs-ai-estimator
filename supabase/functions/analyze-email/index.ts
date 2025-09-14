import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALENTIN_AI_PROMPT = `
Du er VVS-ekspert for Valentin VVS ApS, trænet på 800+ projekter.
Returnér KUN gyldig JSON (uden kommentarer) med felterne beskrevet nedenfor.

SPECIALER:
- Standard VVS, Service, Varme (fjern/gulv), m.m.

STØRRELSER (typisk):
- Bad: 8-15 m² • Køkken: 4-8 m² • Rør: 5-50 m • Gulvvarme: 20-150 m²

KOMPLEKSITET:
- simple, medium, complex (gamle anlæg før 1980, kælder/krybekælder), emergency

NØGLEORD → STØRRELSE:
- "lille/small" = 70% af gennemsnit
- "stor/stort/large" = 140%
- "hele/komplet" = 150%

UDFALD skal være præcis JSON struktur:
{
  "customer": {
    "name": "Kunde navn",
    "email": "email@domain.dk",
    "phone": "12345678",
    "address": "Adresse",
    "customer_type": "private"
  },
  "project": {
    "type": "bathroom_renovation",
    "description": "Beskrivelse af projekt",
    "estimated_size": 12,
    "size_unit": "m2",
    "complexity": "medium",
    "urgency": "normal",
    "location_details": "Yderligere placering"
  },
  "pricing_hints": {
    "base_hours_estimate": 96,
    "complexity_multiplier": 1.0,
    "material_complexity": "standard"
  }
}

PROJECT TYPES (brug kun disse):
- bathroom_renovation
- kitchen_plumbing
- pipe_installation
- district_heating
- floor_heating
- radiator_installation
- service_call

COMPLEXITY (brug kun disse):
- simple
- medium
- complex
- emergency

URGENCY (brug kun disse):
- normal
- urgent
- emergency
`;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { emailContent, subject } = await req.json();
    
    if (!emailContent) {
      return new Response(
        JSON.stringify({ error: 'Email content required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Analyzing email with GPT-5:', { subject, contentLength: emailContent.length });

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const content = `EMNE: ${subject || 'Ingen emne'}\nINDHOLD:\n${emailContent}`;

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

    // Enhance the AI result with additional logic
    const enhanced = enhanceAnalysis(aiResult as any, emailContent);

    console.log('Enhanced analysis result:', enhanced);

    return new Response(
      JSON.stringify(enhanced),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('AI Analysis error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'AI analysis failed', 
        details: error?.message || 'Unknown error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
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

  // Calculate pricing hints
  ai.pricing_hints = ai.pricing_hints || {};
  const complexityMultipliers = { simple: 0.8, medium: 1.0, complex: 1.3, emergency: 1.5 };
  ai.pricing_hints.complexity_multiplier = complexityMultipliers[ai.project.complexity] || 1.0;

  const projectConfig = getProjectConfig(ai.project.type);
  let hours = (projectConfig.baseHours || 3) * (ai.project.estimated_size || 1);
  if (projectConfig.additionalPerUnit) {
    hours += projectConfig.additionalPerUnit * (ai.project.estimated_size || 1);
  }
  hours = Math.round(hours * ai.pricing_hints.complexity_multiplier * 2) / 2;
  
  ai.pricing_hints.base_hours_estimate = hours;
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