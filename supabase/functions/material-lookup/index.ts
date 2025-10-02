import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fix encoding issues in text
function fixEncoding(text: string): string {
  if (!text) return '';
  
  const map: Record<string, string> = {
    'Ã¦': 'æ', 'Ã˜': 'Ø', 'Ã¸': 'ø', 'Ã…': 'Å', 'Ã¥': 'å',
    'Ã†': 'Æ', 'Â²': '²', 'Â°': '°', 'Â½': '½', 'Â¼': '¼', 'Â¾': '¾',
    'adevÃ¦relse': 'badeværelse', 'pÃ¥': 'på', 'mÂ²': 'm²',
    'r�dgods': 'rødgods', 'rÃ¸r': 'rør', 'kÃ¸kken': 'køkken',
    '�': '' // Remove replacement character entirely
  };
  
  let fixed = text;
  for (const [garbled, correct] of Object.entries(map)) {
    fixed = fixed.replaceAll(garbled, correct);
  }
  return fixed;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectType, projectDescription, estimatedSize, complexity, materialeAnalyse } = await req.json();
    
    console.log(`AI Material lookup for: ${projectType}, size: ${estimatedSize}, complexity: ${complexity}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY')!;
    
    if (!openAIApiKey) {
      console.error('OpenAI API key not found');
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get relevant products from enhanced_supplier_prices using intelligent search
    const searchTerms = getSearchTermsForProject(projectType, materialeAnalyse);
    console.log(`Searching for products with terms: ${searchTerms.join(', ')}`);
    
    const { data: products, error } = await supabase
      .from('enhanced_supplier_prices')
      .select('*')
      .or(searchTerms.map(term => `normalized_text.ilike.%${term}%,short_description.ilike.%${term}%,long_description.ilike.%${term}%`).join(','))
      .limit(200);
    
    if (error) {
      console.error('Error fetching products:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch products' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${products?.length || 0} potential products`);

    // Use AI to intelligently select and calculate materials with enhanced prompts
    const aiPrompt = createMaterialSelectionPrompt(projectType, projectDescription, estimatedSize, complexity, materialeAnalyse, products || []);
    
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-2025-08-07',
        messages: [
          {
            role: 'system',
            content: 'Du er en ekspert VVS-materialespecialist med 20+ års erfaring. Du kender Valentin VVS standarder og danske bygningsregler perfekt. Du vælger altid de rigtige produkter og beregner præcise mængder baseret på faktiske projektkrav og danske VVS-standarder.'
          },
          {
            role: 'user',
            content: aiPrompt
          }
        ],
        max_completion_tokens: 3000
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API failed: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    let aiMaterials;
    
    try {
      const content = aiData.choices[0]?.message?.content?.trim();
      console.log('Raw AI response:', content?.substring(0, 200));
      
      if (!content || content.length < 10) {
        console.error('Empty or too short AI response');
        throw new Error('AI returned empty response');
      }
      
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      const jsonContent = jsonMatch ? jsonMatch[1] : content;
      
      // Try to find JSON object in the response
      const objectMatch = jsonContent.match(/\{[\s\S]*"materials"[\s\S]*?\}/);
      const finalJson = objectMatch ? objectMatch[0] : jsonContent;
      
      aiMaterials = JSON.parse(finalJson);
      
      if (!aiMaterials.materials || !Array.isArray(aiMaterials.materials)) {
        throw new Error('Invalid materials structure');
      }
      
      console.log(`Parsed ${aiMaterials.materials.length} materials`);
    } catch (parseError) {
      console.error('AI parsing failed:', parseError);
      // Fallback to direct database search
      console.log('Falling back to direct database search');
      const directMaterials = await searchDatabaseDirectly(supabase, projectType, materialeAnalyse, estimatedSize, products);
      return new Response(JSON.stringify(directMaterials), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate and enhance the AI response
    const validatedMaterials = validateAndEnhanceMaterials(aiMaterials, products || [], projectType, estimatedSize);
    
    const totalMaterialCost = validatedMaterials.reduce((sum: number, item: any) => sum + (item.total_price || 0), 0);

    console.log(`AI material lookup completed: ${validatedMaterials.length} materials, total: ${totalMaterialCost} DKK`);

    return new Response(JSON.stringify({
      materials: validatedMaterials,
      total_cost: totalMaterialCost,
      project_type: projectType,
      estimated_size: estimatedSize,
      mode: 'ai_optimized',
      ai_reasoning: aiMaterials.reasoning || 'AI-baseret materialevurdering med Valentin VVS standarder',
      product_count: products?.length || 0,
      validated_count: validatedMaterials.filter((m: any) => m.validated).length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in material-lookup function:', error);
    
    // Fallback to simple calculation if AI fails
    try {
      const { projectType, estimatedSize } = await req.json().catch(() => ({ projectType: 'service_call', estimatedSize: 1 }));
      const fallbackMaterials = createFallbackMaterials(projectType, estimatedSize);
      const fallbackCost = fallbackMaterials.reduce((sum: number, item: any) => sum + item.total_price, 0);
      
      return new Response(JSON.stringify({ 
        materials: fallbackMaterials,
        total_cost: fallbackCost,
        mode: 'fallback',
        error: `AI error: ${(error as any).message}`,
        fallback_reason: 'AI processing failed, using standard estimates'
      }), {
        status: 200, // Return 200 with fallback instead of error
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (fallbackError) {
      return new Response(JSON.stringify({ 
        error: 'Complete failure',
        materials: [],
        total_cost: 150,
        mode: 'emergency_fallback'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }
});

function getSearchTermsForProject(projectType: string, materialeAnalyse?: any): string[] {
  const baseTerms: Record<string, string[]> = {
    'bathroom_renovation': ['bad', 'toilet', 'wc', 'bruser', 'vask', 'håndvask', 'gulv', 'varme', 'gulvvarme', 'rør', 'ventil', 'armatur', 'blandingsbatteri', 'afløb', 'sifon', 'membran', 'tætning'],
    'kitchen_plumbing': ['køkken', 'vask', 'køkkenvask', 'opvask', 'opvaskemaskine', 'rør', 'ventil', 'sifon', 'armatur', 'blandingsbatteri'],
    'floor_heating': ['gulvvarme', 'varmerør', 'pex', 'fordeler', 'fordelerblok', 'termostat', 'regulering', 'isolering', 'membran'],
    'radiator_installation': ['radiator', 'varme', 'centralvarme', 'ventil', 'termostat', 'reguleringsventil', 'rør', 'returventil'],
    'pipe_installation': ['rør', 'vandrør', 'fittings', 'ventil', 'kobling', 'muffe', 'bøjning', 'reduktion'],
    'district_heating': ['fjernvarme', 'veksler', 'varmeveksler', 'ventil', 'regulering', 'isolering', 'rørisolering'],
    'service_call': ['service', 'reparation', 'dele', 'ventil', 'pakning', 'tætning', 'reservedel']
  };

  let terms = baseTerms[projectType] || ['rør', 'ventil', 'fittings'];
  
  // Add specific components if available
  if (materialeAnalyse?.specifikke_komponenter) {
    materialeAnalyse.specifikke_komponenter.forEach((comp: any) => {
      if (comp.komponent) {
        const componentTerms = comp.komponent.toLowerCase().split(/[\s,()/-]+/).filter((term: string) => term.length > 2);
        terms.push(...componentTerms);
      }
    });
  }

  return [...new Set(terms)]; // Remove duplicates
}

function createMaterialSelectionPrompt(projectType: string, description: string, size: number, complexity: string, materialeAnalyse: any, products: any[]): string {
  const topProducts = products.slice(0, 30);
  
  let componentFocus = '';
  if (materialeAnalyse?.specifikke_komponenter) {
    const topComponents = materialeAnalyse.specifikke_komponenter.slice(0, 8);
    componentFocus = `\nKOMPONENTER NØDVENDIGE (brug størrelse ${size} ${getSizeUnit(projectType)} til beregning):\n${topComponents.map((c: any) => 
      `- ${c.komponent}: ${c.mængde || '?'} ${c.enhed || 'stk'} | ${c.specifikationer || ''}`
    ).join('\n')}`;
  }
  
  return `Du skal vælge materialer til: ${projectType} (${size} ${getSizeUnit(projectType)})

TILGÆNGELIGE PRODUKTER (vælg KUN fra denne liste):
${topProducts.map((p, i) => 
  `${i+1}. ID:${p.supplier_item_id} | ${fixEncoding(p.short_description || 'N/A').substring(0, 60)} | Pris:${p.net_price}kr/${p.price_unit || 'stk'}`
).join('\n')}
${componentFocus}

RETURNER KUN DETTE JSON-FORMAT (ingen tekst før eller efter):
{
  "materials": [
    {
      "supplier_item_id": "123456",
      "description": "Produkt navn",
      "quantity": 10,
      "unit": "stk",
      "unit_price": 100,
      "total_price": 1000
    }
  ],
  "reasoning": "Kort forklaring"
}

VIGTIGE REGLER:
- Beregn quantity korrekt baseret på ${size} ${getSizeUnit(projectType)}
- Brug ALTID supplier_item_id fra produktlisten ovenfor
- Brug de faktiske net_price værdier fra listen
- RETURNER KUN JSON - ingen markdown, ingen forklaring før/efter`;
}

function getSizeUnit(projectType: string): string {
  const units: Record<string, string> = {
    'bathroom_renovation': 'm²',
    'kitchen_plumbing': 'installationer',
    'floor_heating': 'm²',
    'radiator_installation': 'radiatorer',
    'pipe_installation': 'meter',
    'district_heating': 'installationer',
    'service_call': 'opgaver'
  };
  return units[projectType] || 'enheder';
}

function getProjectSpecificGuidelines(projectType: string, size: number, complexity: string): string {
  const guidelines: Record<string, string> = {
    'bathroom_renovation': `
   - Toilet: 1 stk per badeværelse + P-lås eller S-lås efter forhold
   - Håndvask: Standard 50-60cm bredde + armatur + sifon
   - Bruser: Standard 90x90cm eller efter plads + termostat + brusesæt
   - Gulvvarme: 80-100W per m² + fordeler + termostat + PEX 16mm
   - Afløb: DN110 til toilet, DN50 til bruser/vask + gulvafløb
   - Vådrumsmembran: Hele gulvareal + 10cm op ad vægge
   - Vandrør: PEX 15-20mm med isolering + fordelerblok`,
   
    'floor_heating': `
   - PEX-rør: 7-8 meter per m² gulvareal i 16mm dimension  
   - Fordelerblok: 1 udgange per 10-15m² + individuelle reguleringsventiler
   - Isolering: Min. 30mm under rør + randisolering
   - Termostat: 1 per zone + gulvføler + rumføler`,
   
    'radiator_installation': `
   - Radiatorer: Beregn efter rumstørrelse og varmebehov (80-100W/m²)
   - Tilslutning: 15mm kobbel eller 16mm PEX + ventiler
   - Regulering: Termostatventil + returventil per radiator
   - Ekspansion: Ekspansionsbeholder efter anlægsstørrelse`
  };
  
  return guidelines[projectType] || '- Følg generelle VVS-standarder for materialevalg og dimensionering';
}

function validateAndEnhanceMaterials(aiMaterials: any, products: any[], projectType: string, estimatedSize: number): any[] {
  if (!aiMaterials.materials || !Array.isArray(aiMaterials.materials)) {
    console.error('Invalid AI materials format');
    return createFallbackMaterials(projectType, estimatedSize);
  }

  const validatedMaterials = aiMaterials.materials.map((material: any) => {
    // Find matching product to validate price
    const matchingProduct = products.find(p => 
      p.supplier_item_id === material.supplier_item_id || 
      p.vvs_number === material.vvs_number ||
      p.supplier_item_id === material.product_code // backward compatibility
    );
    
    if (matchingProduct) {
      return {
        ...material,
        description: fixEncoding(material.description || matchingProduct.short_description || ''),
        unit_price: matchingProduct.net_price || matchingProduct.gross_price || material.unit_price,
        total_price: material.quantity * (matchingProduct.net_price || matchingProduct.gross_price || material.unit_price),
        supplier_id: 'ahlsell',
        product_id: matchingProduct.id,
        ean_id: matchingProduct.ean_id,
        image_url: matchingProduct.image_url,
        link: matchingProduct.link,
        validated: true,
        in_stock: matchingProduct.is_on_stock,
        leadtime: matchingProduct.leadtime
      };
    } else {
      // Product not found, use AI suggestion but mark as unvalidated
      return {
        ...material,
        description: fixEncoding(material.description || ''),
        validated: false,
        supplier_id: 'unknown',
        warning: 'Produkt ikke fundet i Ahlsell database - pris er estimeret'
      };
    }
  });

  // Quality assurance checks
  const totalCost = validatedMaterials.reduce((sum: number, m: any) => sum + (m.total_price || 0), 0);
  const averageCostPerUnit = totalCost / estimatedSize;
  
  // Sanity checks with warnings
  if (averageCostPerUnit > 5000) {
    console.warn(`High material cost detected: ${averageCostPerUnit} DKK per unit`);
    validatedMaterials.push({
      description: '⚠️ QUALITY CHECK: Høj materialeomkostning',
      reasoning: `Gennemsnit ${Math.round(averageCostPerUnit)} DKK per enhed - verificér mængder`,
      category: 'quality_check',
      priority: 'attention'
    });
  }

  if (validatedMaterials.filter((m: any) => !m.validated).length > 0) {
    console.warn('Some materials could not be validated against product database');
  }

  return validatedMaterials;
}

async function searchDatabaseDirectly(supabase: any, projectType: string, materialeAnalyse: any, estimatedSize: number, products: any[]): Promise<any> {
  console.log('Intelligent database search for materials with project-specific quantities');
  
  // Try to use specifikke_komponenter from AI analysis first
  if (materialeAnalyse?.specifikke_komponenter && Array.isArray(materialeAnalyse.specifikke_komponenter)) {
    console.log(`Using ${materialeAnalyse.specifikke_komponenter.length} specific components from AI analysis`);
    
    const selectedMaterials: any[] = [];
    
    for (const comp of materialeAnalyse.specifikke_komponenter) {
      // Search for matching product
      const searchTerms = comp.komponent.toLowerCase().split(/[\s,()/-]+/).filter((t: string) => t.length > 2);
      
      const matching = products.find(p => {
        const desc = fixEncoding((p.short_description || p.long_description || '').toLowerCase());
        return searchTerms.some(term => desc.includes(term));
      });
      
      if (matching) {
        selectedMaterials.push({
          supplier_item_id: matching.supplier_item_id,
          description: fixEncoding(matching.short_description || matching.long_description || comp.komponent),
          quantity: comp.mængde || 1,
          unit_price: matching.net_price || matching.gross_price || 100,
          unit: comp.enhed || matching.price_unit || 'stk',
          total_price: (comp.mængde || 1) * (matching.net_price || matching.gross_price || 100),
          validated: true,
          supplier_id: 'ahlsell',
          product_id: matching.id,
          in_stock: matching.is_on_stock
        });
      }
    }
    
    if (selectedMaterials.length > 0) {
      const totalCost = selectedMaterials.reduce((sum, m) => sum + m.total_price, 0);
      return {
        materials: selectedMaterials,
        total_cost: totalCost,
        mode: 'ai_components_mapped',
        ai_reasoning: 'Bruger AI\'s specifikke komponenter med database-mapping'
      };
    }
  }
  
  // Fallback: Use intelligent project-type based rules
  console.log('Using project-type based material rules');
  return calculateMaterialsByProjectType(projectType, estimatedSize, products);
}

function calculateMaterialsByProjectType(projectType: string, size: number, products: any[]): any {
  console.log(`Calculating materials for ${projectType} with size ${size}`);
  
  // Project-specific material rules with intelligent quantities
  const projectRules: Record<string, Array<{search: string, quantityCalc: (size: number) => number, unit: string, priority: number}>> = {
    'bathroom_renovation': [
      { search: 'toilet', quantityCalc: () => 1, unit: 'stk', priority: 1 },
      { search: 'håndvask', quantityCalc: () => 1, unit: 'stk', priority: 1 },
      { search: 'vask', quantityCalc: () => 1, unit: 'stk', priority: 2 },
      { search: 'brusekabine', quantityCalc: () => 1, unit: 'stk', priority: 1 },
      { search: 'bruser', quantityCalc: () => 1, unit: 'stk', priority: 2 },
      { search: 'pex 16', quantityCalc: (s) => Math.ceil(s * 8), unit: 'meter', priority: 1 },
      { search: 'gulvafløb', quantityCalc: () => 1, unit: 'stk', priority: 1 },
      { search: 'ventil', quantityCalc: (s) => Math.max(5, Math.ceil(s / 2)), unit: 'stk', priority: 1 },
      { search: 'armatur', quantityCalc: () => 2, unit: 'stk', priority: 1 }
    ],
    'floor_heating': [
      { search: 'pex 16', quantityCalc: (s) => Math.ceil(s * 8), unit: 'meter', priority: 1 },
      { search: 'gulvvarme', quantityCalc: (s) => Math.ceil(s * 8), unit: 'meter', priority: 2 },
      { search: 'fordeler', quantityCalc: (s) => Math.ceil(s / 15), unit: 'stk', priority: 1 },
      { search: 'termostat', quantityCalc: (s) => Math.ceil(s / 20), unit: 'stk', priority: 1 }
    ],
    'radiator_installation': [
      { search: 'radiator', quantityCalc: (s) => Math.max(1, Math.ceil(s / 3)), unit: 'stk', priority: 1 },
      { search: 'ventil', quantityCalc: (s) => Math.max(2, Math.ceil(s / 3) * 2), unit: 'stk', priority: 1 },
      { search: 'termostat', quantityCalc: (s) => Math.max(1, Math.ceil(s / 3)), unit: 'stk', priority: 1 }
    ],
    'kitchen_plumbing': [
      { search: 'køkkenvask', quantityCalc: () => 1, unit: 'stk', priority: 1 },
      { search: 'armatur', quantityCalc: () => 1, unit: 'stk', priority: 1 },
      { search: 'ventil', quantityCalc: () => 3, unit: 'stk', priority: 1 },
      { search: 'sifon', quantityCalc: () => 1, unit: 'stk', priority: 1 }
    ]
  };
  
  const rules = projectRules[projectType] || [];
  const selectedMaterials: any[] = [];
  const usedSearchTerms = new Set<string>();
  
  for (const rule of rules) {
    // Find best matching product that hasn't been used yet
    const matching = products.find(p => {
      const desc = fixEncoding((p.short_description || '').toLowerCase());
      const longDesc = fixEncoding((p.long_description || '').toLowerCase());
      const matchesSearch = desc.includes(rule.search.toLowerCase()) || longDesc.includes(rule.search.toLowerCase());
      const notUsed = !usedSearchTerms.has(p.supplier_item_id);
      return matchesSearch && notUsed;
    });
    
    if (matching) {
      usedSearchTerms.add(matching.supplier_item_id);
      const quantity = rule.quantityCalc(size);
      
      selectedMaterials.push({
        supplier_item_id: matching.supplier_item_id,
        description: fixEncoding(matching.short_description || matching.long_description || rule.search),
        quantity: quantity,
        unit_price: matching.net_price || matching.gross_price || 100,
        unit: rule.unit,
        total_price: quantity * (matching.net_price || matching.gross_price || 100),
        validated: true,
        supplier_id: 'ahlsell',
        product_id: matching.id,
        in_stock: matching.is_on_stock
      });
    }
  }
  
  // If no materials found, add generic fallback
  if (selectedMaterials.length === 0) {
    selectedMaterials.push({
      supplier_item_id: products[0]?.supplier_item_id || 'UNKNOWN',
      description: fixEncoding(products[0]?.short_description || 'Standard materialer'),
      quantity: Math.max(1, Math.ceil(size / 5)),
      unit_price: products[0]?.net_price || 150,
      unit: 'stk',
      total_price: Math.max(1, Math.ceil(size / 5)) * (products[0]?.net_price || 150),
      validated: false
    });
  }
  
  const totalCost = selectedMaterials.reduce((sum, m) => sum + m.total_price, 0);
  
  return {
    materials: selectedMaterials,
    total_cost: totalCost,
    mode: 'project_type_rules',
    ai_reasoning: `Intelligent materialeberegning for ${projectType} baseret på ${size} ${getSizeUnit(projectType)}`
  };
}

function createFallbackMaterials(projectType: string, estimatedSize: number): any[] {
  const fallbackMaterials: Record<string, any[]> = {
    'bathroom_renovation': [
      {
        supplier_item_id: 'FALLBACK_TOILET_001',
        description: 'Standard gulvstående toilet med cisterne',
        quantity: 1,
        unit_price: 1200,
        unit: 'STK',
        total_price: 1200,
        reasoning: 'Standard bathroom renovation toilet estimate',
        category: 'sanitær',
        priority: 'critical',
        validated: false
      },
      {
        supplier_item_id: 'FALLBACK_SINK_001', 
        description: 'Håndvask 60cm med armatur',
        quantity: 1,
        unit_price: 800,
        unit: 'STK',
        total_price: 800,
        reasoning: 'Standard sink and faucet combination',
        category: 'sanitær',
        priority: 'critical',
        validated: false
      }
    ],
    'floor_heating': [
      {
        supplier_item_id: 'FALLBACK_FH_001',
        description: 'Gulvvarmerør PEX 16mm',
        quantity: Math.ceil(estimatedSize * 8), // 8m per m²
        unit_price: 12,
        unit: 'MTR',
        total_price: Math.ceil(estimatedSize * 8) * 12,
        reasoning: 'Standard gulvvarmerør beregning: 8m per m²',
        category: 'rør',
        priority: 'critical',
        validated: false
      }
    ],
    'radiator_installation': [
      {
        supplier_item_id: 'FALLBACK_RAD_001',
        description: 'Standard radiator 600x800mm',
        quantity: Math.max(1, Math.ceil(estimatedSize / 15)), // 1 radiator per 15m²
        unit_price: 800,
        unit: 'STK',
        total_price: Math.max(1, Math.ceil(estimatedSize / 15)) * 800,
        reasoning: 'Standard radiator sizing: 1 per 15m²',
        category: 'radiatorer', 
        priority: 'critical',
        validated: false
      }
    ]
  };

  return fallbackMaterials[projectType] || [
    {
      supplier_item_id: 'FALLBACK_GEN_001',
      description: `Standard materialer til ${projectType.replace('_', ' ')}`,
      quantity: estimatedSize || 1,
      unit_price: 150,
      unit: 'STK',
      total_price: (estimatedSize || 1) * 150,
      reasoning: 'Generisk fallback materialepris baseret på projekttype',
      category: 'diverse',
      priority: 'important',
      validated: false
    }
  ];
}