-- Add unit column to quote_lines table
ALTER TABLE quote_lines 
ADD COLUMN IF NOT EXISTS unit text;

COMMENT ON COLUMN quote_lines.unit IS 'Enhed for linjen: stk, m, m2, time, sæt, spand, job';