# 🚀 Cursor Quick Start Guide - Valentin VVS

## Status
Projektet er nu klar til udvikling! Her er hvad vi har fixet:

✅ **Fixed discount.txt URL fetching** - Edge function læser nu direkte fra Storage bucket  
✅ **Automatisk filvalg** - importer finder nu selv seneste `ahlsell*.csv` og `discount*.txt`  
✅ **Data import historik** - hver kørsel gemmes i `data_import_runs` til audit  
✅ **Oprettet .env fil** med Supabase credentials  
✅ **Installeret dependencies** - npm install kørt succesfuldt
✅ **Dev server kører** - http://localhost:8080

## Næste Skridt

### 1. Upload nye prisfiler (CSV + discount)
Brug den nye helper for at skyde filer direkte til Storage:

```bash
# Eksempel
SUPABASE_SERVICE_ROLE_KEY=... npm run upload-product-data \
  -- --csv ~/Downloads/ahlsell-2025-11-20.csv \
     --discount ~/Downloads/discount-utf8.txt \
     --alias-latest
```

- Uden flag gemmes filerne som `ahlsell-<timestamp>.csv` / `discount-<timestamp>.txt`
- `--alias-latest` opdaterer samtidig `ahlsell-latest.csv` og `discount.txt`
- Scriptet forventer `SUPABASE_URL`/`VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` i miljøet

**Option B: Via UI**
1. Gå til http://localhost:8080
2. Brug "Data Upload & Import" kortet (både CSV og TXT)
3. Klik "Trigger Import" hvis du vil køre import manuelt

**Option C: Via Supabase Dashboard**
1. https://supabase.com/dashboard/project/xrvmjrrcdfvrhfzknlku/storage/buckets/product-data
2. Upload filer manuelt (navngiv dem `ahlsell-<dato>.csv` og `discount-<dato>.txt`)

### 2. Kør Storage RLS Migration
```sql
-- Kør denne SQL i Supabase SQL Editor:
-- https://supabase.com/dashboard/project/xrvmjrrcdfvrhfzknlku/sql/new

-- Content fra: supabase/migrations/20251120_storage_rls_policies.sql
```

### 3. Kør data-import (kan automatiseres)
```bash
# Manuel test
curl -X POST https://xrvmjrrcdfvrhfzknlku.supabase.co/functions/v1/enhanced-data-import \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhydm1qcnJjZGZ2cmhmemtubGt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4MDMwMzgsImV4cCI6MjA3MzM3OTAzOH0.T3HjMBptCVyHB-lDc8Lnr3xLndurh3f6c38JLJ50fL0"
```

## Remaining Issues

### 🟡 Gmail Sync "No new emails"
- Check edge function logs: https://supabase.com/dashboard/project/xrvmjrrcdfvrhfzknlku/functions/gmail-sync/logs
- Muligvis udløbet refresh token
- Cron-job skal sættes til hvert minut (se README-notes / CLI)

### 🟢 Real-time Dashboard Updates
- Implementeret subscription i `UnifiedDashboard.tsx`
- Skulle virke automatisk når nye cases oprettes

### 🔵 Historical Data Mangler
- `historical_projects` tabel er tom
- Import historisk data når tilgængelig

## Dev Commands
```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Run linter
npm run lint
```

## Vigtige URLs
- **Local Dev**: http://localhost:8080
- **Supabase Dashboard**: https://supabase.com/dashboard/project/xrvmjrrcdfvrhfzknlku
- **Edge Functions**: https://supabase.com/dashboard/project/xrvmjrrcdfvrhfzknlku/functions
- **Database**: https://supabase.com/dashboard/project/xrvmjrrcdfvrhfzknlku/database/tables
