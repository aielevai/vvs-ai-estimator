// Apply Corrections Edge Function
// Applies matching correction rules to an analysis
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, handleOptions } from "../_shared/http.ts";
import { supabaseAdmin } from '../_shared/supabase.ts';

interface CorrectionRule {
  id: string;
  correction_type: string;
  correction_value: any;
  relevance_score?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();

  try {
    const body = await req.json();
    const { analysis, rules } = body;

    if (!analysis) {
      return err('analysis is required', 400);
    }

    if (!rules || rules.length === 0) {
      return ok({
        analysis,
        applied_rules: [],
        message: 'No rules to apply'
      });
    }

    console.log(`🔧 Applying ${rules.length} correction rules`);

    const appliedRules: any[] = [];
    let modifiedAnalysis = { ...analysis };

    // Apply each rule
    for (const rule of rules as CorrectionRule[]) {
      try {
        const result = applyRule(modifiedAnalysis, rule);
        if (result.applied) {
          modifiedAnalysis = result.analysis;
          appliedRules.push({
            rule_id: rule.id,
            correction_type: rule.correction_type,
            change_description: result.description
          });

          // Update rule usage stats
          await supabaseAdmin
            .from('correction_rules')
            .update({
              times_applied: supabaseAdmin.sql`times_applied + 1`,
              last_applied_at: new Date().toISOString()
            })
            .eq('id', rule.id);

          console.log(`✅ Applied rule ${rule.id}: ${result.description}`);
        }
      } catch (e) {
        console.log(`⚠️ Failed to apply rule ${rule.id}:`, e);
      }
    }

    console.log(`✅ Applied ${appliedRules.length} of ${rules.length} rules`);

    return ok({
      analysis: modifiedAnalysis,
      applied_rules: appliedRules,
      original_analysis: analysis
    });

  } catch (error) {
    console.error('💥 Apply corrections error:', error);
    return err(error);
  }
});

function applyRule(analysis: any, rule: CorrectionRule): { applied: boolean; analysis: any; description: string } {
  const cv = rule.correction_value;

  switch (rule.correction_type) {
    case 'hours_adjustment': {
      if (!analysis.signals) analysis.signals = {};

      // Apply hours multiplier
      if (cv.hours_multiplier) {
        const oldMultiplier = analysis.signals.hours_multiplier || 1.0;
        const newMultiplier = oldMultiplier * cv.hours_multiplier;
        analysis.signals.hours_multiplier = newMultiplier;
        return {
          applied: true,
          analysis,
          description: `Timer ganget med ${cv.hours_multiplier.toFixed(2)} (${oldMultiplier.toFixed(2)} → ${newMultiplier.toFixed(2)})`
        };
      }

      // Apply hours addition
      if (cv.hours_add) {
        const oldAdd = analysis.signals.hours_add || 0;
        const newAdd = oldAdd + cv.hours_add;
        analysis.signals.hours_add = newAdd;
        return {
          applied: true,
          analysis,
          description: `Tilføjet ${cv.hours_add} ekstra timer (total tilføjet: ${newAdd})`
        };
      }
      break;
    }

    case 'material_adjustment': {
      if (!analysis.signals) analysis.signals = {};

      // Apply material cost multiplier
      if (cv.material_multiplier) {
        analysis.signals.material_multiplier = cv.material_multiplier;
        return {
          applied: true,
          analysis,
          description: `Materialer ganget med ${cv.material_multiplier.toFixed(2)}`
        };
      }
      break;
    }

    case 'complexity_override': {
      if (!analysis.signals) analysis.signals = {};

      if (cv.complexity) {
        const old = analysis.signals.complexity || 'medium';
        analysis.signals.complexity = cv.complexity;
        return {
          applied: true,
          analysis,
          description: `Kompleksitet ændret fra ${old} til ${cv.complexity}`
        };
      }
      break;
    }

    case 'freeform_note': {
      // Freeform notes are stored but don't modify analysis
      // They are shown to the user as context
      if (!analysis.notes) analysis.notes = [];
      analysis.notes.push(cv.note);
      return {
        applied: true,
        analysis,
        description: `Note tilføjet: "${cv.note?.substring(0, 50)}..."`
      };
    }

    default:
      console.log(`Unknown correction type: ${rule.correction_type}`);
  }

  return { applied: false, analysis, description: '' };
}
