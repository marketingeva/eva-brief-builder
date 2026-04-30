## Doel

1. In Ads Manager labels "Meta leads" → "Leads" en "Per Meta lead" → "Kost per lead".
2. Per rij (campaign / adset / ad) een **toggle** (Switch) waarmee je live de status in Meta aanpast (PAUSED ↔ ACTIVE). De toggle reflecteert ook de actuele status uit Meta.

## Wijzigingen

### 1. Labels (`src/pages/AdsManagerPage.tsx`)
- Summary card: "Meta leads" → "Leads", "Per Meta lead" → "Kost per lead".
- Tabel headers idem: "Meta leads" → "Leads", "Per Meta lead" → "Kost per lead".
- Datavelden (`meta_leads`, `cost_per_meta_lead`) blijven intact — alleen UI-labels veranderen, zodat we de Meta-instant-form leads (zoals nu) blijven tonen.

### 2. Nieuwe edge function: `toggle-meta-status`
Pad: `supabase/functions/toggle-meta-status/index.ts`

- Input: `{ id: string, level: "campaign" | "adset" | "ad", status: "ACTIVE" | "PAUSED" }`.
- Doet `POST {META_BASE}/{id}` met body `status=ACTIVE|PAUSED` en `access_token`.
- Returnt `{ success: true, id, status }` of error van Meta.
- CORS headers + `verify_jwt = false` (zoals andere meta functies).

### 3. UI toggle in `AdsManagerPage.tsx`
- Importeer `Switch` uit `@/components/ui/switch`.
- Voeg een nieuwe eerste/laatste kolom "Status" toe in elk van de 3 niveaus (campaigns/adsets/ads).
- Switch is `checked = row.status === "ACTIVE"`. `onCheckedChange` →
  - Optimistic update lokale state (status flip).
  - `supabase.functions.invoke('toggle-meta-status', { body: { id, level, status: newStatus }})`.
  - Bij fout: revert + `toast.error`. Bij succes: `toast.success("Campagne gepauzeerd/geactiveerd")`.
- Per rij een loading state (`togglingId`) die de switch disabled tijdens de call.
- `onClick` op de switch krijgt `e.stopPropagation()` zodat de drill-down niet triggert.

### 4. Edge functie spec (`supabase/config.toml`)
Geen extra config nodig (default `verify_jwt = true` is prima — we authoriseren al via supabase client invoke).

## Technische notities

- Meta API: `POST /{object_id}` met `status=PAUSED|ACTIVE` werkt voor campaigns, adsets én ads (dezelfde endpoint-shape).
- We tonen alleen rows die nu `ACTIVE` filter hebben in de fetch — als gebruiker pauzeert verdwijnt rij bij volgende refresh. Dat is verwacht. Geen filterwijziging in deze stap.
- Geen DB-migraties.

## Bestanden

- `src/pages/AdsManagerPage.tsx` — labels + Status-kolom met Switch + invoke logic.
- `supabase/functions/toggle-meta-status/index.ts` — nieuw, doet POST naar Meta Graph API.
