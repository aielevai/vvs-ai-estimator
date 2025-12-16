-- ============================================
-- Learning System SQL Migration
-- Tables: learned_projects, correction_rules
-- ============================================

-- ============================================
-- PART A: Learned Projects Table
-- Stores approved/corrected quotes for learning
-- ============================================

CREATE TABLE IF NOT EXISTS learned_projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Source information
  source_case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  source_quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,

  -- Project metadata
  project_type TEXT NOT NULL,
  project_description TEXT,
  complexity TEXT DEFAULT 'medium',
  estimated_size NUMERIC,
  size_unit TEXT DEFAULT 'm2',

  -- Actual values (after approval/correction)
  actual_hours NUMERIC NOT NULL,
  actual_materials_cost NUMERIC,
  actual_total_cost NUMERIC,

  -- Original AI values (for comparison)
  ai_estimated_hours NUMERIC,
  ai_estimated_materials NUMERIC,
  ai_estimated_total NUMERIC,

  -- Signals/context
  signals JSONB DEFAULT '{}',
  email_content TEXT,

  -- Learning metadata
  correction_reasoning TEXT,
  approved_by TEXT,
  approval_type TEXT DEFAULT 'approved', -- 'approved', 'corrected', 'rejected'

  -- Quality indicators
  confidence_score NUMERIC DEFAULT 0.8,
  use_for_training BOOLEAN DEFAULT true,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_learned_projects_type ON learned_projects(project_type);
CREATE INDEX IF NOT EXISTS idx_learned_projects_size ON learned_projects(estimated_size);
CREATE INDEX IF NOT EXISTS idx_learned_projects_training ON learned_projects(use_for_training) WHERE use_for_training = true;

-- Enable RLS
ALTER TABLE learned_projects ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
DROP POLICY IF EXISTS "Service role can manage learned_projects" ON learned_projects;
CREATE POLICY "Service role can manage learned_projects" ON learned_projects
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- PART B: Correction Rules Table
-- Stores user corrections for future application
-- ============================================

CREATE TABLE IF NOT EXISTS correction_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Rule identification
  rule_name TEXT,
  correction_type TEXT NOT NULL, -- 'hours_adjustment', 'material_adjustment', 'freeform_note'

  -- Matching criteria
  project_type TEXT,
  complexity TEXT,
  size_min NUMERIC,
  size_max NUMERIC,

  -- What to change
  correction_value JSONB NOT NULL, -- { hours_multiplier: 1.2 } or { hours_add: 2 } or { note: "..." }

  -- Context for AI matching
  email_keywords TEXT[], -- Keywords to match in email content
  user_reasoning TEXT,

  -- Scope
  scope TEXT DEFAULT 'similar', -- 'this_only', 'similar', 'always'

  -- Source
  source_case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  source_quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,

  -- Stats
  times_applied INTEGER DEFAULT 0,
  last_applied_at TIMESTAMP WITH TIME ZONE,

  -- Status
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient matching
CREATE INDEX IF NOT EXISTS idx_correction_rules_type ON correction_rules(project_type) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_correction_rules_active ON correction_rules(active);
CREATE INDEX IF NOT EXISTS idx_correction_rules_scope ON correction_rules(scope);

-- Enable RLS
ALTER TABLE correction_rules ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
DROP POLICY IF EXISTS "Service role can manage correction_rules" ON correction_rules;
CREATE POLICY "Service role can manage correction_rules" ON correction_rules
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- PART C: Update function for timestamps
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS update_learned_projects_updated_at ON learned_projects;
CREATE TRIGGER update_learned_projects_updated_at
  BEFORE UPDATE ON learned_projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_correction_rules_updated_at ON correction_rules;
CREATE TRIGGER update_correction_rules_updated_at
  BEFORE UPDATE ON correction_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PART D: Helper function for finding similar projects
-- ============================================

CREATE OR REPLACE FUNCTION find_similar_learned_projects(
  p_project_type TEXT,
  p_size NUMERIC,
  p_complexity TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS SETOF learned_projects AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM learned_projects
  WHERE project_type = p_project_type
    AND use_for_training = true
    AND estimated_size BETWEEN p_size * 0.7 AND p_size * 1.3
  ORDER BY
    -- Prioritize same complexity
    CASE WHEN complexity = p_complexity THEN 0 ELSE 1 END,
    -- Then by size similarity
    ABS(estimated_size - p_size),
    -- Most recent first
    created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
