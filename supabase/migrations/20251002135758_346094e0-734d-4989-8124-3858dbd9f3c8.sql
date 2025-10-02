-- Fix encoding issues in enhanced_supplier_prices table
-- Replace common garbled Danish characters with correct ones

UPDATE enhanced_supplier_prices
SET 
  short_description = 
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
      REPLACE(REPLACE(REPLACE(
        short_description,
        '�', 'ø'),
        'Ã¦', 'æ'),
        'Ã¸', 'ø'),
        'Ã…', 'Å'),
        'Ã¥', 'å'),
        'Ã†', 'Æ'),
        'Â²', '²'),
        'Â°', '°'),
  long_description = 
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
      REPLACE(REPLACE(REPLACE(
        long_description,
        '�', 'ø'),
        'Ã¦', 'æ'),
        'Ã¸', 'ø'),
        'Ã…', 'Å'),
        'Ã¥', 'å'),
        'Ã†', 'Æ'),
        'Â²', '²'),
        'Â°', '°')
WHERE 
  short_description LIKE '%�%' 
  OR short_description LIKE '%Ã%'
  OR short_description LIKE '%Â%'
  OR long_description LIKE '%�%'
  OR long_description LIKE '%Ã%'
  OR long_description LIKE '%Â%';

-- Rebuild normalized_text with correct encoding
UPDATE enhanced_supplier_prices
SET normalized_text = LOWER(
  COALESCE(short_description, '') || ' ' ||
  COALESCE(long_description, '') || ' ' ||
  COALESCE(vvs_number, '') || ' ' ||
  COALESCE(supplier_item_id, '')
)
WHERE normalized_text IS NOT NULL;