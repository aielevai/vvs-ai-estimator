-- Sikr quote_lines skema
ALTER TABLE quote_lines
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS customer_supplied boolean DEFAULT false;

-- RLS policies for quotes og quote_lines
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_lines ENABLE ROW LEVEL SECURITY;

-- Tillad authenticated at indsætte/læse quotes
DROP POLICY IF EXISTS "insert quotes (auth)" ON quotes;
CREATE POLICY "insert quotes (auth)" ON quotes
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "select quotes (auth)" ON quotes;
CREATE POLICY "select quotes (auth)" ON quotes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "update quotes (auth)" ON quotes;
CREATE POLICY "update quotes (auth)" ON quotes
  FOR UPDATE TO authenticated USING (true);

-- Tillad authenticated at indsætte/læse quote_lines
DROP POLICY IF EXISTS "insert lines (auth)" ON quote_lines;
CREATE POLICY "insert lines (auth)" ON quote_lines
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "select lines (auth)" ON quote_lines;
CREATE POLICY "select lines (auth)" ON quote_lines
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "update lines (auth)" ON quote_lines;
CREATE POLICY "update lines (auth)" ON quote_lines
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "delete lines (auth)" ON quote_lines;
CREATE POLICY "delete lines (auth)" ON quote_lines
  FOR DELETE TO authenticated USING (true);