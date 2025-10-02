import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache for pricing configuration
let cachedPricingConfig: any = null;
let cachedPricingProfiles: any = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 1 minute cache

// Fallback configuration from environment variables
const FALLBACK_CONFIG = {
  hourlyRate: Number(Deno.env.get('HOURLY_RATE') || '595'),
  serviceVehicleRate: Number(Deno.env.get('SERVICE_VEHICLE_RATE') || '65'),
  minimumProject: Number(Deno.env.get('MINIMUM_PROJECT') || '4500'),
  vatRate: Number(Deno.env.get('VAT_RATE') || '0.25'),
};

// Default profiles as fallback
const DEFAULT_PROFILES: Record<string, any> = {
  bathroom_renovation: { baseHours: 8, averageSize: 10, beta: 1.0, minHours: 4, maxHours: 200, minLaborHours: 6, applyMinimumProject: false, materialCostPerUnit: 3500 },
  kitchen_plumbing: { baseHours: 4, averageSize: 8, beta: 1.0, minHours: 3, maxHours: 100, minLaborHours: 4, applyMinimumProject: false, materialCostPerUnit: 2200 },
  pipe_installation: { baseHours: 0.7, averageSize: 15, beta: 1.0, minHours: 2, maxHours: 150, minLaborHours: 3, applyMinimumProject: false, additionalPerUnit: 0, materialCostPerUnit: 180 },
  district_heating: { baseHours: 16, averageSize: 1, beta: 1.0, minHours: 8, maxHours: 40, minLaborHours: 8, applyMinimumProject: false, additionalPerUnit: 0.5, materialCostPerUnit: 24000 },
  floor_heating: { baseHours: 1.5, averageSize: 35, beta: 1.0, minHours: 4, maxHours: 200, minLaborHours: 4, applyMinimumProject: false, materialCostPerUnit: 800 },
  radiator_installation: { baseHours: 4, averageSize: 3, beta: 1.0, minHours: 2, maxHours: 80, minLaborHours: 3, applyMinimumProject: false, materialCostPerUnit: 2500 },
  service_call: { baseHours: 3, averageSize: 1, beta: 1.0, minHours: 2, maxHours: 50, minLaborHours: 2, applyMinimumProject: true, materialCostPerUnit: 500 }
};

// Load pricing configuration from database with caching
async function loadPricingConfig(supabase: any): Promise<any> {
  const now = Date.now();
  
  // Return cached config if still valid
  if (cachedPricingConfig && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedPricingConfig;
  }

  try {
    // Fetch latest pricing config
    const { data: configData, error: configError } = await supabase
      .from('pricing_config')
      .select('*')
      .order('effective_from', { ascending: false })
      .limit(1)
      .single();

    if (configError || !configData) {
      console.log('Failed to load pricing_config from database, using fallback:', configError);
      cachedPricingConfig = FALLBACK_CONFIG;
    } else {
      cachedPricingConfig = {
        hourlyRate: Number(configData.hourly_rate),
        serviceVehicleRate: Number(configData.service_vehicle_rate),
        minimumProject: Number(configData.minimum_project),
        vatRate: Number(configData.vat_rate),
      };
      console.log('Loaded pricing config from database:', cachedPricingConfig);
    }

    cacheTimestamp = now;
    return cachedPricingConfig;
  } catch (error) {
    console.error('Error loading pricing config:', error);
    return FALLBACK_CONFIG;
  }
}

