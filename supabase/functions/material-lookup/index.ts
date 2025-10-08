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

interface MaterialLine {
  product_code: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  validated: boolean;
  component: string;
  category: string;
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

// Map BOM-linjer til faktiske produkter
async function mapBOMToProducts(supabase: any, bom: BomLine[]): Promise<MaterialLine[]> {
  const out: MaterialLine[] = [];
  
  for (const comp of bom) {
    const p = await searchProductForComponent(supabase, comp);
    const q = Number(comp.quantity);
    
    if (p && p.unit_price_norm) {
      const code = p.vvs_number || p.supplier_item_id || p.ean_id || comp.component;
      const desc = p.short_description || p.long_description || comp.component;
      const price = Number(p.unit_price_norm);
      
      out.push({
        product_code: String(code),
        description: String(desc),
        quantity: q,
        unit: comp.unit,
        unit_price: price,
        total_price: q * price,
        validated: true,
        component: comp.component,
        category: comp.category
      });
    } else {
      // Fallback til kategori-median
      const fallback = await categoryMedianPrice(supabase, comp.category);
      
      out.push({
        product_code: comp.component,
        description: comp.component,
        quantity: q,
        unit: comp.unit,
        unit_price: fallback,
        total_price: q * fallback,
        validated: false,
        component: comp.component,
        category: comp.category
      });
    }
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

    // 2) Map BOM til produkter
    const mapped = await mapBOMToProducts(supabase, bom);
    
    // 3) Summér
    let totalMaterialCost = mapped.reduce((s, m) => s + m.total_price, 0);
    
    console.log(`Mapped materials total: ${totalMaterialCost} kr`);

    // 4) Hent gulv og håndhæv det
    const { data: floorRow } = await supabase
      .from('material_floors')
      .select('*')
      .eq('project_type', projectType)
      .single();
    
    const matFloor = getMaterialFloor(projectType, estimatedSize, floorRow);
    
    let floorApplied = false;
    if (totalMaterialCost < matFloor) {
      console.log(`Material total ${totalMaterialCost} below floor ${matFloor}, applying floor`);
      
      // Hæv alle materialer proportionalt
      const factor = matFloor / totalMaterialCost;
      mapped.forEach(m => {
        m.unit_price = m.unit_price * factor;
        m.total_price = m.quantity * m.unit_price;
      });
      
      totalMaterialCost = matFloor;
      floorApplied = true;
    }

    // 5) Returnér itemiseret svar
    return new Response(JSON.stringify({
      materials: mapped,
      total_cost: totalMaterialCost,
      project_type: projectType,
      estimated_size: estimatedSize,
      mode: 'bom_first',
      floor_applied: floorApplied,
      material_floor: matFloor,
      validated_count: mapped.filter(m => m.validated).length,
      total_count: mapped.length
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
