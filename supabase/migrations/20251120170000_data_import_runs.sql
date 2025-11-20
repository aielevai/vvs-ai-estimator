-- Track every enhanced data import run
CREATE TABLE IF NOT EXISTS public.data_import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  csv_filename TEXT NOT NULL,
  csv_checksum TEXT NOT NULL,
  discount_filename TEXT,
  discount_checksum TEXT,
  products_processed INTEGER DEFAULT 0,
  products_errors INTEGER DEFAULT 0,
  discounts_processed INTEGER DEFAULT 0,
  discounts_errors INTEGER DEFAULT 0,
  triggered_by TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.data_import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow service role to read data import runs"
ON public.data_import_runs
FOR SELECT
TO service_role
USING (true);

CREATE POLICY IF NOT EXISTS "Allow service role to insert data import runs"
ON public.data_import_runs
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Allow authenticated read-only access to data import runs"
ON public.data_import_runs
FOR SELECT
TO authenticated
USING (true);

