import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function DataUploader() {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [discountFile, setDiscountFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    csv?: 'success' | 'error' | null;
    discount?: 'success' | 'error' | null;
  }>({});
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, type: 'csv' | 'discount') => {
    const file = event.target.files?.[0];
    if (file) {
      if (type === 'csv') {
        setCsvFile(file);
      } else {
        setDiscountFile(file);
      }
    }
  };

  const uploadFile = async (file: File, filename: string) => {
    const { error } = await supabase.storage
      .from('product-data')
      .upload(filename, file, {
        upsert: true,
        contentType: file.type || 'text/plain'
      });
    
    if (error) {
      throw error;
    }
  };

  const handleUpload = async () => {
    setUploading(true);
    setUploadStatus({});

    try {
      // Upload CSV if selected
      if (csvFile) {
        try {
          await uploadFile(csvFile, 'ahlsell-latest.csv');
          setUploadStatus(prev => ({ ...prev, csv: 'success' }));
        } catch (error) {
          console.error('CSV upload error:', error);
          setUploadStatus(prev => ({ ...prev, csv: 'error' }));
          toast({
            title: "CSV Upload Failed",
            description: error instanceof Error ? error.message : "Unknown error",
            variant: "destructive"
          });
        }
      }

      // Upload discount file if selected
      if (discountFile) {
        try {
          await uploadFile(discountFile, 'discount.txt');
          setUploadStatus(prev => ({ ...prev, discount: 'success' }));
        } catch (error) {
          console.error('Discount upload error:', error);
          setUploadStatus(prev => ({ ...prev, discount: 'error' }));
          toast({
            title: "Discount File Upload Failed",
            description: error instanceof Error ? error.message : "Unknown error",
            variant: "destructive"
          });
        }
      }

      // If at least one file was uploaded successfully, trigger the import
      if (uploadStatus.csv === 'success' || uploadStatus.discount === 'success') {
        toast({
          title: "Files Uploaded",
          description: "Files have been uploaded to storage. You can now trigger the data import from the edge function.",
        });
      }

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: "An error occurred during upload. Please check the console for details.",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const triggerImport = async () => {
    setUploading(true);
    try {
      const response = await supabase.functions.invoke('enhanced-data-import', {
        method: 'POST'
      });

      if (response.error) {
        throw response.error;
      }

      toast({
        title: "Import Triggered",
        description: `Successfully imported ${response.data?.products?.processed || 0} products and ${response.data?.discounts?.processed || 0} discount codes.`,
      });
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: "Import Failed", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Upload & Import</CardTitle>
        <CardDescription>
          Upload product catalog CSV and discount codes to Supabase Storage
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="csv-upload">Product Catalog (CSV)</Label>
            <div className="mt-2 flex items-center gap-4">
              <Input
                id="csv-upload"
                type="file"
                accept=".csv"
                onChange={(e) => handleFileChange(e, 'csv')}
                disabled={uploading}
              />
              {uploadStatus.csv === 'success' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
              {uploadStatus.csv === 'error' && <XCircle className="h-5 w-5 text-red-500" />}
            </div>
            {csvFile && (
              <p className="mt-1 text-sm text-muted-foreground">
                Selected: {csvFile.name}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="discount-upload">Discount Codes (TXT)</Label>
            <div className="mt-2 flex items-center gap-4">
              <Input
                id="discount-upload"
                type="file"
                accept=".txt"
                onChange={(e) => handleFileChange(e, 'discount')}
                disabled={uploading}
              />
              {uploadStatus.discount === 'success' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
              {uploadStatus.discount === 'error' && <XCircle className="h-5 w-5 text-red-500" />}
            </div>
            {discountFile && (
              <p className="mt-1 text-sm text-muted-foreground">
                Selected: {discountFile.name}
              </p>
            )}
          </div>
        </div>

        <Alert>
          <AlertDescription>
            Files will be uploaded to the 'product-data' bucket in Supabase Storage. 
            The edge function will read from there during import.
          </AlertDescription>
        </Alert>

        <div className="flex gap-4">
          <Button
            onClick={handleUpload}
            disabled={uploading || (!csvFile && !discountFile)}
            className="flex items-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload Files
              </>
            )}
          </Button>

          <Button
            onClick={triggerImport}
            variant="secondary"
            disabled={uploading}
          >
            Trigger Import
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
