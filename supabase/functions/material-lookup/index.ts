// FASE 4: INTELLIGENT MATERIAL LOOKUP - BOM-First with AI Hybrid Search
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateProjectBOM, BomLine } from '../shared/bom-generator.ts';
import { ok, err, handleOptions, normalizeCustomerSupplied } from "../_shared/http.ts";
import { supabaseAdmin } from '../_shared/supabase.ts';

// Component key to search query mapping
const COMPONENT_SEARCH_MAP: Record<string, string> = {
  // Rør
  'pex_15': 'PEX-AL-PEX rør 15mm',
  'pex_20': 'PEX-AL-PEX rør 20mm',
  'pex_25': 'PEX-AL-PEX rør 25mm',
  'pipe_insulation_13mm': 'rørisolering 13mm',
  'pipe_insulation_18mm': 'rørisolering 18mm',
  
  // Fittings
  'pex_fitting_t': 'PEX T-kobling 16mm',
  'pex_fitting_elbow': 'PEX vinkel 90° 16mm',
  'pex_fitting_reducer': 'PEX reduktion',
  
  // Ventiler
  'ballofix': 'Ballofix kuglehane 15mm',
  'ball_valve_20mm': 'kuglehane 20mm krom',
  'radiator_valve': 'radiatorventil termostat',
  
  // Afløb
  'unidrain_line': 'UniDrain Line rendeafløb',
  'unidrain_low_outlet_ø50': 'UniDrain udløb Ø50',
  'drain_pipe_dn50': 'PP afløbsrør DN50 grå',
  'drain_pipe_dn110': 'PP afløbsrør DN110 grå',
  'trap_dn32': 'vandlås DN32',
  
  // Sanitær
  'geberit_duofix_cistern': 'Geberit DuoFix cisterne 6/3L',
  'wc_bowl': 'væghængt toilet skål hvid',
  'flush_plate': 'betjeningsplade toilet krom',
  'faucet_basin': 'håndvaskarmatur krom enkeltgreb',
  'faucet_shower': 'brusearmatur termostat krom',
  'shower_head': 'brusehoved håndbruser krom',
  
  // Vådrum
  'wetroom_membrane': 'vådrumsmembran tætningsmiddel',
  'sealing_sleeve_drain': 'tætningsmuffe afløb',
  'sealing_sleeve_pipes': 'tætningsmuffe rør',
  
  // Gulvvarme
  'manifold_small': 'fordeler 4-vejs gulvvarme',
  'manifold_medium': 'fordeler 6-vejs gulvvarme',
  'floor_heating_pipe': 'gulvvarmerør PEX 16mm',
  'manifold_cabinet': 'fordelerskab gulvvarme',
  
  // Radiator
  'radiator_600x800': 'radiator 600x800mm hvid',
  'radiator_600x1200': 'radiator 600x1200mm hvid',
  
  // Finish
  'mirror_cabinet_60cm': 'spejlskab 60cm LED',
  'mirror_cabinet_80cm': 'spejlskab 80cm LED',
  
  // Diverse
  'consumables_small': 'forbrugsartikler VVS sæt',
  'haulage_waste': 'affaldshåndtering',
};

