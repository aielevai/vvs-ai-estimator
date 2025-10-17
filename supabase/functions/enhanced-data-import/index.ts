import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeUnitPrice(p: any): number {
  const base = Number(p.net_price ?? p.gross_price ?? 0);
  const pq = Number(p.price_quantity ?? 1) || 1;
  const of1 = Number(p.ordering_factor_1 ?? 1) || 1;
  return base / (pq * of1);
}

function buildNormalizedText(p: any): string {
  const parts = [
    p.short_description, p.long_description,
    p.vvs_number, p.ean_id, p.supplier_item_id
  ].filter(Boolean).join(' ').toLowerCase();
  return parts.normalize("NFKD");
}

function inferCategory(p: any): string {
  const text = (p.short_description || p.long_description || '').toLowerCase();
  if (text.includes('rør') || text.includes('pipe')) return 'rør';
  if (text.includes('ventil') || text.includes('valve')) return 'ventil';
  if (text.includes('armatur') || text.includes('faucet')) return 'armatur';
  if (text.includes('afløb') || text.includes('drain')) return 'afløb';
  if (text.includes('radiator')) return 'radiator';
  if (text.includes('gulvvarme') || text.includes('floor heating')) return 'gulvvarme';
  return 'diverse';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dataType, csvData } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Starting import for dataType: ${dataType}`);

    if (dataType === 'enhanced_products') {
      return await importEnhancedProducts(supabase, csvData);
    } else if (dataType === 'historical_data') {
      return await importHistoricalData(supabase, csvData);
    } else {
      throw new Error(`Unknown dataType: ${dataType}`);
    }

  } catch (error) {
    console.error('Error in enhanced-data-import:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function importEnhancedProducts(supabase: any, csvData: string) {
  console.log('Processing enhanced products CSV data...');
  
  const lines = csvData.trim().split('\n');
  const headers = lines[0].split(';').map(h => h.trim().replace(/"/g, ''));
  
  console.log('CSV Headers:', headers);
  
  // Map CSV headers to our database fields
  const fieldMapping: Record<string, string> = {
    'Short Item Description': 'short_description',
    'Long Item Description': 'long_description',
    'Supplier Item ID': 'supplier_item_id',
    'VVS Number': 'vvs_number',
    'EAN ID': 'ean_id',
    'GrossPrice': 'gross_price',
    'NetPrice': 'net_price',
    'Price Quantity': 'price_quantity',
    'Price Unit': 'price_unit',
    '1st Ordering Unit': 'ordering_unit_1',
    '1st Ordering Unit Factor': 'ordering_factor_1',
    '2. Unit - Ordering Unit': 'ordering_unit_2',
    '2nd Ordering Unit Factor': 'ordering_factor_2',
    'Leadtime': 'leadtime',
    'IsOnStock': 'is_on_stock',
    'Image URL': 'image_url',
    'Link': 'link'
  };

  let processed = 0;
  let errors = 0;
  const batchSize = 1000;

  for (let i = 1; i < lines.length; i += batchSize) {
    const batch = [];
    
    for (let j = i; j < Math.min(i + batchSize, lines.length); j++) {
      const line = lines[j];
      if (!line.trim()) continue;
      
      try {
        const values = parseCsvLine(line);
        if (values.length !== headers.length) {
          console.warn(`Line ${j}: Expected ${headers.length} fields, got ${values.length}`);
          continue;
        }

        const product: any = {
          normalized_text: ''
        };

        // Map CSV fields to database fields
        headers.forEach((header, index) => {
          const dbField = fieldMapping[header];
          if (dbField && values[index] !== undefined) {
            let value: any = values[index].trim();
            
            if (dbField === 'gross_price' || dbField === 'net_price') {
              value = parseFloat(value) || 0;
            } else if (dbField === 'price_quantity' || dbField === 'ordering_factor_1' || dbField === 'ordering_factor_2') {
              value = parseFloat(value) || 1;
            } else if (dbField === 'leadtime') {
              value = parseInt(value) || 0;
            } else if (dbField === 'is_on_stock') {
              value = value.toLowerCase() === 'true' || value === '1';
            }
            
            product[dbField] = value;
          }
        });

        // FASE 1: Normaliser enhedspris og tekst
        product.unit_price_norm = normalizeUnitPrice(product);
        product.normalized_text = buildNormalizedText(product);
        product.category = inferCategory(product);

        batch.push(product);
      } catch (error) {
        console.error(`Error parsing line ${j}:`, error);
        errors++;
      }
    }

    if (batch.length > 0) {
      try {
        const { error } = await supabase
          .from('enhanced_supplier_prices')
          .upsert(batch, { 
            onConflict: 'vvs_number',
            ignoreDuplicates: false 
          });

        if (error) {
          console.error('Batch upsert error:', error);
          errors += batch.length;
        } else {
          processed += batch.length;
          console.log(`Processed batch: ${processed} products total`);
        }
      } catch (batchError) {
        console.error('Batch processing error:', batchError);
        errors += batch.length;
      }
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      processed,
      errors,
      message: `Successfully imported ${processed} products with ${errors} errors`
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function importHistoricalData(supabase: any, csvData: string) {
  console.log('Processing historical data CSV...');
  
  const lines = csvData.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  console.log('Historical CSV Headers:', headers);
  
  let processed = 0;
  let errors = 0;
  const batchSize = 500;

  for (let i = 1; i < lines.length; i += batchSize) {
    const batch = [];
    
    for (let j = i; j < Math.min(i + batchSize, lines.length); j++) {
      const line = lines[j];
      if (!line.trim()) continue;
      
      try {
        const values = parseCsvLine(line);
        
        const project = {
          customer_ref: values[headers.indexOf('kundenr')] || values[headers.indexOf('alias')],
          project_type: classifyProjectType(values[headers.indexOf('beskrivelse')] || ''),
          project_description: values[headers.indexOf('beskrivelse')],
          total_hours: calculateHours(values, headers),
          total_materials_cost: parseFloat(values[headers.indexOf('linjetotal')]) || 0,
          total_project_cost: parseFloat(values[headers.indexOf('total')]) || 0,
          complexity_signals: extractComplexitySignals(values[headers.indexOf('beskrivelse')] || ''),
          report_from: parseDate(values[headers.indexOf('report_from')]),
          report_to: parseDate(values[headers.indexOf('report_to')]),
          line_date_assumed: parseDate(values[headers.indexOf('line_date_assumed')]),
          date_source: values[headers.indexOf('date_source')] || 'unknown'
        };

        batch.push(project);
      } catch (error) {
        console.error(`Error parsing historical line ${j}:`, error);
        errors++;
      }
    }

    if (batch.length > 0) {
      try {
        const { error } = await supabase
          .from('historical_projects')
          .upsert(batch);

        if (error) {
          console.error('Historical batch error:', error);
          errors += batch.length;
        } else {
          processed += batch.length;
          console.log(`Processed historical batch: ${processed} projects total`);
        }
      } catch (batchError) {
        console.error('Historical batch processing error:', batchError);
        errors += batch.length;
      }
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      processed,
      errors,
      message: `Successfully imported ${processed} historical projects with ${errors} errors`
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function parseCsvLine(line: string): string[] {
  const values = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
    } else if ((char === ';' || char === ',') && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
    i++;
  }

  values.push(current.trim());
  return values;
}

function classifyProjectType(description: string): string {
  const desc = description.toLowerCase();
  
  if (desc.includes('radiator') || desc.includes('radiatorskift')) return 'radiator_installation';
  if (desc.includes('gulvvarme') || desc.includes('varmesl')) return 'floor_heating';
  if (desc.includes('badeværelse') || desc.includes('bad')) return 'bathroom_renovation';
  if (desc.includes('fjernvarme') || desc.includes('varmeveksler')) return 'district_heating';
  if (desc.includes('lækage') || desc.includes('læk') || desc.includes('akut')) return 'service_call';
  if (desc.includes('køkken')) return 'kitchen_plumbing';
  if (desc.includes('rør') || desc.includes('installation')) return 'pipe_installation';
  
  return 'service_call';
}

function calculateHours(values: string[], headers: string[]): number {
  const totalIndex = headers.indexOf('total');
  const materialIndex = headers.indexOf('linjetotal');
  
  if (totalIndex >= 0 && materialIndex >= 0) {
    const total = parseFloat(values[totalIndex]) || 0;
    const materials = parseFloat(values[materialIndex]) || 0;
    const laborCost = total - materials;
    // Assume 750 DKK/hour (standard rate)
    return Math.max(0, laborCost / 750);
  }
  
  return 0;
}

function extractComplexitySignals(description: string): object {
  const desc = description.toLowerCase();
  const signals: any = {
    basement: desc.includes('kælder'),
    old_building: desc.includes('gammel') || desc.includes('ældre'),
    emergency: desc.includes('akut') || desc.includes('læk'),
    large_project: desc.includes('stor') || desc.includes('omfattende'),
    small_project: desc.includes('lille') || desc.includes('simpel')
  };
  
  return signals;
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  try {
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

function inferCategory(product: any): string {
  const desc = (product.short_description || product.long_description || '').toLowerCase();
  
  if (desc.includes('rør') || desc.includes('pipe')) return 'pipe';
  if (desc.includes('radiator')) return 'radiators';
  if (desc.includes('gulvvarme')) return 'floor_heating';
  if (desc.includes('ventil') || desc.includes('valve')) return 'valves';
  if (desc.includes('armatur') || desc.includes('fixture')) return 'fixtures';
  if (desc.includes('flise') || desc.includes('tile')) return 'tiles';
  if (desc.includes('membran') || desc.includes('tætning')) return 'waterproofing';
  if (desc.includes('isoler')) return 'insulation';
  if (desc.includes('ventilat')) return 'ventilation';
  
  return 'general';
}