-- FASE 1: Database Cleanup + New Tables

-- 1.1: Truncate old product data
TRUNCATE TABLE enhanced_supplier_prices CASCADE;

-- 1.2: Create discount_codes table
CREATE TABLE IF NOT EXISTS discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_group VARCHAR(10) NOT NULL UNIQUE,
  product_code_prefix VARCHAR(50),
  discount_percentage NUMERIC(5,2) NOT NULL,
  description TEXT,
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_to DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.3: Add processing_status to cases
ALTER TABLE cases 
ADD COLUMN IF NOT EXISTS processing_status JSONB DEFAULT '{"step": "pending", "progress": 0, "message": ""}'::jsonb;

-- 1.4: Create material_matches cache table
CREATE TABLE IF NOT EXISTS material_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_key VARCHAR(100) NOT NULL,
  project_type VARCHAR(50),
  matched_product_code VARCHAR(100),
  matched_vvs_number VARCHAR(50),
  confidence NUMERIC(3,2),
  search_query TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(component_key, project_type)
);

-- 1.5: Optimize enhanced_supplier_prices indexes
CREATE INDEX IF NOT EXISTS idx_esp_vvs_number ON enhanced_supplier_prices(vvs_number) WHERE vvs_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_esp_supplier_id ON enhanced_supplier_prices(supplier_item_id) WHERE supplier_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_esp_category ON enhanced_supplier_prices(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_esp_price_range ON enhanced_supplier_prices(net_price) WHERE net_price > 0;

-- 1.6: Enable RLS on new tables
ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_matches ENABLE ROW LEVEL SECURITY;

-- 1.7: Create policies for new tables
CREATE POLICY "Allow all operations on discount_codes" ON discount_codes FOR ALL USING (true);
CREATE POLICY "Allow all operations on material_matches" ON material_matches FOR ALL USING (true);

-- 1.8: Create index on material_matches for fast lookups
CREATE INDEX IF NOT EXISTS idx_material_matches_key ON material_matches(component_key, project_type);