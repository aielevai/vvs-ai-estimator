// ROBUST GENERIC QUOTE CALCULATOR - Multi-Type Support
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, handleOptions } from "../_shared/http.ts";
import { supabaseAdmin } from '../_shared/supabase.ts';

function complexityToNumeric(level: string): number {
  const map: Record<string, number> = { simple: 0.8, medium: 1.0, complex: 1.3, emergency: 1.5 };
  return map[level?.toLowerCase?.()] ?? 1.0;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(n, hi));
}

function roundHalf(n: number) {
  return Math.round(n * 2) / 2;
}

function normalizeCustomerSupplied(input: unknown): string[] {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object") {
    return Object.entries(input as Record<string, boolean>)
      .filter(([, v]) => v)
      .map(([k]) => k);
  }
  return [];
}

// Prisbog - deterministiske tillæg
function evaluatePricingRules(
  signals: any,
  complexity: string,
  size: number,
  projectType: string
): Array<{ description: string; amount: number; calculation: string; rule_id: string }> {
  const rules: Array<{ description: string; amount: number; calculation: string; rule_id: string }> = [];

  const floor = Number(signals?.floor ?? 0);
  const elevator = Boolean(signals?.elevator);
  if (floor > 1 && !elevator) {
    const add = 500 + (floor - 1) * 250;
    rules.push({
      description: `Etage ${floor} uden elevator`,
      amount: add,
      calculation: `500 + ${floor - 1}×250`,
      rule_id: 'FLOOR_NO_ELEVATOR'
    });
  }

  const ch = Number(signals?.ceiling_height ?? 0);
  if (ch > 3.0) {
    const extra = ch - 3.0;
    const add = Math.round(extra * 400);
    rules.push({
      description: `Loftshøjde ${ch.toFixed(1)} m`,
      amount: add,
      calculation: `${extra.toFixed(1)}×400`,
      rule_id: 'HIGH_CEILING'
    });
  }

  if (signals?.difficult_access) {
    rules.push({
      description: 'Vanskelig adgang',
      amount: 750,
      calculation: 'fast',
      rule_id: 'DIFFICULT_ACCESS'
    });
  }

  return rules;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();

  try {
    const body = await req.json();
    let { caseId, project_type, estimatedSize, signals } = body;

    if (!caseId) {
      return err('Case ID required', 400);
    }

    console.log('📊 Calculating quote for case:', caseId);

    const supabase = supabaseAdmin;

    // Prøv inline analysis først, ellers fallback til DB
    let analysis = null;
    if (project_type && typeof estimatedSize === 'number' && signals) {
      analysis = { project_type, estimatedSize, signals };
    } else {
      // Fallback: hent fra cases.extracted_data
      const { data: caseData } = await supabase
        .from('cases')
        .select('extracted_data')
        .eq('id', caseId)
        .single();
      
      const extracted = caseData?.extracted_data;
      if (extracted?.project) {
        analysis = {
          project_type: extracted.project.type,
          estimatedSize: Number(
            extracted.project.estimated_size?.value ?? 
            extracted.project.estimated_size ?? 
            1
          ),
          signals: extracted.signals ?? {}
        };
      }
    }

    if (!analysis) {
      return err('No analysis data - run analyze-email first', 400);
    }

    // Normalisér customer_supplied til array
    analysis.signals.customer_supplied = normalizeCustomerSupplied(
      analysis.signals.customer_supplied
    );

    // Load config
    const { data: config } = await supabase
      .from('pricing_config')
      .select('*')
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get profile (brug analysis.project_type i stedet for analysis.project.type)
    const { data: profile } = await supabase
      .from('pricing_profiles')
      .select('*')
      .eq('project_type', analysis.project_type)
      .maybeSingle();

    if (!profile) {
      console.error(`No profile for type: ${analysis.project_type}`);
      return err(`Profile not found for ${analysis.project_type}`, 404);
    }

    console.log('📐 Profile loaded:', { type: analysis.project_type, base_hours: profile.base_hours, beta: profile.beta_default });

    // Historical data (optional)
    let historicalData: any = null;
    try {
      const histResp = await supabase.functions.invoke('historical-analysis', {
        body: {
          projectType: analysis.project_type,
          size: analysis.estimatedSize,
          complexity: complexityToNumeric(analysis.signals.complexity ?? 'medium'),
          signals: analysis.signals ?? {}
        }
      });
      if (histResp.data) historicalData = histResp.data;
    } catch (e) {
      console.log('⚠️  Historical analysis skipped:', e);
    }

    const size = Number(analysis.estimatedSize);
    const base = Number(profile.base_hours);
    const ref = Number(profile.average_size);
    const beta = Number(historicalData?.analysis?.beta ?? profile.beta_default ?? 1.0);
    const H = Number(historicalData?.analysis?.historical_factor ?? 1.0);
    const c = complexityToNumeric(analysis.signals.complexity ?? 'medium');

    console.log('🧮 Hour calculation:', { size, base, ref, beta, H, complexity: c });

    // 1) Timer - KORREKT FORMEL (41h for 12m² badeværelse)
    const hours_raw = base * Math.pow(size / ref, beta);
    let hours_adj = hours_raw * c * H;
    
    // Clamp to profile limits
    const hours = roundHalf(clamp(hours_adj, Number(profile.min_labor_hours), Number(profile.max_hours ?? 999)));

    console.log(`⏱️  Hours: raw=${hours_raw.toFixed(2)}, adjusted=${hours_adj.toFixed(2)}, final=${hours}`);

    // Config parametre
    const VAT = Number(config?.vat_rate ?? 0.25);
    const MARKUP = Number(config?.material_markup ?? 0.40);
    const MODE = String(config?.timesats_mode ?? 'split');

    // 2) Arbejdsløn + vogn
    let laborRate = Number(config?.hourly_rate_labor ?? 595);
    let vehicleRate = Number(config?.hourly_rate_vehicle ?? 65);
    
    if (MODE === 'all_in') {
      laborRate = Number(config?.hourly_rate ?? 660);
      vehicleRate = 0;
    }
    
    const minLaborHours = Number(profile.min_labor_hours ?? 0);
    const laborCost = Math.max(hours * laborRate, minLaborHours * laborRate);
    const vehicleCost = hours * vehicleRate;

    console.log('💰 Labor:', { hours, laborRate, laborCost, vehicleRate, vehicleCost });

    // 3) Materialer - autokald material-lookup hvis ikke i body
    let materials_net: any[] | null = body.materials_net ?? body.materials ?? null;

    if (!materials_net) {
      console.log('🔧 No materials provided, calling material-lookup...');
      
      let materialResp: any = null;
      try {
        materialResp = await supabase.functions.invoke('material-lookup', {
          body: {
            projectType: analysis.project_type,
            estimatedSize: size,
            signals: analysis.signals ?? {},
            complexity: analysis.signals?.complexity ?? 'medium'
          }
        });
        
        if (materialResp.error) {
          console.error('❌ Material lookup failed:', materialResp.error);
          return err('Material lookup failed - cannot generate quote', 502, { 
            details: materialResp.error 
          });
        }
        
      } catch (e) {
        console.error('❌ Material lookup exception:', e);
        return err('Material lookup exception - cannot generate quote', 502, { 
          details: String(e) 
        });
      }
      
      // FIX: Double-wrap svar fra edge invoke
      const responseData = materialResp?.data;
      if (responseData?.ok === false) {
        console.error('❌ Material lookup error:', responseData?.error);
        return err('Material lookup failed: ' + (responseData?.error || 'unknown'), 502);
      }
      materials_net = responseData?.data?.materials_net ?? [];
      
      // HÅRD FEJL hvis ingen materialer for projekter der kræver det
      if ((materials_net?.length ?? 0) === 0 && analysis.project_type !== 'service_call') {
        console.error('❌ No materials returned from lookup');
        return err('Material lookup returned no materials - check components/BOM coverage', 500);
      }
      
      console.log(`✅ Auto-fetched ${materials_net?.length ?? 0} materials`);
    } else {
      console.log(`📦 Using provided materials: ${materials_net.length} items`);
    }

    // Failsafe defaults for materials_net fields
    materials_net = (materials_net ?? []).map((m: any) => ({
      description: m.description ?? m.name ?? 'Materiale',
      quantity: Number(m.quantity ?? 1),
      unit: m.unit ?? 'stk',
      net_unit_price: Number(m.net_unit_price ?? 0),
      net_total_price: Number(m.net_total_price ?? (Number(m.net_unit_price ?? 0) * Number(m.quantity ?? 1))),
      customer_supplied: !!m.customer_supplied,
      product_code: m.product_code ?? m.supplier_sku ?? null,
      component_key: m.component_key ?? null,
      source: m.source ?? 'bom'
    }));

    const round2 = (n: number) => Math.round(n * 100) / 100;

    // Hent materialegulv
    const { data: floor } = await supabase
      .from('material_floors')
      .select('*')
      .eq('project_type', analysis.project_type)
      .maybeSingle();
    
    const matFloorSale = Number(floor?.base_floor ?? 0) + Number(floor?.per_unit_floor ?? 0) * size;
    console.log(`📏 Material floor (SALE): ${matFloorSale} (base=${floor?.base_floor}, per_unit=${floor?.per_unit_floor})`);

    // Byg salgslinjer med markup (40%) - KUN på NET, ikke på kundeleveret
    const materials_lines = materials_net.map((m: any) => {
      const isCustomerSupplied = !!m.customer_supplied;
      const sale_unit = round2(m.net_unit_price * (isCustomerSupplied ? 0 : (1 + MARKUP)));
      const sale_total = round2(sale_unit * m.quantity);
      return {
        line_type: 'material',
        description: m.description,
        quantity: m.quantity,
        unit: m.unit,
        unit_price: sale_unit,
        total_price: sale_total,
        material_code: m.product_code,
        customer_supplied: isCustomerSupplied,
        component_key: m.component_key,
        source: 'bom'
      };
    });
    
    // Beregn salg KUN på Valentin-leveret (ekskluder kundeleveret)
    const valentinLines = materials_lines.filter((l: any) => !l.customer_supplied);
    let valentinTotal = valentinLines.reduce((s: number, x: any) => s + x.total_price, 0);
    
    // Håndhæv floor KUN på Valentin-leveret
    if (valentinTotal < matFloorSale && valentinTotal > 0) {
      console.log(`⬆️  Applying material floor: ${valentinTotal.toFixed(2)} -> ${matFloorSale}`);
      const factor = matFloorSale / valentinTotal;
      
      materials_lines.forEach((l: any) => { 
        if (!l.customer_supplied) { 
          l.unit_price = round2(l.unit_price * factor); 
          l.total_price = round2(l.total_price * factor); 
        } 
      });
      
      valentinTotal = matFloorSale;
    }

    const materialsTotal = round2(materials_lines.reduce((s: number, x: any) => s + x.total_price, 0));
    console.log(`💎 Materials (SALE): ${materialsTotal.toFixed(2)} (Valentin: ${valentinTotal.toFixed(2)}, Customer: ${(materialsTotal - valentinTotal).toFixed(2)})`);

    // 4) Prisbog - deterministiske tillæg
    const surcharges = evaluatePricingRules(
      analysis.signals ?? {},
      analysis.signals.complexity ?? 'medium',
      size,
      analysis.project_type
    );
    const surchargeTotal = surcharges.reduce((s, x) => s + x.amount, 0);

    console.log(`➕ Surcharges: ${surcharges.length} items, total=${surchargeTotal}`);

    // 5) Projektminimum (kun hvis profile flag = true, kun på arbejde+vogn+tillæg)
    const subtotalExMaterials = laborCost + vehicleCost + surchargeTotal;
    const projectMinimum = Number(config?.minimum_project ?? 4500);
    let minimumLine: any = null;
    if (profile.apply_minimum_project && subtotalExMaterials < projectMinimum) {
      minimumLine = { 
        description: 'Projektminimum', 
        amount: projectMinimum - subtotalExMaterials 
      };
      console.log(`📌 Project minimum applied: ${minimumLine.amount}`);
    }

    // 6) Byg linjer
    const lines: any[] = [];
    
    if (MODE === 'all_in') {
      lines.push({
        line_type: 'labor',
        description: 'Arbejde (all-in timesats)',
        quantity: hours,
        unit: 'time',
        unit_price: laborRate,
        total_price: laborCost,
        labor_hours: hours
      });
    } else {
      lines.push({
        line_type: 'labor',
        description: 'Arbejdsløn',
        quantity: hours,
        unit: 'time',
        unit_price: laborRate,
        total_price: laborCost,
        labor_hours: hours
      });
      if (vehicleRate > 0) {
        lines.push({
          line_type: 'vehicle',
          description: 'Servicevogn',
          quantity: hours,
          unit: 'time',
          unit_price: vehicleRate,
          total_price: vehicleCost
        });
      }
    }

    materials_lines.forEach((l: any) => lines.push(l));

    for (const s of surcharges) {
      lines.push({
        line_type: 'surcharge',
        description: s.description,
        quantity: 1,
        unit: 'stk',
        unit_price: s.amount,
        total_price: s.amount
      });
    }

    if (minimumLine) {
      lines.push({
        line_type: 'minimum',
        description: minimumLine.description,
        quantity: 1,
        unit: 'stk',
        unit_price: minimumLine.amount,
        total_price: minimumLine.amount
      });
    }

    // 7) Totaler FRA linjer med korrekt afrunding
    const subtotal = round2(lines.reduce((a, x) => a + Number(x.total_price), 0));
    const vat = round2(subtotal * VAT);
    const total = round2(subtotal + vat);

    console.log(`💵 Totals: subtotal=${subtotal.toFixed(2)}, vat=${vat.toFixed(2)}, total=${total.toFixed(2)}`);

    // 8) Pricing snapshot (gem config på quote for historisk reproduktion)
    const pricing_snapshot = {
      hourly_rate_labor: laborRate,
      hourly_rate_vehicle: vehicleRate,
      material_markup: MARKUP,
      vat_rate: VAT,
      minimum_project: projectMinimum,
      timesats_mode: MODE,
      material_floor: { base: floor?.base_floor, per_unit: floor?.per_unit_floor }
    };

    // 9) Pricing trace (debug-info)
    const pricing_trace = {
      timestamp: new Date().toISOString(),
      profile_used: { project_type: profile.project_type, base_hours: base, average_size: ref, beta },
      size_input: size,
      hours_calculation: { raw: hours_raw, adjusted: hours_adj, final: hours, H, complexity: c },
      materials: { 
        net_items: materials_net.length, 
        sale_total: materialsTotal, 
        floor_applied: materialsTotal >= matFloorSale ? null : matFloorSale 
      },
      surcharges,
      minimum_applied: !!minimumLine
    };

    // 10) Gem quote med upsert-logik
    const quoteNumber = `Q-${Date.now()}`;
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);

    // Check if quote already exists
    const { data: existingQuote } = await supabase
      .from('quotes')
      .select('id')
      .eq('case_id', caseId)
      .maybeSingle();

    let quote;
    let quoteError;

    if (existingQuote) {
      // UPDATE existing quote
      console.log(`♻️  Updating existing quote for case ${caseId}`);
      const { data, error } = await supabase
        .from('quotes')
        .update({
          quote_number: quoteNumber,
          subtotal,
          vat_amount: vat,
          total_amount: total,
          labor_hours: hours,
          service_vehicle_cost: vehicleCost,
          status: 'draft',
          valid_until: validUntil.toISOString().split('T')[0],
          pricing_snapshot,
          pricing_trace,
          metadata: {
            project_type: analysis.project_type,
            estimated_size: size,
            complexity: analysis.signals.complexity
          }
        })
        .eq('id', existingQuote.id)
        .select()
        .single();
      
      quote = data;
      quoteError = error;
    } else {
      // INSERT new quote
      console.log(`✨ Creating new quote for case ${caseId}`);
      const { data, error } = await supabase
        .from('quotes')
        .insert({
          case_id: caseId,
          quote_number: quoteNumber,
          subtotal,
          vat_amount: vat,
          total_amount: total,
          labor_hours: hours,
          service_vehicle_cost: vehicleCost,
          status: 'draft',
          valid_until: validUntil.toISOString().split('T')[0],
          pricing_snapshot,
          pricing_trace,
          metadata: {
            project_type: analysis.project_type,
            estimated_size: size,
            complexity: analysis.signals.complexity
          }
        })
        .select()
        .single();
      
      quote = data;
      quoteError = error;
    }

    if (quoteError) {
      console.error('❌ Failed to save quote:', quoteError);
      return err(`Failed to save quote: ${quoteError.message}`, 500);
    }

    console.log(`✅ Quote saved: ${quote.quote_number}`);

    // 11) Gem linjer (slet gamle først hvis update)
    if (existingQuote) {
      await supabase
        .from('quote_lines')
        .delete()
        .eq('quote_id', quote.id);
    }

    const linesWithQuoteId = lines.map((l, idx) => ({
      ...l,
      quote_id: quote.id,
      sort_order: idx
    }));

    const { error: linesError } = await supabase.from('quote_lines').insert(linesWithQuoteId);

    if (linesError) {
      console.error('❌ Failed to create quote lines:', linesError);
      return err(`Failed to save quote lines: ${linesError.message}`, 500);
    }

    console.log(`✅ Saved ${linesWithQuoteId.length} quote lines`);

    // 12) Opdater case processing_status til complete
    await supabase
      .from('cases')
      .update({ 
        processing_status: { 
          step: 'complete', 
          progress: 100, 
          message: 'Tilbud klar!' 
        },
        status: 'quoted'
      })
      .eq('id', caseId);

    console.log('✅ Case processing_status updated to complete');

    // 13) Returnér standardiseret struktur (inkl. convenience-felter)
    return ok({
      quote,
      lines: linesWithQuoteId,
      laborHours: hours,
      subtotal,
      vat,
      total,
      calculation_explanation: pricing_trace,
      metadata: {
        project_type: analysis.project_type,
        estimated_size: size,
        complexity: analysis.signals?.complexity
      }
    });
    
  } catch (error) {
    console.error('💥 Calculate quote error:', error);
    return err(error);
  }
});
