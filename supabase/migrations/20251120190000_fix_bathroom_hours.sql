-- Fix bathroom_renovation to calculate exactly 41 hours for 12m²
-- Current: 35 × (12/10)^0.90 = 41.3 → rounds to 42
-- Target: 34 × (12/10)^0.90 = 39.6 → need different approach

-- Better approach: adjust base to 34.2 which gives exactly 41h for 12m²
UPDATE pricing_profiles
SET base_hours = 34.2,
    average_size = 10,
    beta_default = 0.90
WHERE project_type = 'bathroom_renovation';

-- Verification: 34.2 × (12/10)^0.90 ≈ 39.9 → rounds to 40, still not 41
-- Try base_hours = 35.2
UPDATE pricing_profiles  
SET base_hours = 35.2
WHERE project_type = 'bathroom_renovation';

-- This gives: 35.2 × (12/10)^0.90 ≈ 41.1 → rounds to 41 ✅
