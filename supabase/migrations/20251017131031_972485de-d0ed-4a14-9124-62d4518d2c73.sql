-- Fase 1: Tilføj customer_supplied kolonne til quote_lines
ALTER TABLE quote_lines 
ADD COLUMN IF NOT EXISTS customer_supplied boolean DEFAULT false;

-- Fase 4: Juster materiale-gulv for bathroom_renovation
UPDATE material_floors 
SET base_floor = 10000,
    per_unit_floor = 700
WHERE project_type = 'bathroom_renovation';