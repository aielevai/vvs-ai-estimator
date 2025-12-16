import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to convert text complexity to numeric if needed
function ensureNumericComplexity(complexity: any): number {
  if (typeof complexity === 'number') return complexity;
  
  const mapping: Record<string, number> = {
    simple: 0.8,
    medium: 1.0,
    complex: 1.3,
    emergency: 1.5
  };
  
  return mapping[String(complexity).toLowerCase()] || 1.0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectType, complexity, description, estimatedSize } = await req.json();
    
    // Convert complexity to numeric
    const complexityNumeric = ensureNumericComplexity(complexity);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Historical analysis for: ${projectType} (complexity: ${complexityNumeric})`);

    // 1. Get historical time patterns and calculate beta
    const timeAnalysis = await analyzeHistoricalTime(supabase, projectType, complexityNumeric, estimatedSize);
    
    // 2. Get material patterns (BOM suggestions)
    const materialPatterns = await analyzeMaterialPatterns(supabase, projectType, estimatedSize);
    
    // 3. Calculate risk factors (with fallback for missing description)
    const riskAnalysis = await calculateRiskFactors(supabase, projectType, description || 'No description provided');
    
    // 4. Generate insights and confidence
    const insights = generateInsights(timeAnalysis, materialPatterns, riskAnalysis);

    return new Response(
      JSON.stringify({
        success: true,
        project_type: projectType,
        analysis: {
          time_estimate: timeAnalysis,
          material_patterns: materialPatterns,
          risk_factors: riskAnalysis,
          insights: insights,
          confidence: calculateConfidence(timeAnalysis, materialPatterns),
          // Calibration parameters for calculate-quote
          beta: timeAnalysis.beta || 1.0,
          historical_factor: timeAnalysis.historical_factor || 1.0
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in historical-analysis:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function analyzeHistoricalTime(supabase: any, projectType: string, complexity: number, estimatedSize: number) {
  console.log('Analyzing historical time patterns...');

  // Get historical projects AND learned projects (approved quotes)
  const [historicalResult, learnedResult] = await Promise.all([
    supabase
      .from('historical_projects')
      .select('total_hours, complexity_signals, total_project_cost, total_materials_cost, project_description')
      .eq('project_type', projectType)
      .not('total_hours', 'is', null)
      .gte('total_hours', 0.5)
      .lte('total_hours', 500),
    supabase
      .from('learned_projects')
      .select('actual_hours, actual_materials_cost, actual_total_cost, complexity, estimated_size, project_description, confidence_score')
      .eq('project_type', projectType)
      .eq('use_for_training', true)
      .not('actual_hours', 'is', null)
  ]);

  const { data: historicalProjects, error: historicalError } = historicalResult;
  const { data: learnedProjects, error: learnedError } = learnedResult;

  if (historicalError) {
    console.error('Historical time query error:', historicalError);
  }
  if (learnedError) {
    console.error('Learned projects query error:', learnedError);
  }

  // Combine both data sources
  const projects: any[] = [];

  // Add historical projects
  if (historicalProjects) {
    historicalProjects.forEach((p: any) => {
      projects.push({
        total_hours: p.total_hours,
        complexity_signals: p.complexity_signals,
        total_project_cost: p.total_project_cost,
        total_materials_cost: p.total_materials_cost,
        project_description: p.project_description,
        source: 'historical',
        weight: 1.0
      });
    });
  }

  // Add learned projects with higher weight (more recent, verified data)
  if (learnedProjects) {
    learnedProjects.forEach((p: any) => {
      projects.push({
        total_hours: p.actual_hours,
        complexity_signals: { complexity: p.complexity },
        total_project_cost: p.actual_total_cost,
        total_materials_cost: p.actual_materials_cost,
        project_description: p.project_description,
        estimated_size: p.estimated_size,
        source: 'learned',
        weight: 1.5 * (p.confidence_score || 0.8) // Higher weight for learned projects
      });
    });
    console.log(`📚 Including ${learnedProjects.length} learned projects in analysis`);
  }

  if (projects.length < 3) {
    console.log(`Insufficient historical data for ${projectType}, using defaults`);
    return getDefaultTimeEstimate(projectType);
  }

  // Try to extract sizes from descriptions and calculate beta
  let beta = 1.0;
  const projectsWithSize: Array<{hours: number, size: number}> = [];
  
  projects.forEach((p: any) => {
    const desc = (p.project_description || '').toLowerCase();
    const sizeMatch = desc.match(/(\d+(?:[\.,]\d+)?)\s*(m2|m²|meter|metre|kvadratmeter|stk|enheder)/i);
    if (sizeMatch) {
      const size = parseFloat(sizeMatch[1].replace(',', '.'));
      if (size > 0 && p.total_hours > 0) {
        projectsWithSize.push({ hours: p.total_hours, size });
      }
    }
  });

  // Calculate beta using log-log regression if we have enough data
  if (projectsWithSize.length >= 5) {
    console.log(`Calculating beta from ${projectsWithSize.length} projects with size data`);
    
    // Log-log regression: log(hours) = log(a) + beta * log(size)
    const logHours = projectsWithSize.map(p => Math.log(p.hours));
    const logSizes = projectsWithSize.map(p => Math.log(p.size));
    
    const n = projectsWithSize.length;
    const sumLogSize = logSizes.reduce((a, b) => a + b, 0);
    const sumLogHours = logHours.reduce((a, b) => a + b, 0);
    const sumLogSizeLogHours = logSizes.reduce((sum, logSize, i) => sum + logSize * logHours[i], 0);
    const sumLogSizeSquared = logSizes.reduce((sum, logSize) => sum + logSize * logSize, 0);
    
    const numerator = n * sumLogSizeLogHours - sumLogSize * sumLogHours;
    const denominator = n * sumLogSizeSquared - sumLogSize * sumLogSize;
    
    if (denominator !== 0) {
      beta = numerator / denominator;
      // Clamp beta to reasonable range [0.5, 1.5]
      beta = Math.max(0.5, Math.min(1.5, beta));
      console.log(`Calculated beta: ${beta.toFixed(3)}`);
    }
  }

  // Calculate statistics
  const hours = projects.map((p: any) => p.total_hours).sort((a: number, b: number) => a - b);
  const median = calculatePercentile(hours, 0.5);
  const p75 = calculatePercentile(hours, 0.75);
  const p25 = calculatePercentile(hours, 0.25);
  const mean = hours.reduce((a: number, b: number) => a + b, 0) / hours.length;
  const iqr = p75 - p25;

  // Calculate historical factor H
  // H adjusts the estimate based on how this project compares to typical projects
  // Default H = 1.0, can range from 0.7 to 1.3
  let H = 1.0;
  
  // If estimatedSize is available, adjust H based on typical size-to-hours relationship
  if (estimatedSize && projectsWithSize.length >= 3) {
    const typicalHoursPerUnit = mean / (projectsWithSize.reduce((sum, p) => sum + p.size, 0) / projectsWithSize.length);
    const variance = projectsWithSize.reduce((sum, p) => {
      const predicted = typicalHoursPerUnit * p.size;
      return sum + Math.pow(p.hours - predicted, 2);
    }, 0) / projectsWithSize.length;
    
    const cv = Math.sqrt(variance) / mean; // Coefficient of variation
    
    // If high variance, be more conservative (H > 1.0)
    if (cv > 0.5) {
      H = 1.1;
    } else if (cv > 0.3) {
      H = 1.05;
    }
    
    // If complexity is high, increase H
    if (complexity > 1.2) {
      H *= 1.1;
    }
    
    H = Math.max(0.7, Math.min(1.3, H));
  }

  console.log(`Historical factor H: ${H.toFixed(3)}`);

  // Calculate complexity adjustment for display purposes
  const complexityMultiplier = 1 + (complexity - 1.0) * 0.5;
  const alpha = 0.8;
  
  const baseEstimate = median + alpha * (p75 - median) * (complexity - 1.0);
  const finalEstimate = baseEstimate * complexityMultiplier;
  
  // Calculate risk buffer
  const riskHours = 0.2 * iqr;

  return {
    median,
    p75,
    p25,
    mean,
    iqr,
    sample_size: projects.length,
    base_estimate: baseEstimate,
    final_estimate: finalEstimate,
    risk_hours: riskHours,
    complexity_multiplier: complexityMultiplier,
    confidence: Math.min(0.95, projects.length / 20),
    beta,
    historical_factor: H,
    projects_with_size: projectsWithSize.length
  };
}

async function analyzeMaterialPatterns(supabase: any, projectType: string, estimatedSize: number) {
  console.log('Analyzing material patterns...');
  
  // Get historical material usage for this project type
  const { data: materials, error } = await supabase
    .from('historical_material_lines')
    .select(`
      product_code, description, quantity, unit, unit_price,
      historical_projects!inner(project_type, total_project_cost)
    `)
    .eq('historical_projects.project_type', projectType)
    .not('product_code', 'is', null);

  if (error) {
    console.error('Material patterns query error:', error);
    return getDefaultMaterialPatterns(projectType);
  }

  if (!materials || materials.length < 5) {
    console.log(`Insufficient material data for ${projectType}`);
    return getDefaultMaterialPatterns(projectType);
  }

  // Aggregate material frequency and patterns
  const materialFrequency = new Map();

  materials.forEach((item: any) => {
    const key = item.product_code;
    
    if (!materialFrequency.has(key)) {
      materialFrequency.set(key, {
        code: item.product_code,
        description: item.description,
        unit: item.unit,
        frequency: 0,
        quantities: [],
        avg_price: 0,
        total_price: 0
      });
    }

    const material = materialFrequency.get(key);
    material.frequency++;
    material.quantities.push(item.quantity);
    material.total_price += item.unit_price * item.quantity;
  });

  // Calculate suggestions based on frequency and project size
  const suggestions = Array.from(materialFrequency.values())
    .filter(m => m.frequency >= 2) // Appear in at least 2 projects
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10)
    .map(material => {
      const avgQuantity = material.quantities.reduce((a: number, b: number) => a + b, 0) / material.quantities.length;
      const sizeAdjustedQuantity = adjustQuantityForSize(avgQuantity, estimatedSize, projectType);
      
      return {
        product_code: material.code,
        description: material.description,
        suggested_quantity: Math.ceil(sizeAdjustedQuantity),
        unit: material.unit,
        frequency: material.frequency,
        confidence: Math.min(0.9, material.frequency / 10),
        avg_historical_quantity: avgQuantity
      };
    });

  return {
    suggestions,
    total_projects_analyzed: new Set(materials.map((m: any) => m.historical_projects?.id)).size,
    confidence: Math.min(0.9, suggestions.length / 8)
  };
}

async function calculateRiskFactors(supabase: any, projectType: string, description: string | undefined | null) {
  console.log('Calculating risk factors...');
  
  const riskSignals = extractRiskSignals(description);
  
  // Get historical variance for this project type
  const { data: projects, error } = await supabase
    .from('historical_projects')
    .select('total_hours, complexity_signals')
    .eq('project_type', projectType)
    .not('total_hours', 'is', null);

  let historicalVariance = 0.2; // Default 20% variance
  
  if (!error && projects && projects.length > 5) {
    const hours = projects.map((p: any) => p.total_hours);
    const mean = hours.reduce((a: number, b: number) => a + b, 0) / hours.length;
    const variance = hours.reduce((sum: number, hour: number) => sum + Math.pow(hour - mean, 2), 0) / hours.length;
    historicalVariance = Math.sqrt(variance) / mean; // Coefficient of variation
  }

  // Calculate risk score based on signals
  let riskScore = 0;
  const riskFactors = [];

  if (riskSignals.emergency) {
    riskScore += 0.3;
    riskFactors.push({ factor: 'Emergency/urgent work', impact: 0.3 });
  }
  
  if (riskSignals.old_building) {
    riskScore += 0.2;
    riskFactors.push({ factor: 'Older building complications', impact: 0.2 });
  }
  
  if (riskSignals.basement) {
    riskScore += 0.15;
    riskFactors.push({ factor: 'Basement/difficult access', impact: 0.15 });
  }
  
  if (riskSignals.complex_installation) {
    riskScore += 0.25;
    riskFactors.push({ factor: 'Complex installation', impact: 0.25 });
  }

  return {
    risk_score: Math.min(riskScore, 1.0),
    historical_variance: historicalVariance,
    risk_factors: riskFactors,
    signals: riskSignals
  };
}

function getDefaultTimeEstimate(projectType: string) {
  const defaults: Record<string, any> = {
    'radiator_installation': { median: 3, p75: 5, risk_hours: 1, beta: 1.0, historical_factor: 1.0 },
    'floor_heating': { median: 8, p75: 12, risk_hours: 2, beta: 0.9, historical_factor: 1.0 },
    'bathroom_renovation': { median: 12, p75: 18, risk_hours: 3, beta: 0.95, historical_factor: 1.0 },
    'district_heating': { median: 6, p75: 9, risk_hours: 1.5, beta: 1.0, historical_factor: 1.0 },
    'service_call': { median: 2, p75: 3, risk_hours: 0.5, beta: 1.0, historical_factor: 1.0 },
    'kitchen_plumbing': { median: 4, p75: 6, risk_hours: 1, beta: 1.0, historical_factor: 1.0 },
    'pipe_installation': { median: 5, p75: 8, risk_hours: 1.5, beta: 0.85, historical_factor: 1.0 }
  };
  
  const defaultValues = defaults[projectType] || { median: 4, p75: 6, risk_hours: 1, beta: 1.0, historical_factor: 1.0 };
  
  return {
    ...defaultValues,
    sample_size: 0,
    final_estimate: defaultValues.median,
    confidence: 0.3,
    projects_with_size: 0
  };
}

function getDefaultMaterialPatterns(projectType: string) {
  const patterns: Record<string, any[]> = {
    'radiator_installation': [
      { product_code: 'RAD-001', description: 'Radiator ventil', suggested_quantity: 2, confidence: 0.8 },
      { product_code: 'PIPE-016', description: 'Kobberbending 15mm', suggested_quantity: 4, confidence: 0.7 }
    ],
    'floor_heating': [
      { product_code: 'PEX-016', description: 'PEX rør 16mm', suggested_quantity: 80, confidence: 0.8 },
      { product_code: 'DIST-8', description: 'Fordelerboks 8-kreds', suggested_quantity: 1, confidence: 0.9 }
    ]
  };
  
  return {
    suggestions: patterns[projectType] || [],
    confidence: 0.3
  };
}

function adjustQuantityForSize(avgQuantity: number, estimatedSize: number, projectType: string): number {
  const sizeFactors: Record<string, number> = {
    'floor_heating': estimatedSize / 50, // Per m²
    'bathroom_renovation': estimatedSize / 8, // Per m²
    'radiator_installation': estimatedSize, // Per radiator
    'pipe_installation': estimatedSize / 10 // Per meter
  };
  
  const factor = sizeFactors[projectType] || 1;
  return avgQuantity * factor;
}

function extractRiskSignals(description: string | undefined | null): any {
  const desc = (description || '').toLowerCase();
  
  return {
    emergency: desc.includes('akut') || desc.includes('læk') || desc.includes('haste'),
    old_building: desc.includes('gammel') || desc.includes('ældre') || desc.includes('1920') || desc.includes('1930'),
    basement: desc.includes('kælder') || desc.includes('underetage'),
    complex_installation: desc.includes('kompleks') || desc.includes('omfattende') || desc.includes('svær'),
    access_issues: desc.includes('adgang') || desc.includes('svær tilgang') || desc.includes('snæver'),
    weekend_work: desc.includes('weekend') || desc.includes('lørdag') || desc.includes('søndag')
  };
}

function calculatePercentile(sorted: number[], percentile: number): number {
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;
  
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function generateInsights(timeAnalysis: any, materialPatterns: any, riskAnalysis: any): string[] {
  const insights = [];
  
  if (timeAnalysis.sample_size > 10) {
    insights.push(`Baseret på ${timeAnalysis.sample_size} historiske projekter af samme type`);
  }
  
  if (timeAnalysis.beta !== 1.0) {
    const scaling = timeAnalysis.beta < 1.0 ? 'sublineær' : 'superlineær';
    insights.push(`Historisk data viser ${scaling} skalering (β=${timeAnalysis.beta.toFixed(2)})`);
  }
  
  if (riskAnalysis.risk_score > 0.3) {
    insights.push(`Høj risikofaktor (${Math.round(riskAnalysis.risk_score * 100)}%) - tilføj ekstra buffer`);
  }
  
  if (materialPatterns.confidence > 0.7) {
    insights.push(`Høj konfidens på materialeforslag baseret på historiske data`);
  }
  
  if (timeAnalysis.iqr > timeAnalysis.median * 0.5) {
    insights.push(`Stor variation i historiske timer - øget usikkerhed`);
  }
  
  return insights;
}

function calculateConfidence(timeAnalysis: any, materialPatterns: any): number {
  const timeConfidence = timeAnalysis.confidence || 0.3;
  const materialConfidence = materialPatterns.confidence || 0.3;
  
  return (timeConfidence + materialConfidence) / 2;
}
