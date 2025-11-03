// ROBUST MATERIAL LOOKUP - BOM-First with Component Catalog
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateProjectBOM, BomLine } from '../shared/bom-generator.ts';
import { ok, err, handleOptions, normalizeCustomerSupplied } from "../_shared/http.ts";
import { supabaseAdmin } from '../_shared/supabase.ts';

// Map BOM til komponenter (NET priser fra DB)
async function mapBOMToProductsNet(bom: BomLine[]): Promise<any[]> {
  const out: any[] = [];
  
  for (const comp of bom) {
    // Hent komponent fra catalog (brug 'key' som match-felt)
    const { data: component } = await supabaseAdmin
      .from('components')
      .select('key, supplier_sku, notes, net_price, unit')
      .eq('key', comp.componentKey)
      .maybeSingle();
    
    const netPrice = Number(component?.net_price ?? 0);
    
    out.push({
      component_key: comp.componentKey,
      product_code: component?.supplier_sku || comp.componentKey,
      description: component?.notes || comp.componentKey,
      quantity: comp.qty,
      unit: component?.unit || comp.unit || 'stk',
      net_unit_price: netPrice,
      net_total_price: netPrice * comp.qty,
      customer_supplied: !!comp.customerSupplied,
      source: 'bom'
    });
  }
  
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();

  try {
    const { projectType, estimatedSize, signals = {}, complexity } = await req.json();
    
    // Normaliser customer_supplied til array
    const normalizedSignals = { 
      ...signals, 
      customer_supplied: normalizeCustomerSupplied(signals.customer_supplied) 
    };
    
    console.log(`🔧 Material lookup: ${projectType}, size=${estimatedSize}`);

    // Generér BOM med normaliserede signals
    const bom = generateProjectBOM(projectType, estimatedSize, complexity || 'medium', normalizedSignals);
    console.log(`Generated BOM with ${bom.length} components`);

    // Map til produkter med NET-priser fra components-tabellen
    const materialsNet = await mapBOMToProductsNet(bom);
    const netTotal = materialsNet.reduce((s, m) => s + m.net_total_price, 0);
    
    console.log(`✅ Materials NET total: ${netTotal.toFixed(2)} kr`);

    return ok({
      materials_net: materialsNet,
      net_total_cost: netTotal,
      project_type: projectType,
      estimated_size: estimatedSize
    });

  } catch (error) {
    console.error('❌ Material lookup error:', error);
    return err(error);
  }
});
