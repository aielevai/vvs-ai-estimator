-- Enable RLS and add select policies for material_floors and pricing_config
-- so client-side preview can read these tables

-- Material floors
alter table material_floors enable row level security;

drop policy if exists "select material_floors (auth)" on material_floors;
create policy "select material_floors (auth)"
  on material_floors 
  for select 
  to authenticated
  using (true);

-- Pricing config
alter table pricing_config enable row level security;

drop policy if exists "select pricing_config (auth)" on pricing_config;
create policy "select pricing_config (auth)"
  on pricing_config 
  for select 
  to authenticated
  using (true);