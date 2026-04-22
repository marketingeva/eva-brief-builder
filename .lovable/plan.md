

# Ad Launcher Tab — Upload Creatives Direct naar Meta

## Wat krijg je

Een nieuwe **"Ad Launcher"** tab per klant, vergelijkbaar met de Rapid Ads UI uit de screenshots. Hiermee upload je creatives (JPG/PNG/MP4) en lanceer je ze rechtstreeks als Meta-advertenties. Per klant worden automatisch alleen de juiste campagnes, ad sets en lead-formulieren ingeladen.

## Layout (3 kolommen)

```text
┌──────────────────┬────────────────────────────┬───────────────────────────┐
│ Selectie         │ Upload Creatives           │ Preview / Launch          │
│ ──────────────── │ ────────────────────────── │ ───────────────────────── │
│ Campagne ▼       │ Drop zone (drag & drop)    │ Lijst van creatives       │
│ Ad Set ▼         │ "Click to upload"          │ ─ thumbnail + bestandsnaam│
│ Lead formulier ▼ │ JPG / PNG / MP4            │ ─ status (Ready/Uploading)│
│ Website URL      │                            │ ─ edit teksten knop       │
│                  │                            │                           │
│                  │                            │ [▶ Launch Ads] knop       │
└──────────────────┴────────────────────────────┴───────────────────────────┘
```

## Per-klant filtering

- Elke klant krijgt een veld `meta_client_filter` (bv. "MF", "Rivas", "WIJdezorg") in de `clients` tabel
- Dropdowns tonen alleen Meta-resources waarvan de naam dit filter bevat:
  - **Campagnes** — actief én naam bevat client filter
  - **Ad sets** — onder gekozen campagne
  - **Lead formulieren** — opgehaald van de Page van de klant, gefilterd op naam (bv. "MF | …")

## Per-creative copy editor

Klik op een creative → side panel opent met:
- **Primary text** (max 5 variaties)
- **Headline** (max 5 variaties)
- **Description** (max 5 variaties)
- **Call to Action** dropdown (Apply Now, Learn More, Sign Up, etc.)
- Knoppen: Copy From (andere creative), Copy to All, Import, ✨ Generate (via Lovable AI)

## Launch flow

Bij klik op **"Launch Ads"**:
1. Voor elke creative: upload naar Meta via `/act_{id}/adimages` (image) of `/act_{id}/advideos` (video)
2. Maak een ad creative aan (`/act_{id}/adcreatives`) met:
   - Page ID + (indien multi-text) `asset_feed_spec` voor Dynamic Creative
   - Lead form CTA (`{type: "SIGN_UP", value: {lead_gen_form_id}}`)
   - Link URL (default `http://fb.me/`)
3. Maak ad aan onder de gekozen ad set (`/act_{id}/ads`) met status `PAUSED` (veiliger; user kan in Meta activeren) — of `ACTIVE` via toggle in settings
4. Toon resultaat per creative (success / error met Meta error message)

## Wijzigingen

### Nieuwe edge functions

| Function | Doel |
|----------|------|
| `meta-list-resources` | Haalt campagnes / ad sets / lead forms op (gefilterd op client filter) |
| `meta-upload-creative` | Upload image/video naar Meta + maakt creative + ad |

Beide gebruiken bestaande secrets `META_ACCESS_TOKEN` en `AD_ACCOUNT_ID`. Extra secret nodig: **`META_PAGE_ID`** (voor lead form fetch + ad creative).

### Database

- Migratie: kolom `clients.meta_name_filter` (text) — vrij tekstveld om Meta-resources te filteren
- Storage bucket `ad-launcher-uploads` voor tijdelijke creative opslag (vóór Meta upload)
- Optionele tabel `ad_launches` (id, client_id, ad_id, creative_filename, status, error, launched_at) voor history

### Frontend

| Bestand | Actie |
|---------|-------|
| `src/pages/ClientWorkspace.tsx` | Tab toevoegen: "Ad Launcher" (icon: Rocket) |
| `src/pages/client-workspace/AdLauncherTab.tsx` | Nieuw — 3-koloms layout |
| `src/components/ad-launcher/CreativeUploadZone.tsx` | Drag & drop component |
| `src/components/ad-launcher/CreativeRow.tsx` | Creative + edit knoppen |
| `src/components/ad-launcher/CreativeTextsPanel.tsx` | Side panel met copy editor |
| `src/components/ad-launcher/MetaSelectors.tsx` | Campagne/AdSet/LeadForm dropdowns |
| `src/components/AddClientDialog.tsx` | Veld toevoegen voor `meta_name_filter` |

## Technische details

- File upload: client → Supabase Storage → edge function leest binary → POST naar Meta `/adimages` (multipart)
- Video upload: chunked upload via Meta `/advideos` (start/transfer/finish)
- Dynamic Creative: als 1+ variatie van text/headline/description, gebruik `asset_feed_spec` met `optimization_type: "PLACEMENT"`
- Default ad status: `PAUSED` (config in Settings dialog rechtsboven)
- Lead forms endpoint: `GET /{page_id}/leadgen_forms?fields=id,name,status` met paginatie
- Filtering: case-insensitive `name.toLowerCase().includes(filter.toLowerCase())`
- AI Generate copy: gebruikt bestaande `analyze-creative` patroon met `google/gemini-2.5-flash`

## Vragen aan jou

Voor ik bouw, twee dingen die ik moet weten:

1. **Page ID**: Meta lead forms hangen aan een Facebook Page. Welke Page ID hoort bij elke klant? Opties:
   - **A)** Eén centrale `META_PAGE_ID` secret (alle klanten zelfde page) 
   - **B)** Per klant een `meta_page_id` kolom in `clients` tabel
   
2. **Default ad status na launch**: 
   - **A)** `PAUSED` (veilig — user activeert handmatig in Meta) 
   - **B)** `ACTIVE` (direct live)

Beantwoord deze twee dan start ik de implementatie.

