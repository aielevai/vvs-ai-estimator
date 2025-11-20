-- ============================================
-- Complete Setup SQL Migration
-- Run this entire file in Supabase SQL Editor
-- ============================================

-- NOTE: Storage RLS Policies must be set up via Supabase Dashboard
-- Go to: Storage > Policies > product-data bucket
-- The policies are already configured automatically when bucket is created
-- If needed, you can add custom policies via the Dashboard UI

-- ============================================
-- PART B: Data Import Tracking Table
-- ============================================

-- Create table to track data import runs
CREATE TABLE IF NOT EXISTS data_import_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  csv_filename TEXT,
  csv_checksum TEXT,
  discount_filename TEXT,
  discount_checksum TEXT,
  products_processed INTEGER DEFAULT 0,
  products_errors INTEGER DEFAULT 0,
  discounts_processed INTEGER DEFAULT 0,
  discounts_errors INTEGER DEFAULT 0,
  triggered_by TEXT DEFAULT 'manual',
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(csv_checksum, discount_checksum)
);

-- Enable RLS
ALTER TABLE data_import_runs ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage
DROP POLICY IF EXISTS "Service role can manage import runs" ON data_import_runs;
CREATE POLICY "Service role can manage import runs" ON data_import_runs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- NOTE: OpenAI Model Configuration
-- ============================================

-- OpenAI model is hardcoded in edge function code (analyze-email/index.ts)
-- It's already set to 'gpt-5.1' - no database update needed!

-- ============================================
-- PART C: Storage Bucket
-- ============================================

-- NOTE: Storage bucket should be created via Supabase Dashboard
-- Go to: Storage > Create Bucket
-- Name: product-data
-- Public: Yes
-- The bucket is already created and files are uploaded

-- ============================================
-- Verification Queries (optional - run separately)
-- ============================================

-- Uncomment these to verify setup:
-- SELECT COUNT(*) as import_runs_table FROM information_schema.tables WHERE table_name = 'data_import_runs';
-- SELECT * FROM data_import_runs ORDER BY imported_at DESC LIMIT 5;
