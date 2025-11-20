import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// FASE 2: Import med unit price normalisering

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

// Normaliser enhedspris
function normalizeUnitPrice(p: any): number {
  const base = Number(p.net_price ?? p.gross_price ?? 0);
  const pq = Number(p.price_quantity ?? 1) || 1;
  const of1 = Number(p.ordering_factor_1 ?? 1) || 1;
  return base / (pq * of1);
}

// Simpel kategori-inferens baseret på beskrivelse
function inferCategory(p: any): string {
  const desc = (p.short_description || p.long_description || '').toLowerCase();
  
  if (desc.includes('toilet') || desc.includes('håndvask') || desc.includes('bruser')) return 'sanitær';
  if (desc.includes('pex') || desc.includes('rør') || desc.includes('pipe')) return 'rør';
  if (desc.includes('ventil') || desc.includes('valve')) return 'ventiler';
  if (desc.includes('afløb') || desc.includes('drain')) return 'afløb';
  if (desc.includes('membran') || desc.includes('tætning') || desc.includes('seal')) return 'tætning';
  if (desc.includes('armatur') || desc.includes('faucet') || desc.includes('tap')) return 'armaturer';
  if (desc.includes('radiator')) return 'radiator';
  if (desc.includes('gulvvarme') || desc.includes('floor heating')) return 'gulvvarme';
  if (desc.includes('fjernvarme') || desc.includes('district')) return 'fjernvarme';
  if (desc.includes('isolering') || desc.includes('insulation')) return 'isolering';
  if (desc.includes('fitting') || desc.includes('kobling')) return 'fittings';
  if (desc.includes('klæb') || desc.includes('adhesive')) return 'tætning';
  if (desc.includes('fuge') || desc.includes('joint')) return 'finish';
  
  return 'diverse';
}

// Byg normaliseret søgetekst
function buildNormalizedText(p: any): string {
  const parts = [
    p.short_description,
    p.long_description,
    p.vvs_number,
    p.ean_id,
    p.supplier_item_id
  ].filter(Boolean).join(' ').toLowerCase();
  return parts.normalize("NFKD");
}

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

    // Fix encoding in all text fields + add normalization
    const cleanProducts = products.map((product: any) => ({
      ...product,
      short_description: product.short_description ? fixEncoding(product.short_description) : null,
      long_description: product.long_description ? fixEncoding(product.long_description) : null,
      normalized_text: buildNormalizedText({
        short_description: product.short_description ? fixEncoding(product.short_description) : null,
        long_description: product.long_description ? fixEncoding(product.long_description) : null,
        vvs_number: product.vvs_number ? fixEncoding(product.vvs_number) : null,
        ean_id: product.ean_id,
        supplier_item_id: product.supplier_item_id ? fixEncoding(product.supplier_item_id) : null,
      }),
      supplier_item_id: product.supplier_item_id ? fixEncoding(product.supplier_item_id) : null,
      vvs_number: product.vvs_number ? fixEncoding(product.vvs_number) : null,
      unit_price_norm: normalizeUnitPrice(product),
      category: inferCategory(product),
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