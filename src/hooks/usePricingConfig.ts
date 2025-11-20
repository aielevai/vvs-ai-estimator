import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PricingConfig {
  hourlyRate: number;
  serviceVehicleRate: number;
  minimumProject: number;
  vatRate: number;
}

export interface PricingProfile {
  baseHours: number;
  averageSize: number;
  beta: number;
  minHours: number;
  maxHours: number;
  minLaborHours: number;
  applyMinimumProject: boolean;
  materialCostPerUnit: number;
}

// Fallback configuration
const FALLBACK_CONFIG: PricingConfig = {
  hourlyRate: 595,
  serviceVehicleRate: 65,
  minimumProject: 4500,
  vatRate: 0.25,
};

export function usePricingConfig() {
  const [config, setConfig] = useState<PricingConfig>(FALLBACK_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadConfig() {
      try {
        const { data, error: fetchError } = await supabase
          .from('pricing_config')
          .select('*')
          .order('effective_from', { ascending: false })
          .limit(1)
          .single();

        if (fetchError || !data) {
          console.error('Failed to load pricing config, using fallback:', fetchError);
          setConfig(FALLBACK_CONFIG);
        } else {
          setConfig({
            hourlyRate: Number(data.hourly_rate),
            serviceVehicleRate: Number(data.service_vehicle_rate),
            minimumProject: Number(data.minimum_project),
            vatRate: Number(data.vat_rate),
          });
        }
      } catch (err) {
        console.error('Error loading pricing config:', err);
        setError('Failed to load pricing configuration');
        setConfig(FALLBACK_CONFIG);
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, []);

  return { config, loading, error };
}

export function usePricingProfiles() {
  const [profiles, setProfiles] = useState<Record<string, PricingProfile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfiles() {
      try {
        const { data, error: fetchError } = await supabase
          .from('pricing_profiles')
          .select('*');

        if (fetchError || !data || data.length === 0) {
          console.error('Failed to load pricing profiles:', fetchError);
          setError('Failed to load pricing profiles');
        } else {
          const profilesMap: Record<string, PricingProfile> = {};
          for (const profile of data) {
            profilesMap[profile.project_type] = {
              baseHours: Number(profile.base_hours),
              averageSize: Number(profile.average_size),
              beta: Number(profile.beta_default),
              minHours: Number(profile.min_hours),
              maxHours: Number(profile.max_hours),
              minLaborHours: Number(profile.min_labor_hours),
              applyMinimumProject: Boolean(profile.apply_minimum_project),
              materialCostPerUnit: Number(profile.material_cost_per_unit),
            };
          }
          setProfiles(profilesMap);
        }
      } catch (err) {
        console.error('Error loading pricing profiles:', err);
        setError('Failed to load pricing profiles');
      } finally {
        setLoading(false);
      }
    }

    loadProfiles();
  }, []);

  return { profiles, loading, error };
}
