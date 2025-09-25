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
    const { projectType, projectDescription, estimatedSize, complexity } = await req.json();
    
    console.log(`Material lookup for: ${projectType}, size: ${estimatedSize}, complexity: ${complexity}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get relevant products from supplier_prices
    const { data: products, error } = await supabase
      .from('supplier_prices')
      .select('*')
      .eq('valentin_mapping', projectType)
      .limit(20);
    
    if (error) {
      console.error('Error fetching products:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch products' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use AI to select and calculate quantities for materials
    const prompt = `
Du er en erfaren VVS-tekniker der skal vælge materialer til et projekt.

PROJEKT DETALJER:
- Type: ${projectType}
- Beskrivelse: ${projectDescription}
- Størrelse: ${estimatedSize}
- Kompleksitet: ${complexity}

TILGÆNGELIGE PRODUKTER:
${products?.map(p => `- ${p.product_code}: ${p.description} (${p.final_price} DKK)`).join('\n')}

OPGAVE:
Vælg de vigtigste materialer til dette projekt og beregn realistiske mængder.
Svar ENDAST i JSON format:

{
  "materials": [
    {
      "product_code": "kode",
      "quantity": antal,
      "reasoning": "kort forklaring på hvorfor dette produkt og denne mængde"
    }
  ]
}

VIGTIGE RETNINGSLINJER:
- Vælg kun de mest nødvendige materialer (max 5-8 produkter)
- Beregn realistiske mængder baseret på projektets størrelse
- Inkluder IKKE arbejdsløn, kun materialer
- For gulvvarme: beregn rør-meter som 1.3x gulvareal + 20% ekstra
- For fjernvarme: 1 tilslutning = 1 komplet sæt
- For badeværelse: inkluder basis sanitets + rør
`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Du er en erfaren VVS-tekniker der hjælper med materialevalg.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1000,
        temperature: 0.3,
      }),
    });

    const aiResponse = await response.json();
    
    if (!aiResponse.choices || !aiResponse.choices[0]) {
      throw new Error('Invalid AI response');
    }

    let materialSelection;
    try {
      materialSelection = JSON.parse(aiResponse.choices[0].message.content);
    } catch (e) {
      console.error('Failed to parse AI response:', aiResponse.choices[0].message.content);
      throw new Error('Failed to parse material selection');
    }

    // Calculate total cost and build detailed response
    const selectedMaterials = materialSelection.materials.map((item: any) => {
      const product = products?.find(p => p.product_code === item.product_code);
      if (!product) return null;
      
      return {
        product_code: product.product_code,
        description: product.description,
        quantity: item.quantity,
        unit_price: product.final_price,
        total_price: product.final_price * item.quantity,
        reasoning: item.reasoning,
        supplier_id: product.supplier_id
      };
    }).filter(Boolean);

    const totalMaterialCost = selectedMaterials.reduce((sum: number, item: any) => sum + item.total_price, 0);

    console.log(`Material lookup completed: ${selectedMaterials.length} materials, total: ${totalMaterialCost} DKK`);

    return new Response(JSON.stringify({
      materials: selectedMaterials,
      total_cost: totalMaterialCost,
      project_type: projectType,
      estimated_size: estimatedSize
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in material-lookup function:', error);
    return new Response(JSON.stringify({ 
      error: (error as any).message,
      materials: [],
      total_cost: 0
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});