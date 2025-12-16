// Learn From Quote Edge Function
// Saves approved/corrected quotes to learned_projects for future learning
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, handleOptions } from "../_shared/http.ts";
import { supabaseAdmin } from '../_shared/supabase.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();

  try {
    const body = await req.json();
    const {
      quote_id,
      case_id,
      approval_type, // 'approved', 'corrected', 'rejected'
      correction_reasoning,
      approved_by
    } = body;

    console.log('📚 Learning from quote:', { quote_id, approval_type });

    if (!quote_id) {
      return err('quote_id is required', 400);
    }

    // Get the quote with its lines and case data
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
      console.error('❌ Quote not found:', quoteError);
      return err('Quote not found', 404);
    }

    // Get quote lines
    const { data: lines } = await supabaseAdmin
      .from('quote_lines')
      .select('*')
      .eq('quote_id', quote_id);

    // Extract project metadata
    const extracted = quote.cases?.extracted_data || {};
    const project = extracted.project || {};
    const signals = extracted.signals || {};

    // Calculate actual values
    const laborLine = lines?.find((l: any) => l.line_type === 'labor');
    const actualHours = laborLine?.quantity || quote.labor_hours || 0;

    const materialLines = lines?.filter((l: any) => l.line_type === 'material') || [];
    const actualMaterialsCost = materialLines.reduce((sum: number, l: any) => sum + (l.total_price || 0), 0);

    // Get AI estimates from pricing_trace
    const trace = quote.pricing_trace || {};
    const aiEstimatedHours = trace.hours_calculation?.raw || actualHours;

    // Build learned project record
    const learnedProject = {
      source_case_id: case_id || quote.case_id,
      source_quote_id: quote_id,
      project_type: project.type || quote.metadata?.project_type,
      project_description: project.description || quote.cases?.email_subject,
      complexity: project.complexity || signals.complexity || 'medium',
      estimated_size: project.estimated_size?.value || project.estimated_size || quote.metadata?.estimated_size,
      size_unit: project.estimated_size?.unit || project.size_unit || 'm2',
      actual_hours: actualHours,
      actual_materials_cost: actualMaterialsCost,
      actual_total_cost: quote.total_amount,
      ai_estimated_hours: aiEstimatedHours,
      ai_estimated_materials: trace.materials?.sale_total,
      ai_estimated_total: quote.subtotal, // Pre-correction subtotal
      signals,
      email_content: quote.cases?.email_body,
      correction_reasoning,
      approved_by,
      approval_type: approval_type || 'approved',
      confidence_score: approval_type === 'approved' ? 0.95 : 0.8, // Higher confidence for approved
      use_for_training: approval_type !== 'rejected'
    };

    // Insert into learned_projects
    const { data: learned, error: insertError } = await supabaseAdmin
      .from('learned_projects')
      .insert(learnedProject)
      .select()
      .single();

    if (insertError) {
      console.error('❌ Failed to save learned project:', insertError);
      return err(`Failed to save: ${insertError.message}`, 500);
    }

    console.log(`✅ Learned project saved: ${learned.id}`);

    // Update quote status
    await supabaseAdmin
      .from('quotes')
      .update({
        status: approval_type === 'approved' ? 'approved' : 'corrected',
        learned_project_id: learned.id
      })
      .eq('id', quote_id);

    // Update case status
    await supabaseAdmin
      .from('cases')
      .update({ status: 'approved' })
      .eq('id', case_id || quote.case_id);

    console.log('✅ Quote and case status updated');

    return ok({
      learned_project_id: learned.id,
      approval_type,
      message: approval_type === 'approved'
        ? 'Tilbuddet er godkendt og gemt til fremtidig læring'
        : 'Rettelserne er gemt til fremtidig læring'
    });

  } catch (error) {
    console.error('💥 Learn from quote error:', error);
    return err(error);
  }
});
