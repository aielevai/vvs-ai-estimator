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

    // For now, return a simplified fallback until full AI integration is ready
    console.log(`Simple material lookup for: ${projectType}, size: ${estimatedSize}`);

    // Simple fallback material selection based on project type
    const simpleMaterials = [
      {
        product_code: `${projectType.toUpperCase()}_001`,
        description: `Standard materialer til ${projectType.replace('_', ' ')}`,
        quantity: estimatedSize || 1,
        unit_price: 150,
        total_price: (estimatedSize || 1) * 150,
        reasoning: 'Standard materialepris',
        supplier_id: 'ahlsell'
      }
    ];

    const totalMaterialCost = simpleMaterials.reduce((sum: number, item: any) => sum + item.total_price, 0);

    console.log(`Simple material lookup completed: ${simpleMaterials.length} materials, total: ${totalMaterialCost} DKK`);

    return new Response(JSON.stringify({
      materials: simpleMaterials,
      total_cost: totalMaterialCost,
      project_type: projectType,
      estimated_size: estimatedSize,
      mode: 'simplified'
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