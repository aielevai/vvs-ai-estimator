import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting CSV import from public folder...');

    // Import the 65k products from ahlsell-prices.csv from public folder
    const csvResponse = await fetch('https://xrvmjrrcdfvrhfzknlku.supabase.co/storage/v1/object/public/temp/ahlsell-prices.csv')
      .catch(() => fetch(`${req.url.replace(/\/functions\/.*/, '')}/ahlsell-prices.csv`));
    
    if (!csvResponse.ok) {
      throw new Error('Failed to fetch ahlsell-prices.csv from public folder');
    }

    const csvText = await csvResponse.text();
    console.log('CSV file loaded, processing...');

    const lines = csvText.split('\n');
    const dataLines = lines.slice(1).filter(line => line.trim().length > 0);
    console.log(`Found ${dataLines.length} products to import into enhanced_supplier_prices`);

    const batchSize = 500;
    let processedCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < dataLines.length; i += batchSize) {
      const batch = dataLines.slice(i, i + batchSize);
      const records = [];

      for (const line of batch) {
        try {
          // Parse CSV line with proper handling of quotes and semicolons
          const fields = [];
          let current = '';
          let inQuotes = false;
          
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ';' && !inQuotes) {
              fields.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          fields.push(current.trim());

          // Map fields according to CSV structure
          const [
            short_description,
            long_description,
            supplier_item_id,
            vvs_number,
            ean_id,
            , // customer_item_id - skipped
            , // tun_id - skipped  
            , // el_id - skipped
            , // unspsc - skipped
            leadtime,
            is_on_stock,
            gross_price,
            net_price,
            price_quantity,
            price_unit,
            , // price_currency - skipped
            ordering_unit_1,
            ordering_factor_1,
            ordering_unit_2,
            ordering_factor_2,
            image_url,
            link
          ] = fields;

          // Clean and convert data
          const record: any = {
            short_description: short_description?.replace(/"/g, '') || null,
            long_description: long_description?.replace(/"/g, '') || null,
            supplier_item_id: supplier_item_id || null,
            vvs_number: vvs_number || null,
            ean_id: ean_id || null,
            leadtime: leadtime ? parseInt(leadtime) : null,
            is_on_stock: is_on_stock === '"true"' || is_on_stock === 'true',
            gross_price: gross_price ? parseFloat(gross_price.replace(',', '.')) : null,
            net_price: net_price ? parseFloat(net_price.replace(',', '.')) : null,
            price_quantity: price_quantity ? parseFloat(price_quantity.replace(',', '.')) : 1,
            price_unit: price_unit?.replace(/"/g, '') || 'STK',
            ordering_unit_1: ordering_unit_1?.replace(/"/g, '') || null,
            ordering_factor_1: ordering_factor_1 ? parseFloat(ordering_factor_1.replace(',', '.')) : null,
            ordering_unit_2: ordering_unit_2?.replace(/"/g, '') || null,
            ordering_factor_2: ordering_factor_2 ? parseFloat(ordering_factor_2.replace(',', '.')) : null,
            image_url: image_url?.replace(/"/g, '') || null,
            link: link?.replace(/"/g, '') || null
          };

          // Create normalized_text for search
          record.normalized_text = [
            record.short_description,
            record.long_description,
            record.vvs_number,
            record.supplier_item_id
          ].filter(Boolean).join(' ').toLowerCase();

          records.push(record);
        } catch (lineError) {
          console.error('Error parsing line:', lineError);
          errorCount++;
        }
      }

      // Insert batch
      if (records.length > 0) {
        const { error } = await supabase
          .from('enhanced_supplier_prices')
          .insert(records);

        if (error) {
          console.error('Error inserting batch:', error);
          errorCount += records.length;
        } else {
          processedCount += records.length;
          if (processedCount % 5000 === 0) {
            console.log(`Progress: ${processedCount}/${dataLines.length} products imported`);
          }
        }
      }
    }

    console.log(`CSV import completed: ${processedCount} imported, ${errorCount} errors`);

    return new Response(JSON.stringify({
      success: true,
      imported: processedCount,
      errors: errorCount,
      total: dataLines.length,
      message: `Successfully imported ${processedCount} products to enhanced_supplier_prices`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('CSV import error:', error);
    return new Response(JSON.stringify({ 
      error: 'CSV import failed',
      details: (error as any)?.message || 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});