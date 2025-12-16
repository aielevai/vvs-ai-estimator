// Validate Quote Edge Function
// Uses GPT-5-mini to validate quote sanity and flag potential issues
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, handleOptions } from "../_shared/http.ts";
import { supabaseAdmin } from '../_shared/supabase.ts';
import { callAI, parseAIJson } from '../_shared/ai-client.ts';

const VALIDATION_PROMPT = `Du er en VVS-ekspert der validerer tilbud. Analyser dette tilbud og returner JSON med:

{
  "is_valid": boolean,
  "confidence": number (0-1),
  "issues": [
    {
      "severity": "warning" | "error",
      "field": string,
      "message": string,
      "suggestion": string | null
    }
  ],
  "summary": string (kort opsummering på dansk)
}

Tjek for:
1. Timer vs. projekttype og størrelse (for mange/få timer?)
2. Materialepris vs. arbejde (ubalance?)
3. Manglende vigtige materialer for projekttypen
4. Usædvanlige priser (for høje/lave)
5. Kompleksitet vs. timer (stemmer det?)

Returner KUN valid JSON - ingen anden tekst.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();

  try {
    const body = await req.json();
    const { quote_id } = body;

    if (!quote_id) {
      return err('quote_id is required', 400);
    }

    console.log('🔍 Validating quote:', quote_id);

    // Get quote with lines and case data
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from('quotes')
      .select(`
        *,
        cases (
          id,
          email_subject,
          email_body,
          extracted_data
        )
      `)
      .eq('id', quote_id)
      .single();

    if (quoteError || !quote) {
      return err('Quote not found', 404);
    }

    // Get quote lines
    const { data: lines } = await supabaseAdmin
      .from('quote_lines')
      .select('*')
      .eq('quote_id', quote_id)
      .order('sort_order');

    // Build validation context
    const extracted = quote.cases?.extracted_data || {};
    const project = extracted.project || {};

    const validationContext = {
      project_type: project.type || quote.metadata?.project_type,
      estimated_size: project.estimated_size?.value || quote.metadata?.estimated_size,
      complexity: project.complexity || 'medium',
      total_hours: quote.labor_hours,
      subtotal: quote.subtotal,
      vat: quote.vat_amount,
      total: quote.total_amount,
      lines: lines?.map((l: any) => ({
        type: l.line_type,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unit_price: l.unit_price,
        total_price: l.total_price
      })),
      email_subject: quote.cases?.email_subject,
      original_request: project.description
    };

    // Use GPT-4o-mini for quick validation
    const aiResponse = await callAI(
      [
        { role: 'system', content: VALIDATION_PROMPT },
        { role: 'user', content: JSON.stringify(validationContext, null, 2) }
      ],
      {
        model: 'gpt-4o-mini',
        max_tokens: 4000,
      }
    );

    let validation: any;
    try {
      validation = parseAIJson(aiResponse.output_text);
    } catch (e) {
      console.error('Failed to parse validation response:', e);
      validation = {
        is_valid: true,
        confidence: 0.5,
        issues: [],
        summary: 'Kunne ikke validere tilbuddet automatisk'
      };
    }

    console.log(`✅ Validation complete: ${validation.is_valid ? 'VALID' : 'ISSUES FOUND'}`);

    // Update quote with validation results
    await supabaseAdmin
      .from('quotes')
      .update({
        validation_result: validation,
        validated_at: new Date().toISOString()
      })
      .eq('id', quote_id);

    return ok({
      quote_id,
      validation,
      validated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 Validate quote error:', error);
    return err(error);
  }
});
