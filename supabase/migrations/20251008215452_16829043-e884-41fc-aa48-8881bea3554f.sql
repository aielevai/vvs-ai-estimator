-- FASE 1: Database-fundamenter

-- Materiale-gulv pr type (sikkerhedsnet mod for lave materialer)
CREATE TABLE IF NOT EXISTS public.material_floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_type TEXT NOT NULL UNIQUE,
  base_floor NUMERIC NOT NULL DEFAULT 0,
  per_unit_floor NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tilføj unit_price_norm og category til enhanced_supplier_prices
ALTER TABLE public.enhanced_supplier_prices 
ADD COLUMN IF NOT EXISTS unit_price_norm NUMERIC,
ADD COLUMN IF NOT EXISTS category TEXT;

-- Hjælpefunktion til medianpris pr kategori
CREATE OR REPLACE FUNCTION public.median_unit_price_by_category(in_category TEXT)
RETURNS TABLE(median NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  arr NUMERIC[];
  mid INT;
BEGIN
  SELECT array_agg(unit_price_norm ORDER BY unit_price_norm)
  INTO arr
  FROM enhanced_supplier_prices
  WHERE category = in_category
    AND unit_price_norm IS NOT NULL
    AND unit_price_norm > 0;

  IF arr IS NULL OR cardinality(arr) = 0 THEN
    RETURN QUERY SELECT NULL::NUMERIC;
    RETURN;
  END IF;

  mid := cardinality(arr) / 2;
  IF cardinality(arr) % 2 = 1 THEN
    RETURN QUERY SELECT arr[mid + 1];
  ELSE
    RETURN QUERY SELECT (arr[mid] + arr[mid + 1]) / 2.0;
  END IF;
END;
$$;

-- Seed materiale-gulve for alle projekttyper
INSERT INTO public.material_floors (project_type, base_floor, per_unit_floor)
VALUES
  ('bathroom_renovation', 15000, 1500),
  ('floor_heating', 8000, 250),
  ('radiator_installation', 2000, 1500),
  ('district_heating', 25000, 0),
  ('pipe_installation', 0, 200),
  ('kitchen_plumbing', 5000, 800),
  ('service_call', 0, 0)
ON CONFLICT (project_type) DO UPDATE SET
  base_floor = EXCLUDED.base_floor,
  per_unit_floor = EXCLUDED.per_unit_floor;

-- Enable RLS
ALTER TABLE public.material_floors ENABLE ROW LEVEL SECURITY;

-- Allow all operations (same pattern as other tables)
CREATE POLICY "Allow all operations on material_floors"
ON public.material_floors
FOR ALL
USING (true);