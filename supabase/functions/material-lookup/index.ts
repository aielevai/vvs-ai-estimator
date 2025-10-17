// FASE 4: Material-lookup refaktorering - BOM-først approach
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { generateProjectBOM, getMaterialFloor, BomLine } from '../shared/bom-generator.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProductRow {
  supplier_item_id?: string;
  vvs_number?: string;
  ean_id?: string;
  category?: string;
  short_description?: string;
  long_description?: string;
  unit_price_norm?: number;
  normalized_text?: string;
  unit?: string;
  price_unit?: string;
}

interface MaterialLineNet {
  product_code: string;
  description: string;
  quantity: number;
  unit: string;
  net_unit_price: number;
  net_total_price: number;
  validated: boolean;
  component: string;
  category: string;
  customer_supplied?: boolean;
}

// Søg produkt for specifik BOM-komponent
async function searchProductForComponent(supabase: any, comp: BomLine): Promise<ProductRow | null> {
  const q = comp.component.toLowerCase();
  
  const { data } = await supabase
    .from('enhanced_supplier_prices')
    .select('supplier_item_id,vvs_number,ean_id,category,short_description,long_description,unit_price_norm,normalized_text,unit,price_unit')
    .ilike('normalized_text', `%${q}%`)
    .not('unit_price_norm', 'is', null)
    .gt('unit_price_norm', 0)
    .order('unit_price_norm', { ascending: true })
    .limit(10);
  
  return (data && data[0]) || null;
}

// Hent median pris for kategori som fallback
async function categoryMedianPrice(supabase: any, category: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('median_unit_price_by_category', { in_category: category });
    
    if (error || !data || data.length === 0) {
      console.log(`No median found for category ${category}, using default 300`);
      return 300;
    }
    
    return Number(data[0]?.median ?? 300);
  } catch (e) {
    console.error('Error fetching median:', e);
    return 300;
  }
}

// Map BOM-linjer til faktiske produkter (NET priser)
async function mapBOMToProductsNet(supabase: any, bom: BomLine[]): Promise<MaterialLineNet[]> {
  const out: MaterialLineNet[] = [];
  
  for (const comp of bom) {
    // Kundeleveret → net 0 (men behold linjen som info)
    if (comp.customer_supplied) {
      out.push({
        product_code: comp.component,
        description: comp.component,
        quantity: comp.quantity,
        unit: comp.unit,
        net_unit_price: 0,
        net_total_price: 0,
        validated: true,
        component: comp.component,
        category: comp.category,
        customer_supplied: true
      });
      continue;
    }
    
    const p = await searchProductForComponent(supabase, comp);
    const price = Number(p?.unit_price_norm ?? await categoryMedianPrice(supabase, comp.category));
    
    out.push({
      product_code: p?.vvs_number || p?.supplier_item_id || p?.ean_id || comp.component,
      description: p?.short_description || p?.long_description || comp.component,
      quantity: comp.quantity,
      unit: comp.unit,
      net_unit_price: price,
      net_total_price: price * comp.quantity,
      validated: Boolean(p),
      component: comp.component,
      category: comp.category
    });
  }
  
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectType, estimatedSize, materialeAnalyse, complexity } = await req.json();
    
    console.log(`BOM-first material lookup: ${projectType}, size: ${estimatedSize}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1) Generér deterministisk BOM
    const signals = materialeAnalyse?.signaler || {};
    const bom = generateProjectBOM(projectType, estimatedSize, complexity || 'medium', signals);
    
    console.log(`Generated BOM with ${bom.length} components`);

    // 2) Map BOM til produkter (NET priser)
    const materialsNet = await mapBOMToProductsNet(supabase, bom);
    
    // 3) Summér NET
    const netTotal = materialsNet.reduce((s, m) => s + m.net_total_price, 0);
    
    console.log(`Mapped materials NET total: ${netTotal} kr`);

    // 5) Returnér itemiseret svar med NET priser (avance lægges på i calculate-quote)
    return new Response(JSON.stringify({
      materials_net: materialsNet,
      net_total_cost: netTotal,
      project_type: projectType,
      estimated_size: estimatedSize,
      mode: 'bom_first_net'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Material lookup error:', error);
    return new Response(JSON.stringify({ 
      error: 'Material lookup failed',
      details: (error as any)?.message || 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
