-- Opret components tabel (NET-priser må IKKE eksponeres til klient)
CREATE TABLE IF NOT EXISTS components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  supplier_sku TEXT,
  notes TEXT,
  net_price NUMERIC NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'stk',
  category TEXT,
  critical BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT components_net_price_nonneg CHECK (net_price >= 0)
);

-- RLS: aktivér men GIV IKKE klientadgang (service role bypasser automatisk)
ALTER TABLE components ENABLE ROW LEVEL SECURITY;

-- Auto-opdater updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_components_updated_at ON components;
CREATE TRIGGER trg_components_updated_at
BEFORE UPDATE ON components
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indeks for performance
CREATE INDEX IF NOT EXISTS idx_components_key ON components(key);
CREATE INDEX IF NOT EXISTS idx_components_category ON components(category);

-- Unikt indeks for case-quote relation (undgå duplikater)
CREATE UNIQUE INDEX IF NOT EXISTS uq_quotes_case_id ON quotes(case_id);

-- Seed basis-komponenter (NET-priser fra Ahlsell)
INSERT INTO components (key, supplier_sku, notes, net_price, unit, category, critical) VALUES
  -- Badeværelse (Valentin leverer)
  ('unidrain_line', 'UDL-200', 'UniDrain Line 200mm', 850, 'stk', 'drain', true),
  ('unidrain_low_outlet_ø50', 'UDLO-50', 'UniDrain lavafløb Ø50mm', 320, 'stk', 'drain', true),
  ('pex_15', 'PEX-15-100', 'PEX-rør 15mm (pr. meter)', 12, 'm', 'pipes', true),
  ('manifold_small', 'MF-4', 'Fordeler 4-vejs', 680, 'stk', 'manifold', true),
  ('ballofix', 'BF-15', 'Ballofix kuglehane 15mm', 45, 'stk', 'fittings', true),
  ('geberit_duofix_cistern', 'GEB-DF-WC', 'Geberit DuoFix cisterne', 1250, 'stk', 'sanitary', true),
  ('drain_pipes_fittings', 'DRAIN-SET', 'Afløbsrør + fittings sæt', 850, 'sæt', 'drain', true),
  ('consumables_small', 'CONS-S', 'Småmateriel (skruer, lim, etc)', 350, 'sæt', 'consumables', true),
  ('haulage_waste', 'HAUL-W', 'Kørsel + affald', 500, 'sæt', 'logistics', false),
  
  -- Kundeleveret (NET = 0, tælles ikke i floor/avance)
  ('wc_bowl', 'CS-WC', 'WC-skål (kundeleveret)', 0, 'stk', 'sanitary', false),
  ('flush_plate', 'CS-FP', 'Trykkplade (kundeleveret)', 0, 'stk', 'sanitary', false),
  ('faucet_basin', 'CS-FB', 'Håndvaskarmatur (kundeleveret)', 0, 'stk', 'sanitary', false),
  ('faucet_shower', 'CS-FS', 'Brusebatteri (kundeleveret)', 0, 'stk', 'sanitary', false),
  
  -- Gulvvarme
  ('fh_hose_16mm', 'FH-H16', 'Gulvvarmeslange 16mm (pr. meter)', 18, 'm', 'floor_heating', true),
  ('fh_manifold', 'FH-MF', 'Gulvvarmefordeler m/ventiler', 1200, 'zone', 'floor_heating', true),
  ('fh_shunt_pump_group', 'FH-SHUNT', 'Shuntgruppe m/pumpe', 3500, 'stk', 'floor_heating', true),
  ('fh_thermostat', 'FH-THERM', 'Termostat digital', 450, 'stk', 'floor_heating', true),
  
  -- Fjernvarme
  ('dh_substation_hex', 'DH-HEX', 'Varmevekslerstation', 8500, 'stk', 'district_heating', true),
  ('dh_strainers_filters', 'DH-FILT', 'Filtre + smudssi', 1200, 'sæt', 'district_heating', true),
  ('dh_safety_valve', 'DH-SV', 'Sikkerhedsventil', 850, 'stk', 'district_heating', true),
  ('insulation', 'INSUL', 'Isolering', 600, 'sæt', 'insulation', false)
ON CONFLICT (key) DO NOTHING;

-- Sikr korrekt gulv for badeværelse (10k + 700/m²)
INSERT INTO material_floors (project_type, base_floor, per_unit_floor)
VALUES ('bathroom_renovation', 10000, 700)
ON CONFLICT (project_type) DO UPDATE
SET base_floor = EXCLUDED.base_floor,
    per_unit_floor = EXCLUDED.per_unit_floor;