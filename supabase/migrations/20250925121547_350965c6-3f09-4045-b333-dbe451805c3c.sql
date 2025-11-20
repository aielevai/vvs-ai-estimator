-- Clear existing supplier_prices data
TRUNCATE TABLE supplier_prices;

-- Create a temporary table to hold CSV data
CREATE TEMP TABLE temp_csv_data (
  short_description TEXT,
  long_description TEXT,
  supplier_item_id TEXT,
  vvs_number TEXT,
  ean_id TEXT,
  customer_item_id TEXT,
  tun_id TEXT,
  el_id TEXT,
  unspsc TEXT,
  leadtime TEXT,
  is_on_stock TEXT,
  gross_price TEXT,
  net_price TEXT,
  price_quantity TEXT,
  price_unit TEXT,
  price_currency TEXT,
  ordering_unit_1 TEXT,
  ordering_unit_factor_1 TEXT,
  ordering_unit_2 TEXT,
  ordering_unit_factor_2 TEXT,
  image_url TEXT,
  link TEXT
);

-- Note: The actual CSV data will need to be imported manually through the Supabase dashboard
-- For now, let's add some sample data to test the system

INSERT INTO supplier_prices (
  supplier_id,
  product_code,
  description,
  base_price,
  final_price,
  valentin_mapping
) VALUES
  ('ahlsell', '322701', 'Hulpr. 40/40/2,00 mm udek. EN10219 S235', 75.60, 75.60, 'pipe_installation'),
  ('ahlsell', '368878', 'Hulpr. 100/40/3,00 mm EN10219 S235', 94.20, 94.20, 'pipe_installation'),
  ('ahlsell', 'FLOOR_HEAT_001', 'Gulvvarmerør 16mm PEX-AL-PEX pr. meter', 18.50, 18.50, 'floor_heating'),
  ('ahlsell', 'FLOOR_HEAT_002', 'Fordelerboks 8-kreds m/termostat', 3200.00, 3200.00, 'floor_heating'),
  ('ahlsell', 'DISTRICT_001', 'Fjernvarme tilslutning komplet sæt', 12500.00, 12500.00, 'district_heating'),
  ('ahlsell', 'DISTRICT_002', 'Fjernvarme veksler 25 kW', 8500.00, 8500.00, 'district_heating'),
  ('ahlsell', 'BATHROOM_001', 'Toilet komplet sæt hvid', 2450.00, 2450.00, 'bathroom_renovation'),
  ('ahlsell', 'BATHROOM_002', 'Håndvask med armatur', 1890.00, 1890.00, 'bathroom_renovation'),
  ('ahlsell', 'KITCHEN_001', 'Køkkenvask rustfri stål', 1250.00, 1250.00, 'kitchen_plumbing'),
  ('ahlsell', 'RAD_001', 'Radiator type 22 60x140cm', 1750.00, 1750.00, 'radiator_installation');

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_supplier_prices_valentin_mapping ON supplier_prices(valentin_mapping);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_supplier_id ON supplier_prices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_description ON supplier_prices USING gin(to_tsvector('danish', description));