import { useState, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fetchAndParseCSV, chunkArray } from "@/utils/csvParser";

export interface ImportProgress {
  current: number;
  total: number;
}

export const useAutoProductImport = () => {
  const [isImporting, setIsImporting] = useState(false);
  const [importCompleted, setImportCompleted] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress>({ current: 0, total: 0 });

  const retryWithBackoff = async (chunk: any, chunkIndex: number, totalChunks: number, attempt = 1): Promise<any> => {
    try {
      const { data, error } = await supabase.functions.invoke('import-csv-data', {
        body: {
          products: chunk,
          chunkIndex,
          totalChunks
        }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      if (attempt < 3) {
        console.log(`Retry attempt ${attempt} for chunk ${chunkIndex}...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        return retryWithBackoff(chunk, chunkIndex, totalChunks, attempt + 1);
      }
      throw error;
    }
  };

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
          console.log(`Database already has ${count} products, skipping import`);
          setImportCompleted(true);
          return;
        }

        // Products don't exist, start import
        console.log('No products found, starting import...');
        setIsImporting(true);
        toast.info('Importerer produkter fra CSV - vent venligst...');

        // Fetch and parse CSV from public folder
        const products = await fetchAndParseCSV();
        
        // Split into chunks of 500
        const chunks = chunkArray(products, 500);
        setImportProgress({ current: 0, total: chunks.length });

        console.log(`Starting import of ${products.length} products in ${chunks.length} chunks`);

        let successfulChunks = 0;
        let failedChunks = 0;

        // Process each chunk
        for (let i = 0; i < chunks.length; i++) {
          try {
            setImportProgress({ current: i + 1, total: chunks.length });
            
            const data = await retryWithBackoff(chunks[i], i + 1, chunks.length);
            
            if (data?.success) {
              successfulChunks++;
              console.log(`Chunk ${i + 1}/${chunks.length} imported successfully`);
            }
          } catch (chunkError) {
            console.error(`Failed to import chunk ${i + 1}:`, chunkError);
            failedChunks++;
          }
        }

        setImportCompleted(true);
        
        if (failedChunks === 0) {
          toast.success(`Alle ${products.length} produkter importeret!`);
        } else {
          toast.warning(`Import færdig: ${successfulChunks} chunks OK, ${failedChunks} fejl`);
        }
        
      } catch (error) {
        console.error('Auto import error:', error);
        toast.error('Kunne ikke importere produkter: ' + (error as Error).message);
      } finally {
        setIsImporting(false);
      }
    };

    checkAndImportProducts();
  }, []);

  return { isImporting, importCompleted, importProgress };
};