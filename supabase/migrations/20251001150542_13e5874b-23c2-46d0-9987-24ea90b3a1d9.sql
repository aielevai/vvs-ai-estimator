-- Create pricing_config table for base rates
CREATE TABLE public.pricing_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hourly_rate numeric NOT NULL DEFAULT 595,
  service_vehicle_rate numeric NOT NULL DEFAULT 65,
  minimum_project numeric NOT NULL DEFAULT 4500,
  vat_rate numeric NOT NULL DEFAULT 0.25,
  version integer NOT NULL DEFAULT 1,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create pricing_profiles table for project type configurations
CREATE TABLE public.pricing_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_type character varying NOT NULL,
  base_hours numeric NOT NULL,
  average_size numeric NOT NULL,
  size_unit character varying NOT NULL,
  beta_default numeric NOT NULL DEFAULT 1.0,
  min_hours numeric NOT NULL,
  max_hours numeric NOT NULL,
  min_labor_hours numeric NOT NULL,
  apply_minimum_project boolean NOT NULL DEFAULT false,
  material_cost_per_unit numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(project_type)
);

-- Enable RLS
ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for read access
CREATE POLICY "Allow all operations on pricing_config"
ON public.pricing_config
FOR ALL
USING (true);

CREATE POLICY "Allow all operations on pricing_profiles"
ON public.pricing_profiles
FOR ALL
USING (true);

-- Insert initial pricing_config
INSERT INTO public.pricing_config (hourly_rate, service_vehicle_rate, minimum_project, vat_rate, version)
VALUES (595, 65, 4500, 0.25, 1);

-- Insert pricing profiles for all project types
INSERT INTO public.pricing_profiles (
  project_type, base_hours, average_size, size_unit, beta_default, 
  min_hours, max_hours, min_labor_hours, apply_minimum_project, material_cost_per_unit
) VALUES
  ('bathroom_renovation', 8, 10, 'm2', 1.0, 4, 200, 6, false, 3500),
  ('kitchen_plumbing', 4, 8, 'm2', 1.0, 3, 100, 4, false, 2200),
  ('pipe_installation', 0.7, 15, 'meter', 1.0, 2, 150, 3, false, 180),
  ('district_heating', 16, 1, 'connection', 1.0, 8, 40, 8, false, 24000),
  ('floor_heating', 1.5, 35, 'm2', 1.0, 4, 200, 4, false, 800),
  ('radiator_installation', 4, 3, 'units', 1.0, 2, 80, 3, false, 2500),
  ('service_call', 3, 1, 'job', 1.0, 2, 50, 2, true, 500);

-- Create index for efficient lookups
CREATE INDEX idx_pricing_profiles_project_type ON public.pricing_profiles(project_type);
CREATE INDEX idx_pricing_config_effective_from ON public.pricing_config(effective_from DESC);