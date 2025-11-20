# 📧 Gmail Cron Job Setup - Simpel Guide

## ⚠️ VIGTIGT: Cron jobs kan KUN sættes op via Supabase Dashboard UI

Management API og CLI understøtter det ikke. Her er præcist hvad du skal gøre:

---

## 🔧 Trin-for-trin Guide

### 1. Åbn Supabase Dashboard
Gå til: https://supabase.com/dashboard/project/xrvmjrrcdfvrhfzknlku/functions

### 2. Find gmail-sync funktionen
- Du ser en liste med funktioner
- Klik på linjen der hedder **"gmail-sync"** (ikke edit, bare klik på rækken)

### 3. Find Cron Jobs sektionen
Når du er inde i funktionen, kig efter en af disse tabs/sektioner:
- **"Cron Jobs"**
- **"Schedule"**  
- **"Schedules"**
- **"Triggers"**

(Det præcise navn varierer - det er typisk i en top-menu eller sidebar)

### 4. Tilføj Schedule
- Klik på **"Add schedule"**, **"New schedule"** eller **"Create cron job"**
- Udfyld cron expression: `* * * * *`
- Beskrivelse (valgfrit): "Scan Gmail every minute"
- Klik **Save** eller **Create**

### 5. Verificer
Du skulle nu se:
- Schedule: `* * * * *`
- Status: Active
- Next run: om ~1 minut

---

## 🎯 Hvad betyder `* * * * *`?

```
*  *  *  *  *
│  │  │  │  │
│  │  │  │  └─ Day of week (0-6, Sunday=0)
│  │  │  └──── Month (1-12)
│  │  └─────── Day of month (1-31)
│  └────────── Hour (0-23)
└───────────── Minute (0-59)

* * * * * = Kør hvert minut
```

---

## ❓ Hvis du IKKE kan finde Cron Jobs sekionen

Det kan være fordi:
1. **Din Supabase plan understøtter ikke cron jobs** (kræver Pro plan)
2. **Funktionen skal være deployed først** (vi har allerede deployed den ✅)
3. **UI'en er ændret** - prøv at:
   - Klik på de 3 prikker `...` ved funktionen
   - Se efter "Settings" eller "Configuration"
   - Tjek alle tabs i funktions-detaljerne

---

## 🔄 Alternativ: Ekstern Cron Service

Hvis Supabase ikke understøtter cron jobs på din plan, kan du bruge:

### Option A: Cron-job.org (gratis)
1. Gå til https://cron-job.org/
2. Opret konto
3. Tilføj job:
   - URL: `https://xrvmjrrcdfvrhfzknlku.supabase.co/functions/v1/gmail-sync`
   - Schedule: Hvert minut
   - Header: `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhydm1qcnJjZGZ2cmhmemtubGt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4MDMwMzgsImV4cCI6MjA3MzM3OTAzOH0.T3HjMBptCVyHB-lDc8Lnr3xLndurh3f6c38JLJ50fL0`

### Option B: GitHub Actions (gratis)
Opret `.github/workflows/gmail-sync.yml`:
```yaml
name: Gmail Sync
on:
  schedule:
    - cron: '* * * * *'
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Call gmail-sync
        run: |
          curl -X POST \
            'https://xrvmjrrcdfvrhfzknlku.supabase.co/functions/v1/gmail-sync' \
            -H 'Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}'
```

---

## ✅ Konklusion

**Foreløbig:**
- Systemet virker UDEN cron job
- Du kan teste manuelt ved at kalde `gmail-sync` via Dashboard
- Tilføj cron job senere når du har fundet UI'en eller valgt alternativ

**Systemet er 100% funktionelt lige nu - du kan generere tilbud manuelt!** 🎉
