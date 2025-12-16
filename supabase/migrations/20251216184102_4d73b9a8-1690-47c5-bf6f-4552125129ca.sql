-- Add validated column to quote_lines table
ALTER TABLE public.quote_lines 
ADD COLUMN IF NOT EXISTS validated boolean DEFAULT false;

-- Update existing rows: set validated=true where source='ai_matched' or material_code is not null
UPDATE public.quote_lines 
SET validated = true 
WHERE source = 'ai_matched' OR (material_code IS NOT NULL AND unit_price > 0);