import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { fetchAndParseCSV, chunkArray } from '@/utils/csvParser';
import { Loader2, Upload, CheckCircle, AlertCircle } from 'lucide-react';

export const MaterialImporter = () => {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { toast } = useToast();

  const handleImport = async () => {
    setImporting(true);
    setProgress(0);
    setStatus('idle');

    try {
      // Parse CSV file
      toast({
        title: "Indlæser produktdata",
        description: "Parser CSV-fil..."
      });

      const products = await fetchAndParseCSV();
      
      if (products.length === 0) {
        throw new Error('Ingen produkter fundet i CSV-filen');
      }

      setTotal(products.length);
      toast({
        title: "CSV parset",
        description: `Fandt ${products.length} produkter. Starter import...`
      });

      // Split into chunks of 100 products
      const chunks = chunkArray(products, 100);
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        const { error } = await supabase.functions.invoke('import-csv-data', {
          body: {
            products: chunk,
            chunkIndex: i,
            totalChunks: chunks.length
          }
        });

        if (error) {
          throw error;
        }

        setProgress((i + 1) * 100);
        
        toast({
          title: `Import fremskridt`,
          description: `${i + 1}/${chunks.length} chunks importeret`
        });
      }

      setStatus('success');
      toast({
        title: "Import fuldført!",
        description: `${products.length} produkter importeret til databasen.`
      });
    } catch (error: any) {
      console.error('Import error:', error);
      setStatus('error');
      toast({
        title: "Import fejlede",
        description: error.message || 'Der skete en fejl under import',
        variant: 'destructive'
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Importer Produktdata
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Importer produktdata fra ahlsell-prices.csv til databasen. Dette gør det muligt at søge efter materialer og få præcise priser i tilbud.
        </p>

        {importing && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Importerer {progress} af {total} produkter...</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${total > 0 ? (progress / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span>Import gennemført succesfuldt!</span>
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span>Import fejlede - se console for detaljer</span>
          </div>
        )}

        <Button 
          onClick={handleImport} 
          disabled={importing}
          className="w-full"
        >
          {importing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Importerer...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Start Import
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
