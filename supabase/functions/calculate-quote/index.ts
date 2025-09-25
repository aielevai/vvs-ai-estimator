import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALENTIN_PRICING_LOGIC = {
  baseRates: {
    hourlyRate: 550,
    serviceVehicle: 65,
    minimumProject: 4500,
  },
  hoursPerProjectType: {
    bathroom_renovation: { baseHours: 8, unit: "m2", averageSize: 10 },
    kitchen_plumbing: { baseHours: 4, unit: "m2", averageSize: 8 },
    pipe_installation: { baseHours: 0.7, unit: "meter", averageSize: 15 },
    district_heating: { baseHours: 16, unit: "connection", averageSize: 1, additionalPerUnit: 0.5 },
    floor_heating: { baseHours: 1.5, unit: "m2", averageSize: 35 },
    radiator_installation: { baseHours: 4, unit: "units", averageSize: 3 },
    service_call: { baseHours: 3, unit: "job", averageSize: 1 }
  },
  materialCostPerType: {
    bathroom_renovation: 3500,
    kitchen_plumbing: 2200,
    pipe_installation: 180,
    district_heating: 24000,
    floor_heating: 800,
    radiator_installation: 2500,
    service_call: 500
  },
  complexityMultipliers: { 
    simple: 0.8, 
    medium: 1.0, 
    complex: 1.3, 
    emergency: 1.5 
  },
  sizeDiscounts: { 
    small: { threshold: 0, discount: 0 }, 
    medium: { threshold: 50, discount: 0.1 }, 
    large: { threshold: 150, discount: 0.2 } 
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId } = await req.json();
    
    if (!caseId) {
      return new Response(
        JSON.stringify({ error: 'Case ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Calculating quote for case:', caseId);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get case data
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();

    if (caseError || !caseData) {
      console.error('Case not found:', caseError);
      return new Response(
        JSON.stringify({ error: 'Case not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate pricing (simplified - no external function calls)
    const priceBreakdown = calculateProjectPrice(caseData.extracted_data);
    const quoteNumber = `VVS-${Date.now().toString().slice(-6)}`;

    console.log('Price breakdown calculated:', priceBreakdown);

    // Create quote
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .insert({
        case_id: caseId,
        quote_number: quoteNumber,
        subtotal: priceBreakdown.subtotal,
        vat_amount: priceBreakdown.vat,
        total_amount: priceBreakdown.total,
        labor_hours: priceBreakdown.laborHours,
        travel_cost: 0,
        service_vehicle_cost: priceBreakdown.vehicleCost,
        status: 'draft',
        valid_until: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]
      })
      .select()
      .single();

    if (quoteError) {
      console.error('Failed to create quote:', quoteError);
      throw quoteError;
    }

    // Create quote lines (simplified)
    const lines = [
      {
        quote_id: quote.id,
        line_type: 'labor',
        description: `VVS arbejde (${priceBreakdown.laborHours} timer)`,
        quantity: priceBreakdown.laborHours,
        unit_price: VALENTIN_PRICING_LOGIC.baseRates.hourlyRate,
        total_price: priceBreakdown.laborCost,
        labor_hours: priceBreakdown.laborHours,
        sort_order: 1,
      },
      {
        quote_id: quote.id,
        line_type: 'service_vehicle',
        description: 'Servicebil og værktøj',
        quantity: 1,
        unit_price: priceBreakdown.vehicleCost,
        total_price: priceBreakdown.vehicleCost,
        sort_order: 2,
      },
      {
        quote_id: quote.id,
        line_type: 'material',
        description: `Materialer (${caseData.extracted_data?.project?.estimated_size || 1} ${caseData.extracted_data?.project?.size_unit || 'enheder'})`,
        quantity: caseData.extracted_data?.project?.estimated_size || 1,
        unit_price: priceBreakdown.materialCost / (caseData.extracted_data?.project?.estimated_size || 1),
        total_price: priceBreakdown.materialCost,
        sort_order: 3,
      }
    ];

    const { error: linesError } = await supabase
      .from('quote_lines')
      .insert(lines);

    if (linesError) {
      console.error('Failed to create quote lines:', linesError);
      throw linesError;
    }

    // Update case status
    await supabase
      .from('cases')
      .update({ status: 'quoted' })
      .eq('id', caseId);

    console.log('Quote created successfully:', quote.id);

    return new Response(
      JSON.stringify({
        quote,
        lines,
        pricing_analysis: {
          project_type: caseData.extracted_data?.project?.type,
          estimated_size: caseData.extracted_data?.project?.estimated_size,
          complexity: caseData.extracted_data?.project?.complexity,
          total_hours: priceBreakdown.laborHours,
          calculation_details: priceBreakdown.breakdown
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Quote calculation error:', error);
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

function calculateProjectPrice(analysis: any): any {
  if (!analysis?.project) return createFallbackPrice();

  const projectType = analysis.project.type;
  const size = Number(analysis.project.estimated_size || 1);
  const complexity = analysis.project.complexity || 'medium';

  console.log(`Calculating price for: ${projectType}, size: ${size}, complexity: ${complexity}`);

  const config = VALENTIN_PRICING_LOGIC.hoursPerProjectType[projectType as keyof typeof VALENTIN_PRICING_LOGIC.hoursPerProjectType];
  if (!config) {
    console.log(`No config found for project type: ${projectType}, using fallback`);
    return createFallbackPrice();
  }

  // Calculate hours
  let hours = (config.baseHours || 0) * size;
  if ((config as any).additionalPerUnit) {
    hours += (config as any).additionalPerUnit * size;
  }

  const complexityMultiplier = VALENTIN_PRICING_LOGIC.complexityMultipliers[complexity as keyof typeof VALENTIN_PRICING_LOGIC.complexityMultipliers] || 1.0;
  hours = Math.round(hours * complexityMultiplier * 2) / 2;

  // Sanity check: Cap unrealistic hour estimates
  const maxHoursPerType = {
    bathroom_renovation: 200,
    kitchen_plumbing: 100,
    pipe_installation: 150,
    district_heating: 40,
    floor_heating: 200,
    radiator_installation: 80,
    service_call: 50
  };
  
  const maxHours = maxHoursPerType[projectType as keyof typeof maxHoursPerType] || 100;
  if (hours > maxHours) {
    console.log(`WARNING: Capping unrealistic hours estimate from ${hours} to ${maxHours} for project type ${projectType}`);
    hours = maxHours;
  }
  
  if (hours < 1) {
    console.log(`WARNING: Hours too low (${hours}), setting minimum to 2 hours`);
    hours = 2;
  }

  // Calculate costs
  const laborCost = hours * VALENTIN_PRICING_LOGIC.baseRates.hourlyRate;
  const vehicleCost = VALENTIN_PRICING_LOGIC.baseRates.serviceVehicle;
  
  // Calculate material costs using standard pricing
  const unitMaterialCost = VALENTIN_PRICING_LOGIC.materialCostPerType[projectType as keyof typeof VALENTIN_PRICING_LOGIC.materialCostPerType] || 500;
  let baseMaterialCost = unitMaterialCost * size;
  
  // Apply size discount
  const discount = getSizeDiscount(size);
  const materialCost = baseMaterialCost * (1 - discount);

  const subtotal = Math.max(
    laborCost + vehicleCost + materialCost, 
    VALENTIN_PRICING_LOGIC.baseRates.minimumProject
  );
  const vat = subtotal * 0.25;
  const total = subtotal + vat;

  return {
    laborHours: hours,
    laborCost,
    vehicleCost,
    materialCost,
    subtotal,
    vat,
    total,
    breakdown: [
      { 
        description: `${projectType.replace('_', ' ')} arbejde (${hours.toFixed(1)} timer)`, 
        amount: laborCost, 
        calculation: `${hours.toFixed(1)} × ${VALENTIN_PRICING_LOGIC.baseRates.hourlyRate} kr` 
      },
      { 
        description: `Servicevogn`, 
        amount: vehicleCost, 
        calculation: `Standard pris` 
      },
      { 
        description: `Materialer (${size} ${config.unit})`, 
        amount: materialCost, 
        calculation: `Standard materialepris${discount > 0 ? ` - ${(discount * 100).toFixed(0)}% rabat` : ''}` 
      }
    ]
  };
}

function createFallbackPrice() {
  const hours = 4;
  const laborCost = hours * VALENTIN_PRICING_LOGIC.baseRates.hourlyRate;
  const vehicleCost = VALENTIN_PRICING_LOGIC.baseRates.serviceVehicle;
  const materialCost = 2000;
  const subtotal = Math.max(laborCost + vehicleCost + materialCost, VALENTIN_PRICING_LOGIC.baseRates.minimumProject);
  const vat = subtotal * 0.25;

  return {
    laborHours: hours,
    laborCost,
    vehicleCost,
    materialCost,
    subtotal,
    vat,
    total: subtotal + vat,
    breakdown: [
      { description: `Standard VVS arbejde (${hours} timer)`, amount: laborCost, calculation: `${hours} × ${VALENTIN_PRICING_LOGIC.baseRates.hourlyRate} kr` },
      { description: `Servicevogn`, amount: vehicleCost, calculation: `Standard pris` },
      { description: `Standard materialer`, amount: materialCost, calculation: `Estimat` }
    ]
  };
}

function getSizeDiscount(size: number): number {
  const d = VALENTIN_PRICING_LOGIC.sizeDiscounts;
  if (size >= d.large.threshold) return d.large.discount;
  if (size >= d.medium.threshold) return d.medium.discount;
  return d.small.discount;
}