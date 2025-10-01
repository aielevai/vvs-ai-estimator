import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fix encoding issues - convert common garbled Danish characters
const fixEncoding = (text: string): string => {
  const encodingMap: Record<string, string> = {
    'Ã¦': 'æ',
    'Ã˜': 'Ø',
    'Ã¸': 'ø',
    'Ã…': 'Å',
    'Ã¥': 'å',
    'Ã†': 'Æ',
    'Ã': 'Å',
    'Â°': '°',
    'Â½': '½',
    'Â¼': '¼',
    'Â¾': '¾',
    'â€"': '–',
    'â€œ': '"',
    'â€': '"',
    'â€™': "'",
    'â€˜': "'",
    '�': '',
  };

  let fixed = text;
  for (const [garbled, correct] of Object.entries(encodingMap)) {
    fixed = fixed.replace(new RegExp(garbled, 'g'), correct);
  }
  return fixed;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { products, chunkIndex, totalChunks } = await req.json();

    if (!products || !Array.isArray(products)) {
      throw new Error('Invalid request: products array is required');
    }

    console.log(`Processing chunk ${chunkIndex}/${totalChunks} with ${products.length} products`);

    // Fix encoding in all text fields
    const cleanProducts = products.map((product: any) => ({
      ...product,
      short_description: product.short_description ? fixEncoding(product.short_description) : null,
      long_description: product.long_description ? fixEncoding(product.long_description) : null,
      normalized_text: product.normalized_text ? fixEncoding(product.normalized_text) : null,
      supplier_item_id: product.supplier_item_id ? fixEncoding(product.supplier_item_id) : null,
      vvs_number: product.vvs_number ? fixEncoding(product.vvs_number) : null,
    }));

    // Insert the products batch
    const { error } = await supabase
      .from('enhanced_supplier_prices')
      .insert(cleanProducts);

    if (error) {
      console.error('Error inserting products:', error);
      throw error;
    }

    console.log(`Chunk ${chunkIndex}/${totalChunks} imported successfully`);

    return new Response(JSON.stringify({
      success: true,
      imported: products.length,
      chunkIndex,
      totalChunks,
      message: `Chunk ${chunkIndex}/${totalChunks} imported successfully`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Import error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Import failed',
      details: (error as any)?.message || 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});