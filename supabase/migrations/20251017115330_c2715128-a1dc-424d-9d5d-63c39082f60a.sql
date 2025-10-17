-- Add material markup and timesats mode to pricing_config
ALTER TABLE pricing_config
  ADD COLUMN IF NOT EXISTS material_markup numeric NOT NULL DEFAULT 0.40,
  ADD COLUMN IF NOT EXISTS timesats_mode text NOT NULL DEFAULT 'split',
  ADD COLUMN IF NOT EXISTS hourly_rate_labor numeric,
  ADD COLUMN IF NOT EXISTS hourly_rate_vehicle numeric;

-- Update existing config with correct values
UPDATE pricing_config
SET hourly_rate = 660,
    hourly_rate_labor = 595,
    hourly_rate_vehicle = 65,
    service_vehicle_rate = 65,
    material_markup = 0.40,
    timesats_mode = 'split',
    vat_rate = 0.25,
    city = 'Ballerup',
    postal_code = '2750';

-- Update bathroom_renovation profile for correct 41h @ 12m²
UPDATE pricing_profiles
SET base_hours = 35,
    average_size = 10,
    beta_default = 0.90,
    min_hours = 16,
    max_hours = 200,
    min_labor_hours = 24,
    unit = 'm2'
WHERE project_type = 'bathroom_renovation';

-- Ensure material floors are correct
INSERT INTO material_floors (project_type, base_floor, per_unit_floor)
VALUES ('bathroom_renovation', 15000, 1500)
ON CONFLICT (project_type) DO UPDATE
SET base_floor = EXCLUDED.base_floor,
    per_unit_floor = EXCLUDED.per_unit_floor;