// Load pricing profiles from database with caching
async function loadPricingProfiles(supabase: any): Promise<any> {
  const now = Date.now();
  
  // Return cached profiles if still valid
  if (cachedPricingProfiles && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedPricingProfiles;
  }

  try {
    const { data: profilesData, error: profilesError } = await supabase
      .from('pricing_profiles')
      .select('*');

    if (profilesError || !profilesData || profilesData.length === 0) {
      console.log('Failed to load pricing_profiles from database, using default profiles:', profilesError);
      cachedPricingProfiles = DEFAULT_PROFILES;
    } else {
      cachedPricingProfiles = {};
      for (const profile of profilesData) {
        cachedPricingProfiles[profile.project_type] = {
          baseHours: Number(profile.base_hours),
          averageSize: Number(profile.average_size),
          beta: Number(profile.beta_default),
          minHours: Number(profile.min_hours),
          maxHours: Number(profile.max_hours),
          minLaborHours: Number(profile.min_labor_hours),
          applyMinimumProject: Boolean(profile.apply_minimum_project),
          materialCostPerUnit: Number(profile.material_cost_per_unit),
          additionalPerUnit: 0, // Set specific values if needed
        };
        
        // Special handling for district_heating
        if (profile.project_type === 'district_heating') {
          cachedPricingProfiles[profile.project_type].additionalPerUnit = 0.5;
        }
      }
      console.log('Loaded pricing profiles from database');
    }

    cacheTimestamp = now;
    return cachedPricingProfiles;
  } catch (error) {
    console.error('Error loading pricing profiles:', error);
    return DEFAULT_PROFILES;
  }
}

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

    // Load pricing configuration
    const pricingConfig = await loadPricingConfig(supabase);
    const pricingProfiles = await loadPricingProfiles(supabase);

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
            size: analysis.project.estimated_size,
            complexity: complexityNumeric,
            signals: analysis.project
          }
        });

        if (historicalResponse.data) {
          historicalData = historicalResponse.data;
          console.log('Historical analysis result:', historicalData);
        }
      }
    } catch (historicalError) {
      console.log('Historical analysis failed or not available:', historicalError);
    }

    // Get AI material lookup
    let materialData = null;
    try {
      const analysis = caseData.extracted_data;
      if (analysis?.project) {
        const materialResponse = await supabase.functions.invoke('material-lookup', {
          body: { 
            projectType: analysis.project.type,
            projectDescription: analysis.project.description || caseData.description || '',
            estimatedSize: analysis.project.estimated_size,
            complexity: analysis.project.complexity || 'medium',
            materialeAnalyse: analysis.materiale_analyse
          }
        });

        if (materialResponse.data && !materialResponse.error) {
          materialData = materialResponse.data;
          console.log('Material lookup result:', materialData);
        }
      }
    } catch (materialError) {
      console.log('Material lookup failed or not available:', materialError);
    }

    // Calculate quote
    const priceBreakdown = calculateProjectPrice(
      caseData.extracted_data, 
      materialData, 
      historicalData,
      pricingConfig,
      pricingProfiles
    );

    // Check for existing quotes for this case
    const { data: existingQuotes } = await supabase
      .from('quotes')
      .select('id')
      .eq('case_id', caseId)
      .limit(1);

    if (existingQuotes && existingQuotes.length > 0) {
      console.log('Quote already exists for case:', caseId);
      return new Response(
        JSON.stringify({ 
          error: 'Quote already exists for this case',
          existingQuoteId: existingQuotes[0].id 
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create quote record
    const quoteNumber = `Q-${Date.now()}`;
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);

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
        valid_until: validUntil.toISOString().split('T')[0]
      })
      .select()
      .single();

    if (quoteError) {
      console.error('Failed to create quote:', quoteError);
      return new Response(
        JSON.stringify({ error: 'Failed to create quote' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create quote lines - itemized materials if available
    const quoteLines: any[] = [];
    
    // Add labor and vehicle lines
    const laborLine = priceBreakdown.breakdown.find((b: any) => b.description.includes('arbejde'));
    const vehicleLine = priceBreakdown.breakdown.find((b: any) => b.description.includes('Servicevogn'));
    
    if (laborLine) {
      quoteLines.push({
        quote_id: quote.id,
        line_type: 'labor',
        description: laborLine.description,
        quantity: priceBreakdown.laborHours,
        unit_price: pricingConfig?.hourly_rate || 595,
        total_price: laborLine.amount,
        sort_order: 0
      });
    }
    
    if (vehicleLine) {
      quoteLines.push({
        quote_id: quote.id,
        line_type: 'vehicle',
        description: vehicleLine.description,
        quantity: priceBreakdown.laborHours,
        unit_price: pricingConfig?.service_vehicle_rate || 65,
        total_price: vehicleLine.amount,
        sort_order: 1
      });
    }
    
    // Add itemized materials if available
    if (materialData?.materials && Array.isArray(materialData.materials) && materialData.materials.length > 0) {
      console.log(`Creating ${materialData.materials.length} itemized material lines`);
      materialData.materials.forEach((material: any, index: number) => {
        quoteLines.push({
          quote_id: quote.id,
          line_type: 'material',
          description: material.description || material.short_description || 'Materiale',
          material_code: material.supplier_item_id || material.vvs_number || material.product_code,
          quantity: material.quantity || 1,
          unit_price: material.unit_price || 0,
          total_price: material.total_price || (material.unit_price * material.quantity),
          sort_order: 2 + index
        });
      });
    } else {
      // No itemized materials - add single material line as fallback
      console.log('No itemized materials available from lookup - using single material line');
      const materialLine = priceBreakdown.breakdown.find((b: any) => b.description.includes('Materialer'));
      if (materialLine) {
        quoteLines.push({
          quote_id: quote.id,
          line_type: 'material',
          description: materialLine.description,
          quantity: 1,
          unit_price: materialLine.amount,
          total_price: materialLine.amount,
          sort_order: 2
        });
      }
    }

    const { error: linesError } = await supabase
      .from('quote_lines')
      .insert(quoteLines);

    if (linesError) {
      console.error('Failed to create quote lines:', linesError);
    }

    // Update case status
    await supabase
      .from('cases')
      .update({ status: 'quoted' })
      .eq('id', caseId);

    return new Response(
      JSON.stringify({ 
        success: true,
        quote: {
          ...quote,
          quote_lines: quoteLines
        },
        pricing_analysis: priceBreakdown
      }),
      { 
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

function calculateProjectPrice(
  analysis: any, 
  materialData?: any, 
  historicalData?: any,
  pricingConfig?: any,
  pricingProfiles?: any
): any {
  // Use provided config or fallback
  const config = pricingConfig || FALLBACK_CONFIG;
  const profiles = pricingProfiles || DEFAULT_PROFILES;

  if (!analysis?.project) return createFallbackPrice(config, profiles);

  const projectType = analysis.project.type;
  const size = Number(analysis.project.estimated_size || 1);
  const complexity = analysis.project.complexity || 'medium';

  console.log(`Calculating price for: ${projectType}, size: ${size}, complexity: ${complexity}`);

  const profile = profiles[projectType];
  if (!profile) {
    console.log(`No profile found for project type: ${projectType}, using fallback`);
    return createFallbackPrice(config, profiles);
  }

  // Extract calibration parameters from historical data
  const beta = historicalData?.analysis?.beta || profile.beta || 1.0;
  const H = historicalData?.analysis?.historical_factor || 1.0;
  const baseHours = profile.baseHours || 3;
  const averageSize = profile.averageSize || 1;
  const additionalPerUnit = profile.additionalPerUnit || 0;
  const minHours = profile.minHours || 2;
  const maxHours = profile.maxHours || 100;
  const minLaborHours = profile.minLaborHours || minHours;
  const applyMinimumProject = profile.applyMinimumProject || false;

  console.log(`Calibration: beta=${beta}, H=${H}, baseHours=${baseHours}, averageSize=${averageSize}, minLaborHours=${minLaborHours}`);

  // Calculate hours using reference-based formula
  // hours_raw = baseHours * (size / averageSize) ^ beta + max(size - 1, 0) * additionalPerUnit
  const sizeRatio = size / averageSize;
  const scaledHours = baseHours * Math.pow(sizeRatio, beta);
  const extraUnits = Math.max(size - 1, 0);
  const additionalHours = extraUnits * additionalPerUnit;
  let hours_raw = scaledHours + additionalHours;

  console.log(`Hours calculation: base=${baseHours}, sizeRatio=${sizeRatio.toFixed(2)}, beta=${beta}, scaled=${scaledHours.toFixed(2)}, additional=${additionalHours.toFixed(2)}, raw=${hours_raw.toFixed(2)}`);

  // Apply complexity multiplier
  const complexityMultiplier = complexityToNumeric(complexity);
  let hours_adjusted = hours_raw * complexityMultiplier * H;

  console.log(`After complexity (${complexityMultiplier}) and historical factor (${H}): ${hours_adjusted.toFixed(2)}`);

  // Clamp to min/max bounds
  hours_adjusted = Math.max(minHours, Math.min(hours_adjusted, maxHours));
  
  // Round to nearest half hour
  const hours = Math.round(hours_adjusted * 2) / 2;

  console.log(`Final hours after clamp and round: ${hours}`);

  // Calculate labor cost with minimum labor hours
  const calculatedLaborCost = hours * config.hourlyRate;
  const minimumLaborCost = minLaborHours * config.hourlyRate;
  const laborCost = Math.max(calculatedLaborCost, minimumLaborCost);
  const laborMinimumApplied = laborCost > calculatedLaborCost;

  console.log(`Labor cost: calculated=${calculatedLaborCost}, minimum=${minimumLaborCost}, final=${laborCost}, minimumApplied=${laborMinimumApplied}`);
  
  // Vehicle cost proportional to hours
  const vehicleCost = hours * config.serviceVehicleRate;
  
  // Use AI-calculated material cost if available, otherwise fallback to config
  let materialCost;
  let materialSource = 'fallback';
  if (materialData?.total_cost && materialData.total_cost > 0) {
    materialCost = materialData.total_cost;
    materialSource = 'ai';
    console.log(`Using AI material cost: ${materialCost} DKK`);
  } else {
    const unitMaterialCost = profile.materialCostPerUnit || 500;
    materialCost = unitMaterialCost * size;
    console.log(`Using fallback material cost: ${materialCost} DKK`);
  }

  // Calculate subtotal before project minimum
  let subtotal = laborCost + vehicleCost + materialCost;
  let projectMinimumApplied = false;

  // Apply project minimum only for specific project types (e.g., service_call)
  if (applyMinimumProject && subtotal < config.minimumProject) {
    console.log(`Applying project minimum: ${config.minimumProject} (was ${subtotal})`);
    subtotal = config.minimumProject;
    projectMinimumApplied = true;
  }

  const vat = subtotal * config.vatRate;
  const total = subtotal + vat;

  const breakdown = [
    { 
      description: `${projectType.replace(/_/g, ' ')} arbejde (${hours.toFixed(1)} timer)`, 
      amount: laborCost, 
      calculation: laborMinimumApplied 
        ? `${minLaborHours} timer minimum × ${config.hourlyRate} kr (beregnet: ${hours.toFixed(1)} timer)`
        : `${hours.toFixed(1)} × ${config.hourlyRate} kr`
    },
    { 
      description: `Servicevogn (${hours.toFixed(1)} timer)`, 
      amount: vehicleCost, 
      calculation: `${hours.toFixed(1)} × ${config.serviceVehicleRate} kr/time` 
    },
    { 
      description: `Materialer (${size} ${analysis.project.size_unit || 'm2'})`, 
      amount: materialCost, 
      calculation: materialSource === 'ai' ? 'AI-beregnet materialepris' : 'Standard materialepris'
    }
  ];

  // Add project minimum line if applied
  if (projectMinimumApplied) {
    const minimumAdjustment = config.minimumProject - (laborCost + vehicleCost + materialCost);
    breakdown.push({
      description: 'Projektminimum tillæg',
      amount: minimumAdjustment,
      calculation: `Samlet minimum: ${config.minimumProject} kr`
    });
  }

  return {
    laborHours: hours,
    laborCost,
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
      laborMinimumApplied,
      projectMinimumApplied,
      minLaborHours,
      vehicleCostType: 'hourly',
      materialSource
    },
    breakdown
  };
}

function createFallbackPrice(pricingConfig?: any, pricingProfiles?: any) {
  const config = pricingConfig || FALLBACK_CONFIG;
  const hours = 4;
  const laborCost = hours * config.hourlyRate;
  const vehicleCost = hours * config.serviceVehicleRate;
  const materialCost = 2000;
  const subtotal = laborCost + vehicleCost + materialCost;
  const vat = subtotal * config.vatRate;

  return {
    laborHours: hours,
    laborCost,
    vehicleCost,
    materialCost,
    subtotal,
    vat,
    total: subtotal + vat,
    breakdown: [
      { description: 'Arbejde (estimeret)', amount: laborCost, calculation: `${hours} × ${config.hourlyRate} kr` },
      { description: 'Servicevogn', amount: vehicleCost, calculation: `${hours} × ${config.serviceVehicleRate} kr` },
      { description: 'Materialer (estimeret)', amount: materialCost, calculation: 'Standard estimat' }
    ]
  };
}

function getSizeDiscount(size: number): number {
  if (size >= 150) return 0.2;
  if (size >= 50) return 0.1;
  return 0;
}
