// Find Corrections Edge Function
// Finds matching correction rules for a given project
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, handleOptions } from "../_shared/http.ts";
import { supabaseAdmin } from '../_shared/supabase.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();

  try {
    const body = await req.json();
    const {
      project_type,
      size,
      complexity,
      email_content
    } = body;

    console.log('🔍 Finding corrections for:', { project_type, size, complexity });

    // Build query for matching rules
    let query = supabaseAdmin
      .from('correction_rules')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });

    // Get all active rules first, then filter in code for complex logic
    const { data: allRules, error: queryError } = await query;

    if (queryError) {
      console.error('❌ Query error:', queryError);
      return err(`Failed to query corrections: ${queryError.message}`, 500);
    }

    // Filter rules based on matching criteria
    const matchingRules = (allRules || []).filter((rule: any) => {
      // Scope: 'always' rules apply to all of project_type
      if (rule.scope === 'always') {
        return rule.project_type === null || rule.project_type === project_type;
      }

      // Scope: 'similar' rules match type, complexity, and size range
      if (rule.scope === 'similar') {
        // Check project type
        if (rule.project_type && rule.project_type !== project_type) {
          return false;
        }

        // Check complexity
        if (rule.complexity && rule.complexity !== complexity) {
          return false;
        }

        // Check size range
        if (rule.size_min !== null && size < rule.size_min) {
          return false;
        }
        if (rule.size_max !== null && size > rule.size_max) {
          return false;
        }

        return true;
      }

      // Scope: 'this_only' rules should not be applied automatically
      // They are only for documentation purposes
      return false;
    });

    // Score rules by relevance
    const scoredRules = matchingRules.map((rule: any) => {
      let score = 0;

      // Exact type match = higher score
      if (rule.project_type === project_type) score += 3;

      // Exact complexity match = higher score
      if (rule.complexity === complexity) score += 2;

      // Recently created = slightly higher score
      const ageInDays = (Date.now() - new Date(rule.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (ageInDays < 7) score += 1;

      // Has been applied before = higher score (proven useful)
      if (rule.times_applied > 0) score += 1;

      // Keyword matching with email content
      if (rule.email_keywords && email_content) {
        const emailLower = email_content.toLowerCase();
        const keywordMatches = rule.email_keywords.filter((kw: string) =>
          emailLower.includes(kw.toLowerCase())
        ).length;
        score += keywordMatches * 0.5;
      }

      return { ...rule, relevance_score: score };
    });

    // Sort by score descending
    scoredRules.sort((a: any, b: any) => b.relevance_score - a.relevance_score);

    // Return top 5 most relevant rules
    const topRules = scoredRules.slice(0, 5);

    console.log(`✅ Found ${topRules.length} matching correction rules`);

    return ok({
      rules: topRules,
      total_found: matchingRules.length,
      project_type,
      size,
      complexity
    });

  } catch (error) {
    console.error('💥 Find corrections error:', error);
    return err(error);
  }
});
