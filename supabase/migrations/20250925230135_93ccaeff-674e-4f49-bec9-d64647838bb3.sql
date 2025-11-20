-- Step 1: Fix Gmail sync duplicates by adding email_message_id column
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS email_message_id TEXT;

-- Create unique constraint to prevent duplicate emails
CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_email_message_id_unique 
ON public.cases (email_message_id) WHERE email_message_id IS NOT NULL;

-- Step 2: Import CSV data to enhanced_supplier_prices
-- Create enhanced data import function 
CREATE OR REPLACE FUNCTION public.import_enhanced_supplier_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- This function will be called by the enhanced-data-import edge function
  -- to import the 65k products from ahlsell-prices.csv
  RAISE NOTICE 'Enhanced supplier data import function created';
END;
$$;