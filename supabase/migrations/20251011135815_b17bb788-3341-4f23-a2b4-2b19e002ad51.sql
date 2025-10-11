-- Opdater pricing_config med city og postal_code
ALTER TABLE pricing_config 
ADD COLUMN IF NOT EXISTS city text DEFAULT 'Ballerup',
ADD COLUMN IF NOT EXISTS postal_code text DEFAULT '2750';

-- Opdater pricing_profiles med unit kolonne
ALTER TABLE pricing_profiles 
ADD COLUMN IF NOT EXISTS unit text;

-- Opdater unit kolonne baseret på size_unit hvis den findes
UPDATE pricing_profiles 
SET unit = size_unit 
WHERE unit IS NULL AND size_unit IS NOT NULL;

-- Sæt default unit hvis stadig NULL
UPDATE pricing_profiles 
SET unit = 'm2' 
WHERE unit IS NULL;

-- Nu kan vi gøre den NOT NULL
ALTER TABLE pricing_profiles 
ALTER COLUMN unit SET NOT NULL;

-- Drop size_unit da vi nu bruger unit
ALTER TABLE pricing_profiles 
DROP COLUMN IF EXISTS size_unit;

-- Seed data for pricing_config (opdateret version)
INSERT INTO pricing_config (hourly_rate, service_vehicle_rate, minimum_project, vat_rate, city, postal_code, version)
VALUES (595, 65, 4500, 0.25, 'Ballerup', '2750', 1)
ON CONFLICT DO NOTHING;

-- Opdater pricing_profiles med korrekte værdier for alle projekttyper
INSERT INTO pricing_profiles (project_type, unit, base_hours, average_size, beta_default, min_hours, max_hours, min_labor_hours, apply_minimum_project)
VALUES
('bathroom_renovation', 'm2', 40, 10, 0.90, 16, 200, 24, false),
('floor_heating', 'm2', 1.5, 35, 1.00, 4, 200, 8, false),
('radiator_installation', 'units', 4, 3, 1.00, 2, 80, 4, false),
('district_heating', 'connection', 16, 1, 1.00, 8, 40, 8, false),
('pipe_installation', 'meter', 0.7, 15, 1.00, 2, 150, 2, false),
('kitchen_plumbing', 'm2', 4, 8, 1.00, 3, 100, 6, false),
('service_call', 'job', 3, 1, 1.00, 2, 50, 2, true)
ON CONFLICT (project_type) DO UPDATE SET
 unit=EXCLUDED.unit, 
 base_hours=EXCLUDED.base_hours, 
 average_size=EXCLUDED.average_size,
 beta_default=EXCLUDED.beta_default, 
 min_hours=EXCLUDED.min_hours, 
 max_hours=EXCLUDED.max_hours,
 min_labor_hours=EXCLUDED.min_labor_hours, 
 apply_minimum_project=EXCLUDED.apply_minimum_project;

-- Opdater material_floors med korrekte værdier
INSERT INTO material_floors (project_type, base_floor, per_unit_floor)
VALUES
('bathroom_renovation', 15000, 1500),
('floor_heating', 8000, 250),
('radiator_installation', 2000, 1500),
('district_heating', 25000, 0),
('pipe_installation', 0, 200),
('kitchen_plumbing', 5000, 800),
('service_call', 0, 0)
ON CONFLICT (project_type) DO UPDATE SET
 base_floor=EXCLUDED.base_floor, 
 per_unit_floor=EXCLUDED.per_unit_floor;