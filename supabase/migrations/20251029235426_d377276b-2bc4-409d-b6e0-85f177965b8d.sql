-- Add JSONB columns to quotes table for storing pricing metadata and calculation traces
-- These columns enable historical analysis and debugging of quote calculations

ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB,
ADD COLUMN IF NOT EXISTS pricing_trace JSONB,
ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN quotes.pricing_snapshot IS 'Stores the pricing config used at quote creation (hourly rates, markup, VAT, etc.)';
COMMENT ON COLUMN quotes.pricing_trace IS 'Stores calculation steps and reasoning for debugging';
COMMENT ON COLUMN quotes.metadata IS 'Stores project-specific info (type, size, complexity, signals)';