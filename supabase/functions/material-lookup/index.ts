import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectType, projectDescription, estimatedSize, complexity, materialeAnalyse } = await req.json();
    
    console.log(`AI Material lookup for: ${projectType}, size: ${estimatedSize}, complexity: ${complexity}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY')!;
    
    if (!openAIApiKey) {
      console.error('OpenAI API key not found');
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get relevant products from supplier_prices using intelligent search
    const searchTerms = getSearchTermsForProject(projectType, materialeAnalyse);
    console.log(`Searching for products with terms: ${searchTerms.join(', ')}`);
    
    const { data: products, error } = await supabase
      .from('supplier_prices')
      .select('*')
      .or(searchTerms.map(term => `description.ilike.%${term}%`).join(','))
      .limit(100);
    
    if (error) {
      console.error('Error fetching products:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch products' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${products?.length || 0} potential products`);

    // Use AI to intelligently select and calculate materials
    const aiPrompt = createMaterialSelectionPrompt(projectType, projectDescription, estimatedSize, complexity, materialeAnalyse, products || []);
    
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-2025-08-07',
        messages: [
          {
            role: 'system',
            content: 'Du er en ekspert VVS-materialespecialist der vælger de rette produkter og beregner præcise mængder til VVS-projekter.'
          },
          {
            role: 'user',
            content: aiPrompt
          }
        ],
        max_completion_tokens: 2000
      }),
    });

    if (!aiResponse.ok) {
      console.error('OpenAI API error:', await aiResponse.text());
      throw new Error('Failed to get AI material analysis');
    }

    const aiData = await aiResponse.json();
    let aiMaterials;
    
    try {
      const content = aiData.choices[0].message.content.trim();
      console.log('Raw AI response content:', content);
      
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      const jsonContent = jsonMatch ? jsonMatch[1] : content;
      
      aiMaterials = JSON.parse(jsonContent);
      console.log('Successfully parsed AI materials:', aiMaterials);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiData.choices[0].message.content);
      throw new Error('Invalid AI response format');
    }

    // Validate and enhance the AI response
    const validatedMaterials = validateAndEnhanceMaterials(aiMaterials, products || [], projectType, estimatedSize);
    
    const totalMaterialCost = validatedMaterials.reduce((sum: number, item: any) => sum + (item.total_price || 0), 0);

    console.log(`AI material lookup completed: ${validatedMaterials.length} materials, total: ${totalMaterialCost} DKK`);

    return new Response(JSON.stringify({
      materials: validatedMaterials,
      total_cost: totalMaterialCost,
      project_type: projectType,
      estimated_size: estimatedSize,
      mode: 'ai_optimized',
      ai_reasoning: aiMaterials.reasoning || 'AI-baseret materialevurdering'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in material-lookup function:', error);
    
    // Fallback to simple calculation if AI fails
    const { projectType, estimatedSize } = await req.json().catch(() => ({ projectType: 'service_call', estimatedSize: 1 }));
    const fallbackMaterials = createFallbackMaterials(projectType, estimatedSize);
    const fallbackCost = fallbackMaterials.reduce((sum: number, item: any) => sum + item.total_price, 0);
    
    return new Response(JSON.stringify({ 
      materials: fallbackMaterials,
      total_cost: fallbackCost,
      mode: 'fallback',
      error: `AI error: ${(error as any).message}`
    }), {
      status: 200, // Return 200 with fallback instead of error
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function getSearchTermsForProject(projectType: string, materialeAnalyse?: any): string[] {
  const baseTerms: Record<string, string[]> = {
    'bathroom_renovation': ['bad', 'toilet', 'bruser', 'vask', 'gulv', 'varme', 'rør', 'ventil'],
    'kitchen_plumbing': ['køkken', 'vask', 'opvask', 'rør', 'ventil', 'sifon'],
    'floor_heating': ['gulvvarme', 'varmerør', 'fordeler', 'termostat', 'isolering'],
    'radiator_installation': ['radiator', 'varme', 'ventil', 'termostat', 'rør'],
    'pipe_installation': ['rør', 'fittings', 'ventil', 'kobling'],
    'district_heating': ['fjernvarme', 'veksler', 'ventil', 'isolering'],
    'service_call': ['service', 'reparation', 'dele', 'ventil']
  };

  let terms = baseTerms[projectType] || ['rør', 'ventil', 'fittings'];
  
  // Add specific components if available
  if (materialeAnalyse?.specifikke_komponenter) {
    materialeAnalyse.specifikke_komponenter.forEach((comp: any) => {
      if (comp.komponent) {
        terms.push(comp.komponent.toLowerCase());
      }
    });
  }

  return [...new Set(terms)]; // Remove duplicates
}

function createMaterialSelectionPrompt(projectType: string, description: string, size: number, complexity: string, materialeAnalyse: any, products: any[]): string {
  return `Som VVS-ekspert skal du vælge de rigtige materialer til dette projekt:

PROJEKT:
Type: ${projectType}
Beskrivelse: ${description}
Størrelse: ${size}
Kompleksitet: ${complexity}

MATERIALE ANALYSE:
${JSON.stringify(materialeAnalyse, null, 2)}

TILGÆNGELIGE PRODUKTER (${products.length} produkter):
${products.slice(0, 50).map(p => `- ${p.product_code}: ${p.description} (${p.final_price} DKK)`).join('\n')}

OPGAVE:
Vælg de nødvendige materialer og beregn præcise mængder. Returner JSON med:

{
  "materials": [
    {
      "product_code": "eksakt kode fra listen",
      "description": "produktbeskrivelse",
      "quantity": antal_baseret_på_projektstørrelse,
      "unit_price": pris_fra_produktliste,
      "total_price": quantity * unit_price,
      "reasoning": "hvorfor dette produkt og denne mængde",
      "category": "kategori (rør/ventiler/radiatorer/etc)"
    }
  ],
  "reasoning": "samlet begrundelse for materialevalgene"
}

REGLER:
1. Brug KUN product_codes fra den givne liste
2. Beregn realistiske mængder baseret på projektstørrelse
3. Vælg kvalitetsprodukter til prisen
4. Inkluder alle nødvendige komponenter (hovedmaterialer + tilbehør)
5. Maksimer værdi for pengene
6. Husk sikkerhedsmargin på mængder (10-15%)

Returner KUN valid JSON.`;
}

function validateAndEnhanceMaterials(aiMaterials: any, products: any[], projectType: string, estimatedSize: number): any[] {
  if (!aiMaterials.materials || !Array.isArray(aiMaterials.materials)) {
    console.error('Invalid AI materials format');
    return createFallbackMaterials(projectType, estimatedSize);
  }

  const validatedMaterials = aiMaterials.materials.map((material: any) => {
    // Find matching product to validate price
    const matchingProduct = products.find(p => p.product_code === material.product_code);
    
    if (matchingProduct) {
      return {
        ...material,
        unit_price: matchingProduct.final_price || matchingProduct.base_price || material.unit_price,
        total_price: material.quantity * (matchingProduct.final_price || matchingProduct.base_price || material.unit_price),
        supplier_id: matchingProduct.supplier_id || 'ahlsell',
        validated: true
      };
    } else {
      // Product not found, use AI suggestion but mark as unvalidated
      return {
        ...material,
        validated: false,
        supplier_id: 'unknown'
      };
    }
  });

  // Quality assurance checks
  const totalCost = validatedMaterials.reduce((sum: number, m: any) => sum + (m.total_price || 0), 0);
  const averageCostPerUnit = totalCost / estimatedSize;
  
  // Sanity check: if cost seems unrealistic, add warning
  if (averageCostPerUnit > 5000) {
    console.warn(`High material cost detected: ${averageCostPerUnit} DKK per unit`);
  }

  return validatedMaterials;
}

function createFallbackMaterials(projectType: string, estimatedSize: number): any[] {
  const fallbackMaterials: Record<string, any[]> = {
    'floor_heating': [
      {
        product_code: 'FALLBACK_FH_001',
        description: 'Gulvvarmerør PEX 16mm',
        quantity: Math.ceil(estimatedSize * 8), // 8m per m²
        unit_price: 12,
        total_price: Math.ceil(estimatedSize * 8) * 12,
        reasoning: 'Standard gulvvarmerør beregning',
        category: 'rør',
        supplier_id: 'fallback'
      }
    ],
    'radiator_installation': [
      {
        product_code: 'FALLBACK_RAD_001',
        description: 'Standard radiator 600x800mm',
        quantity: Math.max(1, Math.ceil(estimatedSize / 15)), // 1 radiator per 15m²
        unit_price: 800,
        total_price: Math.max(1, Math.ceil(estimatedSize / 15)) * 800,
        reasoning: 'Standard radiator beregning',
        category: 'radiatorer',
        supplier_id: 'fallback'
      }
    ]
  };

  return fallbackMaterials[projectType] || [
    {
      product_code: 'FALLBACK_GEN_001',
      description: `Standard materialer til ${projectType.replace('_', ' ')}`,
      quantity: estimatedSize || 1,
      unit_price: 150,
      total_price: (estimatedSize || 1) * 150,
      reasoning: 'Generisk fallback materialepris',
      category: 'diverse',
      supplier_id: 'fallback'
    }
  ];
}