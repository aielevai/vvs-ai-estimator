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
    
    let semanticResults = [];
    if (includeSemanticSearch && openAIApiKey) {
      // 2. Semantic search using OpenAI embeddings
      semanticResults = await performSemanticSearch(supabase, query, topK);
    }

    // 3. Hybrid scoring (combine lexical + semantic)
    const hybridResults = combineResults(lexicalResults, semanticResults, query);

    // 4. Enhance with additional metadata
    const enhancedResults = await enhanceResults(supabase, hybridResults.slice(0, topK));

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
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function performLexicalSearch(supabase: any, query: string, topK: number) {
  console.log('Performing lexical search...');
  
  // Normalize query for Danish text search
  const normalizedQuery = normalizeQuery(query);
  
  const { data, error } = await supabase
    .from('enhanced_supplier_prices')
    .select(`
      id, vvs_number, ean_id, supplier_item_id,
      short_description, long_description,
      net_price, gross_price, price_quantity, price_unit,
      ordering_unit_1, ordering_factor_1,
      is_on_stock, leadtime,
      ts_rank(search_vector, plainto_tsquery('danish', $1)) as rank
    `)
    .textSearch('search_vector', normalizedQuery, { 
      type: 'plainto', 
      config: 'danish' 
    })
    .order('rank', { ascending: false })
    .limit(topK * 2); // Get more for merging

  if (error) {
    console.error('Lexical search error:', error);
    return [];
  }

  return (data || []).map((item: any) => ({
    ...item,
    search_type: 'lexical',
    score: parseFloat(item.rank) || 0
  }));
}

async function performSemanticSearch(supabase: any, query: string, topK: number) {
  if (!openAIApiKey) {
    console.log('No OpenAI API key, skipping semantic search');
    return [];
  }

  console.log('Performing semantic search...');
  
  try {
    // Generate embedding for the query
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: query,
        encoding_format: 'float'
      }),
    });

    if (!embeddingResponse.ok) {
      console.error('OpenAI embedding error:', await embeddingResponse.text());
      return [];
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;

    // For now, fallback to lexical search since we don't have embeddings stored
    // In a full implementation, we would store embeddings and use vector similarity
    console.log('Semantic search fallback to enhanced lexical search');
    
    // Enhanced lexical search with synonym expansion
    const expandedQuery = expandQueryWithSynonyms(query);
    
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
      .limit(topK);

    if (error) {
      console.error('Enhanced search error:', error);
      return [];
    }

    return (data || []).map((item: any, index: number) => ({
      ...item,
      search_type: 'semantic',
      score: 1.0 - (index * 0.05) // Decreasing score based on order
    }));

  } catch (error) {
    console.error('Semantic search error:', error);
    return [];
  }
}

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandQueryWithSynonyms(query: string): string {
  const synonyms: Record<string, string[]> = {
    'ventil': ['spærreventil', 'afspærringsventil', 'reguleringsventil'],
    'radiator': ['varmeapparat', 'radiatorer', 'varmelegemme'],
    'gulvvarme': ['varmeslag', 'varmekabler', 'varmerør'],
    'rør': ['vandledning', 'varmerør', 'afløbsrør'],
    'blandebatteri': ['hane', 'armatur', 'vandhane'],
    'toilet': ['wc', 'vandkloset', 'toiletsæde']
  };

  const words = query.toLowerCase().split(/\s+/);
  const expandedTerms: string[] = [];

  words.forEach(word => {
    expandedTerms.push(word);
    if (synonyms[word]) {
      expandedTerms.push(...synonyms[word]);
    }
  });

  // Create OR conditions for enhanced search
  return expandedTerms
    .map(term => `short_description.ilike.%${term}%,long_description.ilike.%${term}%,vvs_number.ilike.%${term}%`)
    .join(',');
}

function combineResults(lexicalResults: any[], semanticResults: any[], query: string) {
  console.log('Combining lexical and semantic results...');
  
  const combined = new Map();
  const lambda = 0.6; // Weight for lexical vs semantic (0.6 favors lexical)
  
  // Add lexical results
  lexicalResults.forEach(item => {
    const key = item.vvs_number || item.id;
    combined.set(key, {
      ...item,
      final_score: lambda * item.score,
      search_types: ['lexical']
    });
  });

  // Add semantic results (merge if exists)
  semanticResults.forEach(item => {
    const key = item.vvs_number || item.id;
    if (combined.has(key)) {
      const existing = combined.get(key);
      existing.final_score += (1 - lambda) * item.score;
      existing.search_types.push('semantic');
    } else {
      combined.set(key, {
        ...item,
        final_score: (1 - lambda) * item.score,
        search_types: ['semantic']
      });
    }
  });

  // Apply boosting rules
  const results = Array.from(combined.values()).map(item => {
    let boostedScore = item.final_score;
    
    // Boost exact VVS number matches
    if (item.vvs_number && query.toLowerCase().includes(item.vvs_number.toLowerCase())) {
      boostedScore *= 2.0;
    }
    
    // Boost in-stock items
    if (item.is_on_stock) {
      boostedScore *= 1.2;
    }
    
    // Boost items with short leadtime
    if (item.leadtime <= 7) {
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
      title: item.short_description,
      description: item.long_description,
      match_score: item.final_score,
      unit_price_ex_vat: unitPrice,
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