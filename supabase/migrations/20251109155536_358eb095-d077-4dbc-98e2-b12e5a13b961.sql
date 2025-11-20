-- Tilføj manglende kolonner til quote_lines
ALTER TABLE quote_lines 
  ADD COLUMN IF NOT EXISTS component_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS unit VARCHAR(20);

-- customer_supplied findes allerede, så vi opdaterer bare default
ALTER TABLE quote_lines 
  ALTER COLUMN customer_supplied SET DEFAULT false;

-- Tilføj indexes for hurtigere opslag
CREATE INDEX IF NOT EXISTS idx_quote_lines_component_key ON quote_lines(component_key);
CREATE INDEX IF NOT EXISTS idx_quote_lines_customer_supplied ON quote_lines(customer_supplied);
CREATE INDEX IF NOT EXISTS idx_quote_lines_source ON quote_lines(source);

-- Opdater eksisterende rækker med default værdier
UPDATE quote_lines 
SET unit = 'stk' 
WHERE unit IS NULL AND line_type = 'material';

UPDATE quote_lines 
SET source = 'manual' 
WHERE source IS NULL;

UPDATE quote_lines 
SET customer_supplied = false 
WHERE customer_supplied IS NULL;