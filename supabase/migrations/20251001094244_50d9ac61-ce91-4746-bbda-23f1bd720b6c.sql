-- Create quote_feedback table for learning system
CREATE TABLE IF NOT EXISTS public.quote_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
  
  -- Original AI suggestions
  ai_suggested_hours NUMERIC,
  ai_suggested_materials JSONB,
  ai_confidence NUMERIC,
  
  -- User's final choices
  user_final_hours NUMERIC,
  user_final_materials JSONB,
  user_modifications JSONB, -- Track what was changed
  
  -- Actual outcomes (filled in later)
  actual_hours_spent NUMERIC,
  actual_materials_used JSONB,
  actual_cost NUMERIC,
  
  -- Learning data
  accuracy_score NUMERIC, -- How close was AI to user's choice
  user_satisfaction INTEGER, -- 1-5 rating
  notes TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT feedback_satisfaction_range CHECK (user_satisfaction >= 1 AND user_satisfaction <= 5)
);

-- Enable RLS
ALTER TABLE public.quote_feedback ENABLE ROW LEVEL SECURITY;

-- Allow all operations (same as other tables in the system)
CREATE POLICY "Allow all operations on quote_feedback"
  ON public.quote_feedback
  FOR ALL
  USING (true);

-- Create index for fast lookups
CREATE INDEX idx_quote_feedback_quote_id ON public.quote_feedback(quote_id);
CREATE INDEX idx_quote_feedback_case_id ON public.quote_feedback(case_id);
CREATE INDEX idx_quote_feedback_created_at ON public.quote_feedback(created_at DESC);

-- Create material_search_cache table for faster lookups
CREATE TABLE IF NOT EXISTS public.material_search_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  search_query TEXT NOT NULL,
  project_type VARCHAR,
  materials JSONB NOT NULL,
  confidence NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_search_query UNIQUE (search_query, project_type)
);

-- Enable RLS
ALTER TABLE public.material_search_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on material_search_cache"
  ON public.material_search_cache
  FOR ALL
  USING (true);

-- Create index for fast cache lookups
CREATE INDEX idx_material_search_cache_query ON public.material_search_cache(search_query, project_type);