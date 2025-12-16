// Save Correction Edge Function
// Saves user corrections to correction_rules table for future learning
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, handleOptions } from "../_shared/http.ts";
import { supabaseAdmin } from '../_shared/supabase.ts';
import { quickAI } from '../_shared/ai-client.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();

  try {
    const body = await req.json();
    const {
      correction_type,
      correction_value,
      original_value,
      corrected_value,
      project_type,
      complexity,
      size,
      scope,
      user_reasoning,
      email_content,
      source_case_id,
      source_quote_id
    } = body;

    console.log('💾 Saving correction:', { correction_type, project_type, scope });

    // Validate required fields
    if (!correction_type || !correction_value) {
      return err('correction_type and correction_value are required', 400);
    }

    // Extract keywords from email using AI (for future matching)
    let email_keywords: string[] = [];
    if (email_content && email_content.length > 50) {
      try {
        const keywordsResponse = await quickAI(
          'Du er en VVS-ekspert. Udtræk 5-10 nøgleord fra denne email der er relevante for prissætning. Returner KUN en JSON array af strings.',
          email_content.substring(0, 1000)
        );

        // Parse the keywords
        const cleanResponse = keywordsResponse.trim();
        if (cleanResponse.startsWith('[')) {
          email_keywords = JSON.parse(cleanResponse);
        }
      } catch (e) {
        console.log('⚠️ Could not extract keywords:', e);
      }
    }

    // Determine size range for matching
    let size_min: number | null = null;
    let size_max: number | null = null;

    if (scope === 'similar' && size) {
      // For similar scope, match within ±30% of size
      size_min = size * 0.7;
      size_max = size * 1.3;
    }

    // Build rule name
    const rule_name = `${correction_type}_${project_type}_${Date.now()}`;

    // Insert correction rule
    const { data: rule, error: insertError } = await supabaseAdmin
      .from('correction_rules')
      .insert({
        rule_name,
        correction_type,
        project_type: scope === 'this_only' ? null : project_type, // null means match any
        complexity: scope === 'always' ? null : complexity,
        size_min,
        size_max,
        correction_value,
        email_keywords: email_keywords.length > 0 ? email_keywords : null,
        user_reasoning,
        scope,
        source_case_id,
        source_quote_id,
        active: true
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Failed to save correction rule:', insertError);
      return err(`Failed to save correction: ${insertError.message}`, 500);
    }

    console.log(`✅ Correction rule saved: ${rule.id}`);

    // If this is a correction (not just a note), update the quote with the correction info
    if (source_quote_id && correction_type !== 'freeform_note') {
      await supabaseAdmin
        .from('quotes')
        .update({
          has_corrections: true,
          correction_reasoning: user_reasoning
        })
        .eq('id', source_quote_id);
    }

    return ok({
      rule_id: rule.id,
      rule_name: rule.rule_name,
      scope,
      message: scope === 'this_only'
        ? 'Rettelsen er noteret for denne sag'
        : 'Systemet vil huske dette til fremtidige lignende sager'
    });

  } catch (error) {
    console.error('💥 Save correction error:', error);
    return err(error);
  }
});