// Map BOM to real products using AI hybrid search + discount codes
async function mapBOMToProductsIntelligent(bom: BomLine[], projectType: string): Promise<any[]> {
  const materials: any[] = [];
  
  for (const comp of bom) {
    try {
      // 1. Check cache first
      const { data: cached } = await supabaseAdmin
        .from('material_matches')
        .select('*')
        .eq('component_key', comp.componentKey)
        .eq('project_type', projectType)
        .maybeSingle();

      let matchedProduct: any = null;
      let confidence = 0;

      if (cached && cached.matched_vvs_number) {
        // Use cached match
        console.log(`✅ Cache hit: ${comp.componentKey}`);
        const { data: product } = await supabaseAdmin
          .from('enhanced_supplier_prices')
          .select('*')
          .eq('vvs_number', cached.matched_vvs_number)
          .maybeSingle();
        
        matchedProduct = product;
        confidence = Number(cached.confidence || 0.8);
      } else {
        // 2. Map component key to search query
        const searchQuery = COMPONENT_SEARCH_MAP[comp.componentKey] || comp.componentKey.replace(/_/g, ' ');
        
        console.log(`🔍 Searching for: ${comp.componentKey} → "${searchQuery}"`);

        // 3. Use hybrid-search to find best match
        const { data: searchResults, error: searchError } = await supabaseAdmin.functions.invoke('hybrid-search', {
          body: { 
            query: searchQuery, 
            limit: 5,
            similarityThreshold: 0.3
          }
        });

        if (searchError) {
          console.error(`Search error for ${comp.componentKey}:`, searchError);
        }

        if (searchResults && Array.isArray(searchResults) && searchResults.length > 0) {
          matchedProduct = searchResults[0];
          confidence = Number(matchedProduct.similarity || 0.7);

          // Cache the match
          await supabaseAdmin
            .from('material_matches')
            .upsert({
              component_key: comp.componentKey,
              project_type: projectType,
              matched_product_code: matchedProduct.supplier_item_id,
              matched_vvs_number: matchedProduct.vvs_number,
              confidence,
              search_query: searchQuery
            }, { onConflict: 'component_key,project_type' });

          console.log(`✅ Match found: ${matchedProduct.supplier_item_id} (${matchedProduct.short_description}) - confidence: ${confidence}`);
        }
      }

      // 4. Apply discount if available
      let finalPrice = Number(matchedProduct?.net_price || 0);
      let discountApplied = 0;

      if (matchedProduct?.supplier_item_id) {
        // Extract prefix (first 2 chars) for discount lookup
        const prefix = matchedProduct.supplier_item_id.substring(0, 2);
        
        const { data: discount } = await supabaseAdmin
          .from('discount_codes')
          .select('discount_percentage')
          .eq('discount_group', prefix)
          .maybeSingle();

        if (discount && discount.discount_percentage > 0) {
          discountApplied = Number(discount.discount_percentage);
          finalPrice = finalPrice * (1 - discountApplied / 100);
          console.log(`💰 Discount applied: ${discountApplied}% → ${finalPrice.toFixed(2)} kr`);
        }
      }

      // 5. Build material line
      materials.push({
        component_key: comp.componentKey,
        product_code: matchedProduct?.supplier_item_id || comp.componentKey,
        vvs_number: matchedProduct?.vvs_number || null,
        description: matchedProduct?.short_description || comp.componentKey,
        quantity: comp.qty,
        unit: matchedProduct?.price_unit || comp.unit || 'stk',
        net_unit_price: finalPrice,
        net_total_price: finalPrice * comp.qty,
        customer_supplied: !!comp.customerSupplied,
        source: matchedProduct ? 'ai_matched' : 'fallback',
        confidence,
        discount_applied: discountApplied,
        original_price: matchedProduct?.net_price || 0
      });

    } catch (error) {
      console.error(`Error mapping ${comp.componentKey}:`, error);
      
      // Fallback to generic pricing
      materials.push({
        component_key: comp.componentKey,
        product_code: comp.componentKey,
        description: comp.componentKey,
        quantity: comp.qty,
        unit: comp.unit,
        net_unit_price: 50, // Generic fallback
        net_total_price: 50 * comp.qty,
        customer_supplied: !!comp.customerSupplied,
        source: 'fallback',
        confidence: 0.3
      });
    }
  }
  
  return materials;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();

  try {
    const { projectType, estimatedSize, signals = {}, complexity } = await req.json();
    
    // Normalize customer_supplied
    const normalizedSignals = { 
      ...signals, 
      customer_supplied: normalizeCustomerSupplied(signals.customer_supplied) 
    };
    
    console.log(`🔧 Material lookup: ${projectType}, size=${estimatedSize}`);

    // Generate BOM
    const bom = generateProjectBOM(projectType, estimatedSize, complexity || 'medium', normalizedSignals);
    console.log(`Generated BOM with ${bom.length} components`);

    // Map to REAL products with AI search + discounts
    const materialsNet = await mapBOMToProductsIntelligent(bom, projectType);
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
