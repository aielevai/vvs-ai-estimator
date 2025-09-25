import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const DataImporter = () => {
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string>('');

  const handleImportCSV = async () => {
    setIsImporting(true);
    setImportStatus('Starting import of 65k products...');
    
    try {
      toast.info('Starting CSV import - this may take a few minutes...');
      
      const { data, error } = await supabase.functions.invoke('import-csv-data', {
        body: {}
      });

      if (error) {
        throw error;
      }

      setImportStatus(`Import completed! ${data.imported} products imported, ${data.errors} errors`);
      toast.success(`Successfully imported ${data.imported} products!`);
      
    } catch (error) {
      console.error('Import error:', error);
      setImportStatus(`Import failed: ${error.message}`);
      toast.error('Import failed: ' + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>System Data Import</CardTitle>
        <CardDescription>
          Import the 65k Ahlsell products to enable AI material selection
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={handleImportCSV}
          disabled={isImporting}
          className="w-full"
        >
          {isImporting ? 'Importing Products...' : 'Import 65k Products'}
        </Button>
        
        {importStatus && (
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm">{importStatus}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};