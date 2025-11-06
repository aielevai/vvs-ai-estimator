-- Tilføj 28 nye komponenter til components tabel
-- Afløb & Vådrum (6 komponenter)
INSERT INTO components (key, supplier_sku, notes, net_price, unit, category, critical) VALUES
('drain_pipe_dn50', 'PP-DN50', 'PP afløbsrør DN50', 48, 'm', 'drain', true),
('drain_pipe_dn110', 'PP-DN110', 'PP afløbsrør DN110', 95, 'm', 'drain', true),
('trap_dn32', 'TRAP-32', 'Vandlås DN32', 110, 'stk', 'drain', true),
('wetroom_membrane', 'WR-MEM', 'Vådrumsmembran (m²)', 95, 'm', 'wetroom', true),
('sealing_sleeve_drain', 'WR-SSD', 'Tætningsmanchet afløb', 45, 'stk', 'wetroom', true),
('sealing_sleeve_pipes', 'WR-SSP', 'Tætningsmanchet rør', 35, 'stk', 'wetroom', true),

-- PEX & Isolering (4 komponenter)
('pex_fitting_t', 'PEX-T', 'PEX T-stykke 16mm', 22, 'stk', 'pipes', true),
('pex_fitting_elbow', 'PEX-ELB', 'PEX bøjning 16mm', 19, 'stk', 'pipes', true),
('pipe_insulation_13mm', 'INS-13', 'Rørisolering 13mm', 9, 'm', 'insulation', false),
('pipe_insulation_19mm', 'INS-19', 'Rørisolering 19mm', 12, 'm', 'insulation', false),

-- Køkken (4 komponenter)
('kitchen_sink', 'K-SINK', 'Køkkenvask', 650, 'stk', 'kitchen', false),
('kitchen_faucet', 'K-FCT', 'Køkkenarmatur', 850, 'stk', 'kitchen', false),
('flex_hose_pair', 'K-FLEX', 'Flexslanger sæt', 90, 'sæt', 'kitchen', false),
('siphon_kitchen', 'K-SIP', 'Sifon køkken', 80, 'stk', 'kitchen', false),

-- Radiatorer (6 komponenter)
('radiator_panel_600x1000', 'RAD-P6010', 'Panelradiator 600x1000', 720, 'stk', 'radiator', true),
('radiator_brackets', 'RAD-BRKT', 'Radiatorkonsoller', 110, 'sæt', 'radiator', true),
('thermostatic_valve', 'RAD-VALVE', 'Termostatventil', 165, 'stk', 'radiator', true),
('thermostat_head', 'RAD-HEAD', 'Termostathoved', 140, 'stk', 'radiator', true),
('radiator_connection_50mm', 'RAD-50', 'Radiatortilslutning 50mm', 95, 'sæt', 'radiator', true),
('air_vent', 'RAD-AIR', 'Afluftningsventil', 45, 'stk', 'radiator', false),

-- Fjernvarme (5 komponenter)
('dh_circulation_pump', 'DH-PUMP', 'Cirkulationspumpe', 1850, 'stk', 'district_heating', true),
('dh_expansion_vessel', 'DH-EXP', 'Ekspansionsbeholder', 950, 'stk', 'district_heating', true),
('dh_energy_meter', 'DH-METER', 'Energimåler', 1250, 'stk', 'district_heating', false),
('manometer', 'MANO', 'Manometer', 140, 'stk', 'instrument', false),
('thermometer', 'THERMO', 'Termometer', 95, 'stk', 'instrument', false),

-- Gulvvarme (2 komponenter)
('fh_edge_insulation', 'FH-EDGE', 'Kantisolering', 9, 'm', 'floor_heating', false),
('fh_tape', 'FH-TAPE', 'Gulvvarmetape', 35, 'rulle', 'floor_heating', false),

-- Finish (1 komponent)
('mirror_cabinet_60cm', 'MIR-60', 'Spejlskab 60cm', 590, 'stk', 'bathroom', false)

ON CONFLICT (key) DO NOTHING;

-- Opdater material_floors for bathroom_renovation
INSERT INTO material_floors (project_type, base_floor, per_unit_floor)
VALUES ('bathroom_renovation', 10000, 700)
ON CONFLICT (project_type) 
DO UPDATE SET base_floor = EXCLUDED.base_floor, per_unit_floor = EXCLUDED.per_unit_floor;