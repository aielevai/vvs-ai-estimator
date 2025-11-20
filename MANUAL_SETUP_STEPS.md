# Manual Setup Steps for VVS AI Estimator

## ✅ Completed Steps

1. **Discount.txt og CSV filer er uploadet til Supabase Storage**
   - discount.txt er konverteret til UTF-8 og uploadet til `product-data` bucket
   - ahlsell-prices.csv er uploadet til `product-data` bucket

2. **Service Role Key er gemt i .env.local**

## 📋 Remaining Manual Steps

### 1. Kør SQL Migrations i Supabase Dashboard

**✅ EASY WAY: Kør hele filen på én gang!**

1. Gå til **Supabase Dashboard > SQL Editor**
2. Åbn filen: `supabase/migrations/20251120180000_complete_setup.sql`
3. Kopier ALT indholdet fra filen
4. Indsæt det i SQL Editor
5. Klik **RUN** (eller tryk Cmd+Enter)

**⚠️ NOTE:** Storage policies kan IKKE sættes op via SQL (kræver superuser). 
Bucket og policies er allerede konfigureret automatisk når bucket oprettes.
Hvis du har brug for custom policies, gå til **Storage > Policies** i Dashboard.

**Eller kør sektion for sektion** (hvis du foretrækker det):

#### A. Create Data Import Tracking Table
```sql
-- Create table to track data import runs
CREATE TABLE IF NOT EXISTS data_import_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_type TEXT NOT NULL,
  file_checksum TEXT NOT NULL,
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  rows_imported INTEGER,
  status TEXT DEFAULT 'success',
  error_message TEXT,
  UNIQUE(file_type, file_checksum)
);

-- Enable RLS
ALTER TABLE data_import_runs ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage
CREATE POLICY "Service role can manage import runs" ON data_import_runs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
```

#### B. OpenAI Model Configuration
**Note:** OpenAI model er allerede sat til `gpt-5.1` i edge function koden (`analyze-email/index.ts`). 
Ingen database opdatering er nødvendig!

### 2. Deploy/Fix Edge Functions

Gå til **Supabase Dashboard > Edge Functions**:

1. Check om `enhanced-data-import` function eksisterer og er deployed
2. Hvis der er boot errors, check logs og re-deploy funktionen
3. Sørg for at funktionen har de nødvendige environment variables

### 3. Set Up Cron Jobs

I **Supabase Dashboard > Edge Functions**:

1. **For enhanced-data-import:**
   - Klik på funktionen
   - Gå til "Schedule" tab
   - Tilføj schedule: `0 */6 * * *` (hver 6. time)

2. **For gmail-sync:**
   - Klik på funktionen
   - Gå til "Schedule" tab
   - Tilføj schedule: `* * * * *` (hvert minut)

### 4. Trigger Data Import Manually

Efter SQL migrations er kørt, trigger data import:

1. Gå til **Edge Functions** i Supabase Dashboard
2. Find `enhanced-data-import` function
3. Klik "Run" eller brug denne URL i browseren:
   ```
   https://xrvmjrrcdfvrhfzknlku.supabase.co/functions/v1/enhanced-data-import
   ```
   Med Authorization header: `Bearer [YOUR_ANON_KEY]`

### 5. Verify Data Import

Check at data er importeret korrekt:

```sql
-- Check discount codes
SELECT COUNT(*) FROM discount_codes;

-- Check supplier prices
SELECT COUNT(*) FROM enhanced_supplier_prices;

-- Check import runs
SELECT * FROM data_import_runs ORDER BY imported_at DESC;
```

### 6. Start Development Server

```bash
npm run dev
```

## 🔧 Troubleshooting

- Hvis edge functions har boot errors, check logs i Supabase Dashboard
- Sørg for at alle environment variables er sat korrekt i edge functions
- Check at Storage bucket policies er korrekt konfigureret
- Verificer at service role key har de nødvendige permissions

## 📝 Notes

- discount.txt er nu i UTF-8 encoding med korrekte danske tegn
- CSV og TXT filer er uploadet til `product-data` bucket i Supabase Storage
- Edge functions skal læse fra Storage i stedet for lokale filer
