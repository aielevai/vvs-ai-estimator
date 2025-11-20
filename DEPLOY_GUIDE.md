# 🚀 Deployment Guide - Copy/Paste i Supabase Dashboard

## Trin 1: Gå til Supabase Dashboard
https://supabase.com/dashboard/project/xrvmjrrcdfvrhfzknlku/functions/enhanced-data-import

## Trin 2: Klik "Edit" eller find code-editoren

## Trin 3: SLET ALT den gamle kode

## Trin 4: Kopiér koden fra `supabase/functions/enhanced-data-import/index.ts`
(Filen er åben i Cursor - bare Cmd+A, Cmd+C)

## Trin 5: Indsæt i Supabase editor (Cmd+V)

## Trin 6: Klik "Deploy" eller "Save & Deploy"

---

## ✅ Hvad er rettet:
1. Fjernet duplikat `inferCategory` funktion
2. Rettet timeløn fra 750 kr til **660 kr** (595 montør + 65 servicevogn)
3. Rettet `importEnhancedProducts` til at returnere objekt i stedet for Response

---

## 🧪 Test efter deployment:
1. Gå til Functions → enhanced-data-import
2. Klik "Test" 
3. Request body: `{}`
4. Role: service role
5. Klik "Send Request"

Du skulle nu se:
- Success response
- Produkter importeret
- Discount codes importeret
- Korrekte priser (660 kr/time)
