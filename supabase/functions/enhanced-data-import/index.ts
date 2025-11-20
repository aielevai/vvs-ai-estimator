import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type FileMatchOptions = {
  exact?: string;
  prefix?: string;
  extension?: string;
};

type DownloadedFile = {
  name: string;
  text: string;
  hash: string;
};

async function listLatestFile(
  supabase: any,
  bucket: string,
  options: FileMatchOptions
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .list('', {
      limit: 100,
      offset: 0,
      sortBy: { column: 'updated_at', order: 'desc' }
    });

  if (error) {
    throw new Error(`Failed to list files in ${bucket}: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  if (options.exact) {
    const exactMatch = data.find((file: any) => file.name === options.exact);
    if (exactMatch) {
      return exactMatch.name;
    }
  }

  const prefixMatch = data.find((file: any) => {
    const prefixOk = options.prefix ? file.name.startsWith(options.prefix) : true;
    const extensionOk = options.extension ? file.name.toLowerCase().endsWith(options.extension) : true;
    return prefixOk && extensionOk;
  });

  return prefixMatch ? prefixMatch.name : null;
}

async function bufferToHash(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function decodeBuffer(buffer: ArrayBuffer): Promise<string> {
  const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
  const utf8Text = utf8Decoder.decode(buffer);
  if (utf8Text.includes('�')) {
    try {
      const latinDecoder = new TextDecoder('latin1', { fatal: false });
      const latinText = latinDecoder.decode(buffer);
      return latinText;
    } catch {
      return utf8Text;
    }
  }
  return utf8Text;
}

async function downloadAndDecodeFile(
  supabase: any,
  bucket: string,
  name: string
): Promise<DownloadedFile> {
  const { data, error } = await supabase.storage.from(bucket).download(name);
  if (error) {
    throw new Error(`Failed to download ${name} from ${bucket}: ${error.message}`);
  }
  const buffer = await data.arrayBuffer();
  const text = await decodeBuffer(buffer);
  const hash = await bufferToHash(buffer);
  return { name, text, hash };
}

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

function fixEncoding(text: string): string {
  // Fix common Danish character encoding issues
  return text
    .replace(/�/g, 'ø')
    .replace(/�/g, 'å')
    .replace(/�/g, 'æ')
    .replace(/�/g, 'Ø')
    .replace(/�/g, 'Å')
    .replace(/�/g, 'Æ');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let requestPayload: any = null;
    try {
      requestPayload = await req.json();
    } catch {
      requestPayload = null;
    }

    const triggeredBy = requestPayload?.triggeredBy
      || req.headers.get('x-triggered-by')
      || 'manual';

    console.log('[enhanced-data-import] Triggered by:', triggeredBy);

    console.log('Starting full data import from Storage...');

    const csvFileName = await listLatestFile(
      supabase,
      'product-data',
      {
        exact: requestPayload?.csvFile ?? 'ahlsell-latest.csv',
        prefix: 'ahlsell',
        extension: '.csv'
      }
    );

    if (!csvFileName) {
      throw new Error('No CSV file found in product-data bucket. Upload ahlsell CSV before running import.');
    }

    const csvFile = await downloadAndDecodeFile(supabase, 'product-data', csvFileName);
    console.log(`CSV file selected: ${csvFile.name} (hash ${csvFile.hash.slice(0, 12)}...)`);

    const discountFileName = await listLatestFile(
      supabase,
      'product-data',
      {
        exact: requestPayload?.discountFile ?? 'discount.txt',
        prefix: 'discount',
        extension: '.txt'
      }
    );

    let discountFile: DownloadedFile | null = null;
    if (discountFileName) {
      try {
        discountFile = await downloadAndDecodeFile(supabase, 'product-data', discountFileName);
        console.log(`Discount file selected: ${discountFile.name} (hash ${discountFile.hash.slice(0, 12)}...)`);
      } catch (discountErr) {
        console.warn('Could not download discount file:', discountErr);
      }
    } else {
      console.warn('No discount file found in bucket, continuing without discounts');
    }

    const csvData = csvFile.text;
    const discountData = discountFile?.text ?? '';

    // 3. Clear old data
    console.log('Deleting old data...');
    await supabase.from('enhanced_supplier_prices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('discount_codes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    console.log('Old data cleared');

    // 4. Import new data
    const productsResult = await importEnhancedProducts(supabase, csvData);
    
    let discountResult = { processed: 0, errors: 0 };
    if (discountData?.trim()) {
      discountResult = await importDiscountCodes(supabase, discountData);
    }

    await supabase
      .from('data_import_runs')
      .insert({
        csv_filename: csvFile.name,
        csv_checksum: csvFile.hash,
        discount_filename: discountFile?.name ?? null,
        discount_checksum: discountFile?.hash ?? null,
        products_processed: productsResult.processed,
        products_errors: productsResult.errors,
        discounts_processed: discountResult.processed,
        discounts_errors: discountResult.errors,
        triggered_by: triggeredBy
      });

    return new Response(
      JSON.stringify({ 
        success: true, 
        triggered_by: triggeredBy,
        files: {
          csv: { name: csvFile.name, hash: csvFile.hash },
          discount: discountFile ? { name: discountFile.name, hash: discountFile.hash } : null
        },
        products: productsResult,
        discounts: discountResult
      }), 
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

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

async function importDiscountCodes(supabase: any, discountData: string) {
  console.log('Processing discount codes...');
  
  const lines = discountData.trim().split('\n').filter(l => l.trim());
  let processed = 0;
  let errors = 0;
  const batchSize = 500;

  for (let i = 0; i < lines.length; i += batchSize) {
    const batch = [];
    
    for (let j = i; j < Math.min(i + batchSize, lines.length); j++) {
      const line = lines[j].trim();
      if (!line) continue;
      
      try {
        const parts = line.split(';');
        if (parts.length >= 3) {
          const productCodePrefix = parts[0].trim();
          const discountPercentage = parseFloat(parts[1].replace(',', '.'));
          const description = fixEncoding(parts[2].trim());
          
          batch.push({
            product_code_prefix: productCodePrefix,
            discount_percentage: discountPercentage,
            discount_group: productCodePrefix, // Use prefix as group to avoid duplicates
            description: description
          });
        }
      } catch (err) {
        console.error(`Error parsing discount line ${j}:`, err);
        errors++;
      }
    }

    if (batch.length > 0) {
      const { error } = await supabase
        .from('discount_codes')
        .insert(batch);
      
      if (error) {
        console.error('Batch insert error:', error);
        errors += batch.length;
      } else {
        processed += batch.length;
        console.log(`Imported ${batch.length} discount codes (total: ${processed})`);
      }
    }
  }

  console.log(`Discount import complete: ${processed} processed, ${errors} errors`);
  return { processed, errors };
}

async function importEnhancedProducts(supabase: any, csvData: string) {
  console.log('Processing enhanced products CSV data...');
  console.log('CSV data length:', csvData.length, 'bytes');
  
  const lines = csvData.trim().split('\n');
  console.log('Total lines:', lines.length);
  
  const headers = lines[0].split(';').map(h => h.trim().replace(/"/g, ''));
  
  console.log('CSV Headers:', headers);
  console.log('Sample line 1:', lines[1]?.substring(0, 200));
  
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
    '1. st - Ordering Unit': 'ordering_unit_1',  // Fixed: space before "st"
    '1st Ordering Unit': 'ordering_unit_1',      // Keep old mapping for compatibility
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
  const batchSize = 500; // Optimal batch size
  const maxLines = Math.min(lines.length, 55000); // Max 55K products per run (worker limit)

  console.log(`Processing ${maxLines - 1} products (${lines.length - 1} total in file)`);

  for (let i = 1; i < maxLines; i += batchSize) {
    const batch = [];
    
    for (let j = i; j < Math.min(i + batchSize, maxLines); j++) {
      const line = lines[j];
      if (!line.trim()) continue;
      
      try {
        const values = parseCsvLine(line);
        // Allow flexible field count - some lines may have trailing empty fields
        if (values.length < headers.length - 5 || values.length > headers.length + 5) {
          if (j < 5) {
            console.warn(`Line ${j}: Expected ~${headers.length} fields, got ${values.length}. Skipping.`);
          }
          errors++;
          continue;
        }
        
        // Pad with empty strings if needed
        while (values.length < headers.length) {
          values.push('');
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
              value = parseFloat(value.replace(',', '.')) || 0;
            } else if (dbField === 'price_quantity' || dbField === 'ordering_factor_1' || dbField === 'ordering_factor_2') {
              value = parseFloat(value.replace(',', '.')) || 1;
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
      console.log(`Inserting batch of ${batch.length} products...`);
      console.log('First product in batch:', JSON.stringify(batch[0], null, 2));
      try {
        const { data, error } = await supabase
          .from('enhanced_supplier_prices')
          .insert(batch)
          .select();

        if (error) {
          console.error('❌ Batch insert error:', JSON.stringify(error, null, 2));
          console.error('Sample failed product:', JSON.stringify(batch[0], null, 2));
          errors += batch.length;
        } else {
          processed += batch.length;
          console.log(`✅ Processed batch: ${processed} products total`);
        }
      } catch (batchError) {
        console.error('❌ Batch processing error:', batchError);
        console.error('Error details:', JSON.stringify(batchError, null, 2));
        errors += batch.length;
      }
    } else {
      console.log('⚠️ Batch is empty, skipping insert');
    }
  }

  console.log(`Product import complete: ${processed} processed, ${errors} errors`);
  return { processed, errors };
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
    } else if (char === ';' && !inQuotes) {
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
    // Use correct hourly rate: 660 DKK/hour (595 labor + 65 vehicle)
    return Math.max(0, laborCost / 660);
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
