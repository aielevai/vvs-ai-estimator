import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALENTIN_PRICING_LOGIC = {
  baseRates: {
    hourlyRate: 595,
    serviceVehicle: 65, // Per hour
    minimumProject: 4500,
  },
  hoursPerProjectType: {
    bathroom_renovation: { baseHours: 8, unit: "m2", averageSize: 10, minHours: 4, maxHours: 200, beta: 1.0 },
    kitchen_plumbing: { baseHours: 4, unit: "m2", averageSize: 8, minHours: 3, maxHours: 100, beta: 1.0 },
    pipe_installation: { baseHours: 0.7, unit: "meter", averageSize: 15, minHours: 2, maxHours: 150, beta: 1.0 },
    district_heating: { baseHours: 16, unit: "connection", averageSize: 1, additionalPerUnit: 0.5, minHours: 8, maxHours: 40, beta: 1.0 },
    floor_heating: { baseHours: 1.5, unit: "m2", averageSize: 35, minHours: 4, maxHours: 200, beta: 1.0 },
    radiator_installation: { baseHours: 4, unit: "units", averageSize: 3, minHours: 2, maxHours: 80, beta: 1.0 },
    service_call: { baseHours: 3, unit: "job", averageSize: 1, minHours: 2, maxHours: 50, beta: 1.0 }
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

// Helper to convert text complexity to numeric
function complexityToNumeric(complexity: string): number {
  const mapping: Record<string, number> = {
    simple: 0.8,
    medium: 1.0,
    complex: 1.3,
    emergency: 1.5
  };
  return mapping[complexity] || 1.0;
}

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

    // Get historical analysis for better time estimates
    let historicalData = null;
    try {
      const analysis = caseData.extracted_data;
      if (analysis?.project) {
        const complexityNumeric = complexityToNumeric(analysis.project.complexity);
        
        const historicalResponse = await supabase.functions.invoke('historical-analysis', {
          body: {
            projectType: analysis.project.type,
            complexity: complexityNumeric,
            complexityText: analysis.project.complexity,
            estimatedSize: analysis.project.estimated_size,
            description: analysis.project.description
          }
        });
        
        if (historicalResponse.data) {
          historicalData = historicalResponse.data;
          console.log('Got historical analysis for calibration:', JSON.stringify(historicalData.analysis));
        }
      }
    } catch (histError) {
      console.log('Historical analysis not available, using defaults:', histError);
    }

    // Get AI-based material pricing
    let materialData;
    try {
      console.log('Calling material-lookup for AI pricing...');
      const materialResponse = await supabase.functions.invoke('material-lookup', {
        body: {
          projectType: caseData.extracted_data?.project?.type || 'service_call',
          projectDescription: caseData.extracted_data?.project?.description || 'Standard VVS arbejde',
          estimatedSize: caseData.extracted_data?.project?.estimated_size || 1,
          complexity: caseData.extracted_data?.project?.complexity || 'medium',
          materialeAnalyse: caseData.extracted_data?.materiale_analyse
        }
      });
      
      if (materialResponse.error) {
        console.error('Material lookup error:', materialResponse.error);
        materialData = { total_cost: 0, materials: [] };
      } else {
        materialData = materialResponse.data;
        console.log(`AI Material cost: ${materialData.total_cost} DKK`);
      }
    } catch (error) {
      console.error('Failed to get AI material pricing:', error);
      materialData = { total_cost: 0, materials: [] };
    }

    // Calculate pricing breakdown with AI materials and historical calibration
    const priceBreakdown = calculateProjectPrice(caseData.extracted_data, materialData, historicalData);
    const quoteNumber = `VVS-${Date.now().toString().slice(-6)}`;

    console.log('Price breakdown calculated:', JSON.stringify({
      laborHours: priceBreakdown.laborHours,
      laborCost: priceBreakdown.laborCost,
      vehicleCost: priceBreakdown.vehicleCost,
      materialCost: priceBreakdown.materialCost,
      subtotal: priceBreakdown.subtotal,
      vat: priceBreakdown.vat,
      total: priceBreakdown.total,
      breakdown: priceBreakdown.breakdown,
      materialSource: materialData ? (materialData.mode || 'ai_optimized') : 'standard_estimate',
      materialValidation: materialData?.validated_count || 0,
      materialCount: materialData?.materials?.length || 0,
      historicalCalibration: historicalData ? 'applied' : 'not_available',
      calibrationFactors: priceBreakdown.calibrationFactors
    }, null, 2));

    // Check for existing quotes to prevent duplicates
    const { data: existingQuotes, error: checkError } = await supabase
      .from('quotes')
      .select('id, status')
      .eq('case_id', caseId)
      .in('status', ['draft', 'sent']);

    if (checkError) {
      console.error('Error checking for existing quotes:', checkError);
    }

    if (existingQuotes && existingQuotes.length > 0) {
      console.log(`Quote already exists for case ${caseId}, skipping creation`);
      return new Response(
        JSON.stringify({ 
          error: 'Quote already exists',
          message: 'Der findes allerede et tilbud for denne sag',
          existing_quote_id: existingQuotes[0].id
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Create quote lines with detailed materials from AI
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
        description: `Servicebil og værktøj (${priceBreakdown.laborHours} timer)`,
        quantity: priceBreakdown.laborHours,
        unit_price: VALENTIN_PRICING_LOGIC.baseRates.serviceVehicle,
        total_price: priceBreakdown.vehicleCost,
        sort_order: 2,
      }
    ];

    // Add detailed material lines from AI analysis
    if (materialData?.materials && materialData.materials.length > 0) {
      materialData.materials.forEach((material: any, index: number) => {
        lines.push({
          quote_id: quote.id,
          line_type: 'material',
          description: material.description || 'Materiale',
          quantity: material.quantity || 1,
          unit_price: material.unit_price || 0,
          total_price: material.total_price || 0,
          material_code: material.product_code,
          sort_order: 10 + index,
        } as any);
      });
    } else {
      // Fallback single material line
      lines.push({
        quote_id: quote.id,
        line_type: 'material',
        description: `Materialer (${caseData.extracted_data?.project?.estimated_size || 1} ${caseData.extracted_data?.project?.size_unit || 'enheder'})`,
        quantity: caseData.extracted_data?.project?.estimated_size || 1,
        unit_price: priceBreakdown.materialCost / (caseData.extracted_data?.project?.estimated_size || 1),
        total_price: priceBreakdown.materialCost,
        sort_order: 10,
      });
    }

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
          calculation_details: priceBreakdown.breakdown,
          calibration_factors: priceBreakdown.calibrationFactors,
          material_source: materialData ? (materialData.mode || 'ai_optimized') : 'standard_estimate',
          material_validation: materialData?.validated_count || 0,
          material_count: materialData?.materials?.length || 0,
          ai_reasoning: materialData?.ai_reasoning,
          historical_calibration: historicalData ? 'applied' : 'not_available'
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

function calculateProjectPrice(analysis: any, materialData?: any, historicalData?: any): any {
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

  // Extract calibration parameters from historical data
  const beta = historicalData?.analysis?.beta || (config as any).beta || 1.0;
  const H = historicalData?.analysis?.historical_factor || 1.0;
  const baseHours = config.baseHours || 3;
  const averageSize = (config as any).averageSize || 1;
  const additionalPerUnit = (config as any).additionalPerUnit || 0;
  const minHours = (config as any).minHours || 2;
  const maxHours = (config as any).maxHours || 100;

  console.log(`Calibration: beta=${beta}, H=${H}, baseHours=${baseHours}, averageSize=${averageSize}`);

  // Calculate hours using reference-based formula
  // hours_raw = baseHours * (size / averageSize) ^ beta + max(size - 1, 0) * additionalPerUnit
  const sizeRatio = size / averageSize;
  const scaledHours = baseHours * Math.pow(sizeRatio, beta);
  const extraUnits = Math.max(size - 1, 0);
  const additionalHours = extraUnits * additionalPerUnit;
  let hours_raw = scaledHours + additionalHours;

  console.log(`Hours calculation: base=${baseHours}, sizeRatio=${sizeRatio.toFixed(2)}, beta=${beta}, scaled=${scaledHours.toFixed(2)}, additional=${additionalHours.toFixed(2)}, raw=${hours_raw.toFixed(2)}`);

  // Apply complexity multiplier
  const complexityMultiplier = VALENTIN_PRICING_LOGIC.complexityMultipliers[complexity as keyof typeof VALENTIN_PRICING_LOGIC.complexityMultipliers] || 1.0;
  let hours_adjusted = hours_raw * complexityMultiplier * H;

  console.log(`After complexity (${complexityMultiplier}) and historical factor (${H}): ${hours_adjusted.toFixed(2)}`);

  // Clamp to min/max bounds
  hours_adjusted = Math.max(minHours, Math.min(hours_adjusted, maxHours));
  
  // Round to nearest half hour (deferred to end)
  const hours = Math.round(hours_adjusted * 2) / 2;

  console.log(`Final hours after clamp and round: ${hours}`);

  // Calculate costs
  const laborCost = hours * VALENTIN_PRICING_LOGIC.baseRates.hourlyRate;
  
  // Vehicle cost proportional to hours
  const vehicleCost = hours * VALENTIN_PRICING_LOGIC.baseRates.serviceVehicle;
  
  // Use AI-calculated material cost if available, otherwise fallback to config
  let materialCost;
  if (materialData?.total_cost && materialData.total_cost > 0) {
    materialCost = materialData.total_cost;
    console.log(`Using AI material cost: ${materialCost} DKK`);
  } else {
    const unitMaterialCost = VALENTIN_PRICING_LOGIC.materialCostPerType[projectType as keyof typeof VALENTIN_PRICING_LOGIC.materialCostPerType] || 500;
    let baseMaterialCost = unitMaterialCost * size;
    
    // Apply size discount
    const discount = getSizeDiscount(size);
    materialCost = baseMaterialCost * (1 - discount);
    console.log(`Using fallback material cost: ${materialCost} DKK`);
  }

  // Apply minimum only to labor cost (not materials)
  const minimumLaborCost = VALENTIN_PRICING_LOGIC.baseRates.minimumProject / 2; // Half of project minimum
  const adjustedLaborCost = Math.max(laborCost, minimumLaborCost);
  const minimumApplied = adjustedLaborCost > laborCost;
  
  const subtotal = adjustedLaborCost + vehicleCost + materialCost;
  const vat = subtotal * 0.25;
  const total = subtotal + vat;

  return {
    laborHours: hours,
    laborCost: adjustedLaborCost,
    vehicleCost,
    materialCost,
    subtotal,
    vat,
    total,
    calibrationFactors: {
      beta,
      historicalFactor: H,
      complexityMultiplier,
      referenceSize: averageSize,
      actualSize: size,
      minimumApplied,
      vehicleCostType: 'hourly'
    },
    breakdown: [
      { 
        description: `${projectType.replace('_', ' ')} arbejde (${hours.toFixed(1)} timer)`, 
        amount: adjustedLaborCost, 
        calculation: `${hours.toFixed(1)} × ${VALENTIN_PRICING_LOGIC.baseRates.hourlyRate} kr${minimumApplied ? ' (minimum anvendt)' : ''}` 
      },
      { 
        description: `Servicevogn (${hours.toFixed(1)} timer)`, 
        amount: vehicleCost, 
        calculation: `${hours.toFixed(1)} × ${VALENTIN_PRICING_LOGIC.baseRates.serviceVehicle} kr/time` 
      },
      { 
        description: `Materialer (${size} ${config.unit})`, 
        amount: materialCost, 
        calculation: materialData?.total_cost ? 'AI-beregnet materialepris' : 'Standard materialepris'
      }
    ]
  };
}

function createFallbackPrice() {
  const hours = 4;
  const laborCost = hours * VALENTIN_PRICING_LOGIC.baseRates.hourlyRate;
  const vehicleCost = hours * VALENTIN_PRICING_LOGIC.baseRates.serviceVehicle;
  const materialCost = 2000;
  const subtotal = laborCost + vehicleCost + materialCost;
  const vat = subtotal * 0.25;

  return {
    laborHours: hours,
    laborCost,
    vehicleCost,
    materialCost,
    subtotal,
    vat,
    total: subtotal + vat,
    calibrationFactors: {
      beta: 1.0,
      historicalFactor: 1.0,
      complexityMultiplier: 1.0,
      referenceSize: 1,
      actualSize: 1,
      minimumApplied: false,
      vehicleCostType: 'hourly'
    },
    breakdown: [
      { description: `Standard VVS arbejde (${hours} timer)`, amount: laborCost, calculation: `${hours} × ${VALENTIN_PRICING_LOGIC.baseRates.hourlyRate} kr` },
      { description: `Servicevogn (${hours} timer)`, amount: vehicleCost, calculation: `${hours} × ${VALENTIN_PRICING_LOGIC.baseRates.serviceVehicle} kr/time` },
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
