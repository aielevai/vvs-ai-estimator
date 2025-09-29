import { useState, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useAutoProductImport = () => {
  const [isImporting, setIsImporting] = useState(false);
  const [importCompleted, setImportCompleted] = useState(false);

  useEffect(() => {
    const checkAndImportProducts = async () => {
      try {
        // Check if products already exist
        const { count, error: countError } = await supabase
          .from('enhanced_supplier_prices')
          .select('*', { count: 'exact', head: true });

        if (countError) {
          console.error('Error checking product count:', countError);
          return;
        }

        // If products exist, no need to import
        if (count && count > 0) {
          setImportCompleted(true);
          return;
        }

        // Products don't exist, start import
        setIsImporting(true);
        toast.info('Importerer 65k produkter i baggrunden - vent venligst...');

        const { data, error } = await supabase.functions.invoke('import-csv-data', {
          body: {}
        });

        if (error) {
          throw error;
        }

        setImportCompleted(true);
        toast.success(`Produkter importeret: ${data.imported} produkter`);
        
      } catch (error) {
        console.error('Auto import error:', error);
        toast.error('Kunne ikke importere produkter automatisk');
      } finally {
        setIsImporting(false);
      }
    };

    checkAndImportProducts();
  }, []);

  return { isImporting, importCompleted };
};