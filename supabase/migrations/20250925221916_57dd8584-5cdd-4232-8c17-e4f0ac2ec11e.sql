-- Fix security warnings by setting search_path for the function
CREATE OR REPLACE FUNCTION public.update_search_vector()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector := to_tsvector('danish', 
    COALESCE(NEW.short_description, '') || ' ' || 
    COALESCE(NEW.long_description, '') || ' ' ||
    COALESCE(NEW.vvs_number, '') || ' ' ||
    COALESCE(NEW.supplier_item_id, '')
  );
  RETURN NEW;
END;
$$;