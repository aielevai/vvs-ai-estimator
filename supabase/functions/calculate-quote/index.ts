// FASE 5: Calculate-quote med prisbog-tillæg og korrekt minimum-logik
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// FASE 5: Prisbog - deterministiske tillæg
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

  if (projectType === 'district_heating' && signals?.hot_work) {
    rules.push({
      description: 'Varmetillæg',
      amount: 600,
      calculation: 'fast pr job',
      rule_id: 'HOT_WORK'
    });
  }

  return rules;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId } = await req.json();

    if (!caseId) {
      return new Response(JSON.stringify({ error: 'Case ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Calculating quote for case:', caseId);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load config
    const { data: config } = await supabase
      .from('pricing_config')
      .select('*')
      .order('effective_from', { ascending: false })
      .limit(1)
      .single();

    // Get case data
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();

    if (caseError || !caseData) {
      return new Response(JSON.stringify({ error: 'Case not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const analysis = caseData.extracted_data;
    if (!analysis?.project) {
      return new Response(JSON.stringify({ error: 'No analysis data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get profile
    const { data: profile } = await supabase
      .from('pricing_profiles')
      .select('*')
      .eq('project_type', analysis.project.type)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get historical data
    let historicalData: any = null;
    try {
      const histResp = await supabase.functions.invoke('historical-analysis', {
        body: {
          projectType: analysis.project.type,
          size: analysis.project.estimated_size?.value ?? profile.average_size,
          complexity: complexityToNumeric(analysis.project.complexity ?? 'medium'),
          signals: analysis.project
        }
      });
      if (histResp.data) historicalData = histResp.data;
    } catch (e) {
      console.log('Historical analysis skipped:', e);
    }

    const size = Number(analysis.project.estimated_size?.value ?? profile.average_size);
    const base = Number(profile.base_hours);
    const ref = Number(profile.average_size);
    const beta = Number(historicalData?.analysis?.beta ?? profile.beta_default ?? 1.0);
    const H = Number(historicalData?.analysis?.historical_factor ?? 1.0);
    const c = complexityToNumeric(analysis.project.complexity ?? 'medium');

    // 1) Timer
    let hours_raw = base * Math.pow(size / ref, beta);
    let hours_adj = hours_raw * c * H;
    const hours = roundHalf(clamp(hours_adj, Number(profile.min_hours), Number(profile.max_hours)));

    // Hent config parametre
    const VAT = Number(config?.vat_rate ?? 0.25);
    const MARKUP = Number(config?.material_markup ?? 0.40);
    const MODE = String(config?.timesats_mode ?? 'split');

    // 2) Arbejdsløn + vogn baseret på mode
    let laborRate = Number(config?.hourly_rate_labor ?? 595);
    let vehicleRate = Number(config?.hourly_rate_vehicle ?? 65);
    
    if (MODE === 'all_in') {
      laborRate = Number(config?.hourly_rate ?? 660);
      vehicleRate = 0;
    }
    
    const minLaborHours = Number(profile.min_labor_hours ?? 0);
    const laborCost = Math.max(hours * laborRate, minLaborHours * laborRate);
    const vehicleCost = roundHalf(hours) * vehicleRate;

    // 3) Materialer fra material-lookup (ALTID NET priser)
    let materialResp: any = null;
    try {
      materialResp = await supabase.functions.invoke('material-lookup', {
        body: {
          projectType: analysis.project.type,
          estimatedSize: size,
          materialeAnalyse: analysis.materiale_analyse,
          complexity: analysis.project.complexity
        }
      });
    } catch (e) {
      console.error('Material lookup failed:', e);
    }

    const materials_net = materialResp?.data?.materials_net ?? [];
    
    // Hent materiale-gulv og håndhæv det på SALG-niveau (net × 1,4)
    const { data: floor } = await supabase
      .from('material_floors')
      .select('*')
      .eq('project_type', analysis.project.type)
      .single();
    
    const matFloorSale = (Number(floor?.base_floor ?? 0) + Number(floor?.per_unit_floor ?? 0) * size);

    // Byg salgs-linjer med avance (40% markup)
    const materials_lines = materials_net.map((m: any) => {
      const sale_unit = m.net_unit_price * (m.customer_supplied ? 0 : (1 + MARKUP));
      const sale_total = sale_unit * m.quantity;
      return {
        line_type: 'material',
        description: m.description,
        quantity: m.quantity,
        unit: m.unit,
        unit_price: sale_unit,
        total_price: sale_total,
        material_code: m.product_code,
        validated: m.validated,
        customer_supplied: !!m.customer_supplied
      };
    });
    
    let materialsTotal = materials_lines.reduce((s: number, x: any) => s + x.total_price, 0);
    
    // Gulv (salg) – hvis under, løft kritiske komponenter proportionelt
    if (materialsTotal < matFloorSale && materialsTotal > 0) {
      const factor = matFloorSale / materialsTotal;
      materials_lines.forEach((l: any) => { 
        if (!l.customer_supplied) { 
          l.unit_price *= factor; 
          l.total_price *= factor; 
        } 
      });
      materialsTotal = materials_lines.reduce((s: number, x: any) => s + x.total_price, 0);
    }

    // 4) Prisbog - deterministiske tillæg
    const surcharges = evaluatePricingRules(
      analysis.signals ?? {},
      analysis.project.complexity ?? 'medium',
      size,
      analysis.project.type
    );
    const surchargeTotal = surcharges.reduce((s, x) => s + x.amount, 0);

    // 5) Projektminimum (kun hvis type-flag er true, og kun på (arbejde+vogn+tilæg))
    const subtotalExMaterials = laborCost + vehicleCost + surchargeTotal;
    const projectMinimum = Number(config?.minimum_project ?? 4500);
    let minimumLine: any = null;
    if (profile.apply_minimum_project && subtotalExMaterials < projectMinimum) {
      minimumLine = { 
        description: 'Projektminimum', 
        amount: projectMinimum - subtotalExMaterials 
      };
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
        total_price: Math.max(hours * laborRate, minLaborHours * laborRate)
      });
    } else {
      lines.push({
        line_type: 'labor',
        description: 'Arbejdsløn',
        quantity: hours,
        unit: 'time',
        unit_price: laborRate,
        total_price: laborCost
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

    // 7) Totaler FRA linjer
    const subtotal = lines.reduce((a, x) => a + Number(x.total_price), 0);
    const vat = subtotal * VAT;
    const total = subtotal + vat;

    // 9) Gem quote
    const quoteNumber = `Q-${Date.now()}`;
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);

    const { data: quote, error: quoteError } = await supabase
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
        valid_until: validUntil.toISOString().split('T')[0]
      })
      .select()
      .single();

    if (quoteError) {
      console.error('Failed to create quote:', quoteError);
      return new Response(JSON.stringify({ error: 'Failed to create quote' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Gem linjer
    const linesWithQuoteId = lines.map((l, idx) => ({
      ...l,
      quote_id: quote.id,
      sort_order: idx
    }));

    const { error: linesError } = await supabase.from('quote_lines').insert(linesWithQuoteId);

    if (linesError) {
      console.error('Failed to create quote lines:', linesError);
    }

    // Forklaringsblob
    const calculation_explanation = {
      reference: { base_hours: base, average_size: ref, beta, H, complexity: c },
      size_used: size,
      hours: { raw: hours_raw, adjusted: hours, min: profile.min_hours, max: profile.max_hours },
      timesats: MODE === 'all_in' ? { all_in: laborRate } : { labor: laborRate, vehicle: vehicleRate },
      labor: { min_labor_hours: minLaborHours, laborCost },
      vehicle: { vehicleCost },
      materials: { 
        lines: materials_lines.length, 
        sale_total: materialsTotal, 
        markup: MARKUP,
        floor_applied: materialsTotal >= matFloorSale ? null : matFloorSale
      },
      surcharges,
      minimum_applied: !!minimumLine
    };

    return new Response(
      JSON.stringify({
        quote,
        quote_lines: linesWithQuoteId,
        calculation_explanation,
        pricing_analysis: {
          project_type: analysis.project.type,
          estimated_size: size,
          complexity: analysis.project.complexity,
          hours,
          materials_total: materialsTotal,
          surcharges_total: surchargeTotal,
          subtotal,
          vat,
          total
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Calculate quote error:', error);
    return new Response(
      JSON.stringify({
        error: 'Quote calculation failed',
        details: (error as any)?.message || 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
