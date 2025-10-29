// ROBUST MATERIAL LOOKUP - BOM-First with Component Catalog
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { generateProjectBOM, BomLine } from '../shared/bom-generator.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map BOM til komponenter (NET priser fra DB eller fallback)
async function mapBOMToProductsNet(supabase: any, bom: BomLine[]): Promise<any[]> {
  const out: any[] = [];
  
  for (const comp of bom) {
    // Hent komponent fra catalog
    const { data: component } = await supabase
      .from('components')
      .select('*')
      .eq('key', comp.componentKey)
      .maybeSingle();
    
    const netPrice = Number(component?.net_price ?? 0);
    
    out.push({
      component_key: comp.componentKey,
      product_code: component?.supplier_sku || comp.componentKey,
      description: component?.notes || comp.componentKey,
      quantity: comp.qty,
      unit: comp.unit,
      net_unit_price: netPrice,
      net_total_price: netPrice * comp.qty,
      customer_supplied: !!comp.customerSupplied
    });
  }
  
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectType, estimatedSize, signals = {}, complexity } = await req.json();
    
    console.log(`🔧 Material lookup: ${projectType}, size=${estimatedSize}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Generér BOM
    const bom = generateProjectBOM(projectType, estimatedSize, complexity || 'medium', signals);
    console.log(`Generated BOM with ${bom.length} components`);

    // Map til produkter
    const materialsNet = await mapBOMToProductsNet(supabase, bom);
    const netTotal = materialsNet.reduce((s, m) => s + m.net_total_price, 0);
    
    console.log(`✅ Materials NET total: ${netTotal.toFixed(2)} kr`);

    return new Response(JSON.stringify({
      materials_net: materialsNet,
      net_total_cost: netTotal,
      project_type: projectType,
      estimated_size: estimatedSize
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Material lookup error:', error);
    return new Response(JSON.stringify({ 
      error: 'Material lookup failed',
      details: (error as any)?.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
