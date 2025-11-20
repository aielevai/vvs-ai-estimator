import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const HistoricalDataManager = () => {
  const [isCreating, setIsCreating] = useState(false);

  const createSampleHistoricalData = async () => {
    setIsCreating(true);
    
    try {
      // Sample historical projects
      const sampleProjects = [
        {
          project_type: 'bathroom_renovation',
          project_description: 'Komplet badeværelse renovation 8m²',
          total_hours: 32,
          total_materials_cost: 15000,
          total_project_cost: 32500,
          complexity_signals: { complexity: 'medium', size_factor: 1.2 }
        },
        {
          project_type: 'floor_heating',
          project_description: 'Gulvvarme installation stue og køkken 45m²',
          total_hours: 24,
          total_materials_cost: 12000,
          total_project_cost: 25200,
          complexity_signals: { complexity: 'simple', size_factor: 1.0 }
        },
        {
          project_type: 'radiator_installation', 
          project_description: 'Installation af 6 radiatorer i villa',
          total_hours: 16,
          total_materials_cost: 8500,
          total_project_cost: 17300,
          complexity_signals: { complexity: 'simple', size_factor: 0.8 }
        },
        {
          project_type: 'bathroom_renovation',
          project_description: 'Luksus badeværelse renovation 12m² med underfloor heating',
          total_hours: 48,
          total_materials_cost: 28000,
          total_project_cost: 54400,
          complexity_signals: { complexity: 'complex', size_factor: 1.5 }
        },
        {
          project_type: 'kitchen_plumbing',
          project_description: 'Køkken VVS til nyt køkken med øhåndvask',
          total_hours: 12,
          total_materials_cost: 4500,
          total_project_cost: 11100,
          complexity_signals: { complexity: 'medium', size_factor: 1.1 }
        }
      ];

      // Insert historical projects
      const { data: projects, error: projectError } = await supabase
        .from('historical_projects')
        .insert(sampleProjects)
        .select();

      if (projectError) throw projectError;

      // Sample material lines for each project
      const sampleMaterialLines = [];
      
      projects?.forEach(project => {
        if (project.project_type === 'bathroom_renovation') {
          sampleMaterialLines.push(
            {
              project_id: project.id,
              product_code: 'TOILET_001',
              description: 'Gulvstående toilet med cisterne',
              quantity: 1,
              unit_price: 1200,
              unit: 'STK',
              line_total: 1200,
              normalized_description: 'toilet gulvstående cisterne'
            },
            {
              project_id: project.id,
              product_code: 'SINK_001',
              description: 'Håndvask 60cm porcelæn',
              quantity: 1,
              unit_price: 650,
              unit: 'STK', 
              line_total: 650,
              normalized_description: 'håndvask porcelæn'
            }
          );
        } else if (project.project_type === 'floor_heating') {
          sampleMaterialLines.push(
            {
              project_id: project.id,
              product_code: 'PEX_16MM',
              description: 'PEX rør 16mm gulvvarme',
              quantity: 350,
              unit_price: 12,
              unit: 'MTR',
              line_total: 4200,
              normalized_description: 'pex rør gulvvarme'
            }
          );
        }
      });

      if (sampleMaterialLines.length > 0) {
        const { error: materialError } = await supabase
          .from('historical_material_lines')
          .insert(sampleMaterialLines);
          
        if (materialError) throw materialError;
      }

      toast.success(`Created ${projects?.length} historical projects with ${sampleMaterialLines.length} material lines`);
      
    } catch (error) {
      console.error('Error creating sample data:', error);
      toast.error('Failed to create historical data: ' + (error as any).message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Historical Data Manager</CardTitle>
        <CardDescription>
          Create sample historical project data to improve AI calibration and material estimates
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button 
          onClick={createSampleHistoricalData}
          disabled={isCreating}
          className="w-full"
        >
          {isCreating ? 'Creating Historical Data...' : 'Create Sample Historical Data'}
        </Button>
      </CardContent>
    </Card>
  );
};