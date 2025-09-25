import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { csvData } = await req.json();
    
    if (!csvData) {
      return new Response(JSON.stringify({ error: 'CSV data required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting CSV import...');

    // Parse CSV data (simplified parser)
    const lines = csvData.split('\n');
    const headers = lines[0].split(';').map((h: string) => h.replace(/"/g, ''));
    
    console.log(`Found ${lines.length - 1} products to import`);

    // Process in batches to avoid memory issues
    const batchSize = 1000;
    let processedCount = 0;
    
    for (let i = 1; i < lines.length; i += batchSize) {
      const batch = [];
      
      for (let j = i; j < Math.min(i + batchSize, lines.length); j++) {
        const line = lines[j];
        if (!line.trim()) continue;
        
        const values = line.split(';').map((v: string) => v.replace(/"/g, ''));
        
        if (values.length < 3) continue;
        
        const shortDescription = values[0] || '';
        const longDescription = values[1] || '';
        const supplierItemId = values[2] || '';
        const netPriceStr = values[12] || '0';
        
        // Parse net price (handle Danish number format)
        const netPrice = parseFloat(netPriceStr.replace(',', '.')) || 0;
        
        if (netPrice <= 0 || !shortDescription) continue;
        
        // Map to Valentin categories based on description
        let valentinMapping = 'service_call'; // default
        const desc = shortDescription.toLowerCase();
        
        if (desc.includes('gulv') || desc.includes('floor')) valentinMapping = 'floor_heating';
        else if (desc.includes('bad') || desc.includes('toilet') || desc.includes('vask')) valentinMapping = 'bathroom_renovation';
        else if (desc.includes('køkken') || desc.includes('kitchen')) valentinMapping = 'kitchen_plumbing';
        else if (desc.includes('fjernvarme') || desc.includes('district')) valentinMapping = 'district_heating';
        else if (desc.includes('radiator') || desc.includes('varme')) valentinMapping = 'radiator_installation';
        else if (desc.includes('rør') || desc.includes('pipe')) valentinMapping = 'pipe_installation';
        
        batch.push({
          supplier_id: 'ahlsell',
          product_code: supplierItemId,
          description: shortDescription + (longDescription ? ' - ' + longDescription : ''),
          base_price: netPrice,
          final_price: netPrice,
          valentin_mapping: valentinMapping
        });
      }
      
      if (batch.length > 0) {
        const { error } = await supabase
          .from('supplier_prices')
          .upsert(batch, { onConflict: 'product_code' });
        
        if (error) {
          console.error('Batch import error:', error);
          throw error;
        }
        
        processedCount += batch.length;
        console.log(`Imported batch: ${processedCount} products processed`);
      }
    }

    console.log(`CSV import completed: ${processedCount} products imported`);

    return new Response(JSON.stringify({
      success: true,
      imported_count: processedCount,
      message: `Successfully imported ${processedCount} products from Ahlsell price file`
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