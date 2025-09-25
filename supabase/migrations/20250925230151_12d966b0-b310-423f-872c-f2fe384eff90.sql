-- Fix security warning: Set search_path for the function
CREATE OR REPLACE FUNCTION public.import_enhanced_supplier_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- This function will be called by the enhanced-data-import edge function
  -- to import the 65k products from ahlsell-prices.csv
  RAISE NOTICE 'Enhanced supplier data import function created';
END;
$$;