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
  'geberit_duofix_cistern': 'Geberit DuoFix cisterne',
  'wc_bowl': 'væghængt toilet skål hvid',
  'flush_plate': 'betjeningsplade toilet krom',
  'faucet_basin': 'håndvaskarmatur krom',
  'faucet_shower': 'brusearmatur termostat',
  'shower_head': 'brusehoved håndbruser krom',
  
  // Vådrum
  'wetroom_membrane': 'vådrumsmembran',
  'sealing_sleeve_drain': 'tætningsmuffe afløb',
  'sealing_sleeve_pipes': 'tætningsmuffe rør',
  
  // Gulvvarme
  'manifold_small': 'fordeler gulvvarme',
  'manifold_medium': 'fordeler gulvvarme',
  'floor_heating_pipe': 'gulvvarmerør PEX 16mm',
  'manifold_cabinet': 'fordelerskab gulvvarme',
  
  // Radiator
  'radiator_600x800': 'radiator 600x800mm hvid',
  'radiator_600x1200': 'radiator 600x1200mm hvid',
  
  // Finish
  'mirror_cabinet_60cm': 'spejlskab LED',
  'mirror_cabinet_80cm': 'spejlskab LED',
  
  // Diverse
  'consumables_small': 'forbrugsartikler VVS',
  'haulage_waste': 'affaldshåndtering',
};

// Map BOM to real products using AI hybrid search + discount codes
async function mapBOMToProductsIntelligent(bom: BomLine[], projectType: string): Promise<any[]> {
  const materials: any[] = [];

  // PERFORMANCE: Pre-fetch ALL discount codes once (small table)
  const { data: allDiscounts } = await supabaseAdmin
    .from('discount_codes')
    .select('discount_group, discount_percentage');

  const discountMap = new Map<string, number>(
    (allDiscounts || []).map(d => [d.discount_group, d.discount_percentage])
  );
  console.log(`💰 Pre-loaded ${discountMap.size} discount codes`);

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
        const { data: searchResponse, error: searchError } = await supabaseAdmin.functions.invoke('hybrid-search', {
          body: { 
            query: searchQuery, 
            topK: 10,
            includeSemanticSearch: true
          }
        });

        if (searchError) {
          console.error(`Search error for ${comp.componentKey}:`, searchError);
        }

        // FIX: Correctly parse the response - hybrid-search returns { results: [...] }
        const searchResults = searchResponse?.results || [];
        
        console.log(`📦 Search returned ${searchResults.length} results for ${comp.componentKey}`);

        if (searchResults.length > 0) {
          matchedProduct = searchResults[0];
          confidence = Number(matchedProduct.match_score || 0.7);

          // Cache the match for future use
          try {
            await supabaseAdmin
              .from('material_matches')
              .upsert({
                component_key: comp.componentKey,
                project_type: projectType,
                matched_product_code: matchedProduct.supplier_item_id,
                matched_vvs_number: matchedProduct.vvs_number || matchedProduct.sku,
                confidence,
                search_query: searchQuery
              }, { onConflict: 'component_key,project_type' });
          } catch (cacheError) {
            console.log('Cache upsert skipped:', cacheError);
          }

          console.log(`✅ Match found: ${matchedProduct.supplier_item_id || matchedProduct.sku} (${matchedProduct.title}) - confidence: ${confidence.toFixed(2)}`);
        } else {
          console.log(`⚠️ No match found for ${comp.componentKey}`);
        }
      }

      // 4. Get price - use net_price from matched product or unit_price_ex_vat
      let finalPrice = Number(matchedProduct?.net_price || matchedProduct?.unit_price_ex_vat || 0);
      let discountApplied = 0;

      // Apply discount if available (using pre-fetched discountMap - O(1) lookup)
      if (matchedProduct?.supplier_item_id && finalPrice > 0) {
        // Extract prefix (first 2 chars) for discount lookup
        const prefix = String(matchedProduct.supplier_item_id).substring(0, 2);

        // PERFORMANCE: Use Map lookup instead of DB call
        const discountPct = discountMap.get(prefix) || 0;

        if (discountPct > 0) {
          discountApplied = discountPct;
          finalPrice = finalPrice * (1 - discountApplied / 100);
          console.log(`💰 Discount applied: ${discountApplied}% → ${finalPrice.toFixed(2)} kr`);
        }
      }

      // 5. Build material line
      materials.push({
        component_key: comp.componentKey,
        product_code: matchedProduct?.supplier_item_id || matchedProduct?.sku || comp.componentKey,
        vvs_number: matchedProduct?.vvs_number || matchedProduct?.sku || null,
        description: matchedProduct?.title || matchedProduct?.short_description || comp.componentKey,
        quantity: comp.qty,
        unit: matchedProduct?.unit || comp.unit || 'stk',
        net_unit_price: finalPrice,
        net_total_price: finalPrice * comp.qty,
        customer_supplied: !!comp.customerSupplied,
        source: matchedProduct && finalPrice > 0 ? 'ai_matched' : 'fallback',
        confidence,
        discount_applied: discountApplied,
        original_price: matchedProduct?.net_price || matchedProduct?.unit_price_ex_vat || 0
      });

    } catch (error) {
      console.error(`Error mapping ${comp.componentKey}:`, error);
      
      // Fallback to generic pricing
      materials.push({
        component_key: comp.componentKey,
        product_code: comp.componentKey,
        description: comp.componentKey.replace(/_/g, ' '),
        quantity: comp.qty,
        unit: comp.unit,
        net_unit_price: 100, // Higher fallback price
        net_total_price: 100 * comp.qty,
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
    console.log(`📋 Generated BOM with ${bom.length} components`);

    // Map to REAL products with AI search + discounts
    const materialsNet = await mapBOMToProductsIntelligent(bom, projectType);
    
    // Calculate totals
    const matchedCount = materialsNet.filter(m => m.source === 'ai_matched').length;
    const fallbackCount = materialsNet.filter(m => m.source === 'fallback').length;
    const netTotal = materialsNet.reduce((s, m) => s + m.net_total_price, 0);
    
    console.log(`✅ Materials: ${matchedCount} matched, ${fallbackCount} fallback`);
    console.log(`✅ Materials NET total: ${netTotal.toFixed(2)} kr`);

    return ok({
      materials_net: materialsNet,
      net_total_cost: netTotal,
      project_type: projectType,
      estimated_size: estimatedSize,
      stats: {
        total: materialsNet.length,
        matched: matchedCount,
        fallback: fallbackCount
      }
    });

  } catch (error) {
    console.error('❌ Material lookup error:', error);
    return err(error);
  }
});
