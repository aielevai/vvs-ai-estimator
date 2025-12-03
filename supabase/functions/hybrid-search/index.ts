import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, topK = 20, includeSemanticSearch = true } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Hybrid search for: "${query}" (topK: ${topK})`);

    // 1. Lexical search using PostgreSQL full-text search
    const lexicalResults = await performLexicalSearch(supabase, query, topK);
    
    let semanticResults: any[] = [];
    if (includeSemanticSearch && openAIApiKey && lexicalResults.length < 5) {
      // 2. Semantic/ILIKE search as backup when lexical returns few results
      semanticResults = await performSemanticSearch(supabase, query, topK);
    }

    // 3. Hybrid scoring (combine lexical + semantic)
    const hybridResults = combineResults(lexicalResults, semanticResults, query);

    // 4. Enhance with additional metadata
    const enhancedResults = await enhanceResults(supabase, hybridResults.slice(0, topK));

    console.log(`✅ Returning ${enhancedResults.length} results`);

    return new Response(
      JSON.stringify({
        success: true,
        query,
        results: enhancedResults,
        metrics: {
          lexical_count: lexicalResults.length,
          semantic_count: semanticResults.length,
          hybrid_count: hybridResults.length,
          final_count: enhancedResults.length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in hybrid-search:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage, results: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function performLexicalSearch(supabase: any, query: string, topK: number) {
  console.log('Performing lexical search...');
  
  // Try textSearch first with websearch type (handles multi-word better)
  try {
    const { data, error } = await supabase
      .from('enhanced_supplier_prices')
      .select(`
        id, vvs_number, ean_id, supplier_item_id,
        short_description, long_description,
        net_price, gross_price, price_quantity, price_unit,
        ordering_unit_1, ordering_factor_1,
        is_on_stock, leadtime
      `)
      .textSearch('search_vector', query, { 
        type: 'websearch', 
        config: 'danish' 
      })
      .limit(topK * 2);

    if (!error && data && data.length > 0) {
      console.log(`✅ textSearch found ${data.length} results`);
      return data.map((item: any, index: number) => ({
        ...item,
        search_type: 'lexical',
        score: 1.0 - (index * 0.02)
      }));
    }
    
    if (error) {
      console.log('textSearch failed:', error.message);
    }
  } catch (e) {
    console.log('textSearch exception:', e);
  }

  // Fallback to ILIKE search
  console.log('Falling back to ILIKE search...');
  return await performILikeSearch(supabase, query, topK);
}

async function performILikeSearch(supabase: any, query: string, topK: number) {
  // Split query into words for flexible matching
  const words = query
    .toLowerCase()
    .replace(/[^\wæøåÆØÅ\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
  
  if (words.length === 0) {
    console.log('No valid search words');
    return [];
  }

  console.log(`ILIKE search with words: ${words.join(', ')}`);

  // Build OR conditions for each word
  const orConditions = words
    .slice(0, 3) // Limit to first 3 words for performance
    .map(w => `short_description.ilike.%${w}%,long_description.ilike.%${w}%,vvs_number.ilike.%${w}%`)
    .join(',');

  try {
    const { data, error } = await supabase
      .from('enhanced_supplier_prices')
      .select(`
        id, vvs_number, ean_id, supplier_item_id,
        short_description, long_description,
        net_price, gross_price, price_quantity, price_unit,
        ordering_unit_1, ordering_factor_1,
        is_on_stock, leadtime
      `)
      .or(orConditions)
      .not('net_price', 'is', null)
      .gt('net_price', 0)
      .limit(topK * 2);

    if (error) {
      console.error('ILIKE search error:', error);
      return [];
    }

    console.log(`✅ ILIKE found ${data?.length || 0} results`);
    return (data || []).map((item: any, index: number) => ({
      ...item,
      search_type: 'ilike',
      score: 0.8 - (index * 0.02)
    }));
  } catch (e) {
    console.error('ILIKE exception:', e);
    return [];
  }
}

async function performSemanticSearch(supabase: any, query: string, topK: number) {
  console.log('Performing semantic/enhanced search...');
  
  // Enhanced ILIKE search with synonym expansion
  const expandedQuery = expandQueryWithSynonyms(query);
  
  try {
    const { data, error } = await supabase
      .from('enhanced_supplier_prices')
      .select(`
        id, vvs_number, ean_id, supplier_item_id,
        short_description, long_description,
        net_price, gross_price, price_quantity, price_unit,
        ordering_unit_1, ordering_factor_1,
        is_on_stock, leadtime
      `)
      .or(expandedQuery)
      .not('net_price', 'is', null)
      .gt('net_price', 0)
      .limit(topK);

    if (error) {
      console.error('Enhanced search error:', error);
      return [];
    }

    return (data || []).map((item: any, index: number) => ({
      ...item,
      search_type: 'semantic',
      score: 0.7 - (index * 0.03)
    }));
  } catch (e) {
    console.error('Semantic search error:', e);
    return [];
  }
}

function expandQueryWithSynonyms(query: string): string {
  const synonyms: Record<string, string[]> = {
    'ventil': ['spærreventil', 'afspærringsventil', 'reguleringsventil', 'kuglehane'],
    'radiator': ['varmeapparat', 'radiatorer', 'varmelegeme', 'panelradiator'],
    'gulvvarme': ['varmeslag', 'varmekabler', 'varmerør', 'gulvvarmerør'],
    'rør': ['vandledning', 'varmerør', 'afløbsrør', 'pex'],
    'pex': ['pex-al-pex', 'alupex', 'varmerør'],
    'blandebatteri': ['hane', 'armatur', 'vandhane'],
    'toilet': ['wc', 'vandkloset', 'toiletskål'],
    'cisterne': ['duofix', 'indbygning', 'skyllesystem'],
    'brusearmatur': ['termostat', 'bruser', 'brusebatteri'],
    'håndvask': ['vask', 'håndvaskarmatur', 'servantarmatur'],
    'afløb': ['kloak', 'drain', 'afløbsrør'],
    'isolering': ['rørisolering', 'isoleringsrør']
  };

  const words = query.toLowerCase().split(/\s+/);
  const expandedTerms: string[] = [];

  words.forEach(word => {
    expandedTerms.push(word);
    Object.entries(synonyms).forEach(([key, values]) => {
      if (word.includes(key) || key.includes(word)) {
        expandedTerms.push(...values);
      }
    });
  });

  // Deduplicate and create OR conditions
  const uniqueTerms = [...new Set(expandedTerms)].slice(0, 5);
  return uniqueTerms
    .map(term => `short_description.ilike.%${term}%,long_description.ilike.%${term}%`)
    .join(',');
}

function combineResults(lexicalResults: any[], semanticResults: any[], query: string) {
  console.log('Combining lexical and semantic results...');
  
  const combined = new Map();
  const lambda = 0.7; // Weight for lexical vs semantic
  
  // Add lexical results
  lexicalResults.forEach(item => {
    const key = item.supplier_item_id || item.vvs_number || item.id;
    combined.set(key, {
      ...item,
      final_score: lambda * item.score,
      search_types: [item.search_type]
    });
  });

  // Add semantic results (merge if exists)
  semanticResults.forEach(item => {
    const key = item.supplier_item_id || item.vvs_number || item.id;
    if (combined.has(key)) {
      const existing = combined.get(key);
      existing.final_score += (1 - lambda) * item.score;
      existing.search_types.push(item.search_type);
    } else {
      combined.set(key, {
        ...item,
        final_score: (1 - lambda) * item.score,
        search_types: [item.search_type]
      });
    }
  });

  // Apply boosting rules
  const queryLower = query.toLowerCase();
  const results = Array.from(combined.values()).map(item => {
    let boostedScore = item.final_score;
    
    // Boost exact VVS number matches
    if (item.vvs_number && queryLower.includes(item.vvs_number.toLowerCase())) {
      boostedScore *= 2.0;
    }
    
    // Boost description matches
    const desc = (item.short_description || '').toLowerCase();
    if (queryLower.split(/\s+/).some((w: string) => w.length > 3 && desc.includes(w))) {
      boostedScore *= 1.3;
    }
    
    // Boost in-stock items
    if (item.is_on_stock) {
      boostedScore *= 1.2;
    }
    
    // Boost items with short leadtime
    if (item.leadtime && item.leadtime <= 7) {
      boostedScore *= 1.1;
    }
    
    // Boost items with valid prices
    if (item.net_price && item.net_price > 0) {
      boostedScore *= 1.1;
    }

    return {
      ...item,
      final_score: boostedScore
    };
  });

  // Sort by final score
  return results.sort((a, b) => b.final_score - a.final_score);
}

async function enhanceResults(supabase: any, results: any[]) {
  console.log('Enhancing results with metadata...');
  
  return results.map(item => {
    // Calculate unit price considering ordering factors
    const basePrice = item.net_price || item.gross_price || 0;
    const priceQuantity = item.price_quantity || 1;
    const orderingFactor = item.ordering_factor_1 || 1;
    
    const unitPrice = basePrice / (priceQuantity * orderingFactor);
    
    return {
      sku: item.vvs_number || item.supplier_item_id,
      supplier_item_id: item.supplier_item_id,
      vvs_number: item.vvs_number,
      title: item.short_description,
      description: item.long_description,
      match_score: item.final_score,
      unit_price_ex_vat: unitPrice,
      net_price: item.net_price,
      unit: item.price_unit || item.ordering_unit_1 || 'stk',
      pack_info: {
        price_quantity: item.price_quantity,
        ordering_factor: item.ordering_factor_1,
        ordering_unit: item.ordering_unit_1
      },
      on_stock: item.is_on_stock || false,
      leadtime: item.leadtime || 0,
      search_metadata: {
        types: item.search_types,
        score: item.final_score
      }
    };
  });
}
