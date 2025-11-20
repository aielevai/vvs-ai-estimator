-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to upload to product-data bucket
CREATE POLICY "Allow authenticated uploads to product-data"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-data');

-- Allow authenticated users to update files in product-data bucket
CREATE POLICY "Allow authenticated updates to product-data"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-data')
WITH CHECK (bucket_id = 'product-data');

-- Allow service_role to read from product-data
CREATE POLICY "Allow service_role to read product-data"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'product-data');

-- Allow public read access for product-data
CREATE POLICY "Public read access to product-data"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-data');

-- Allow authenticated users to delete their own uploads
CREATE POLICY "Allow authenticated deletes in product-data"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-data');
