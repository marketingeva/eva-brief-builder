# Bundeling van creatives per formaat in Ad Launcher

Bij upload bundelt het systeem automatisch creatives met dezelfde basisnaam maar verschillende aspect-ratio suffixen (`_1x1`, `_4x5`, `_9x16`, `_16x9`, of `.1.1`, `.4.5`, etc.). Elke bundle = één advertentie in Meta met meerdere formaten ("rapid ad"-stijl), die per Meta-placement het juiste formaat toont.

## Bundel-regel (jouw keuze: alleen aspect-ratio suffixen)

Regex strijkt aan het eind van de bestandsnaam (vóór extensie) deze tokens, met optionele `_`, `-`, `.` of spatie als separator:

```
1x1  1.1  1-1   →  1:1
4x5  4.5  4-5   →  4:5   (5x4 ook → 4:5)
9x16 9.16 9-16  →  9:16
16x9 16.9 16-9  →  16:9
```

Voorbeeld bundle:
```
VPK_Amsterdam_1x1.jpg
VPK_Amsterdam-4x5.jpg     →  bundle "VPK_Amsterdam" met 3 varianten
VPK_Amsterdam 9.16.mp4
```
Bestanden zonder herkenbare ratio blijven losse "single-variant" bundles (gedraagt zich als nu).

## Placement-mapping (Meta standaard)

| Ratio | Placements |
|-------|-----------|
| 1:1   | FB feed/marketplace/search/video_feeds, IG stream/explore, AN classic |
| 4:5   | FB feed, IG stream/explore |
| 9:16  | FB story + reels, IG story + reels, Messenger story |
| 16:9  | FB in-stream video + right column, AN rewarded video |

Ontbrekende ratio's in een bundle: Meta crop't automatisch (Advantage+ placement), geen blocker.

## UI in launcher (één card per bundle, tabs per formaat)

```text
┌──────────────────────────────────────────────────────────┐
│  [preview groot — actieve tab]   VPK_Amsterdam           │
│                                  3 formaten · Ready      │
│  ┌──┬──┬──┐                      [P3] [H2] [D1] ✏️ 🗑    │
│  │1:1│4:5│9:16│   ← tabs                                 │
│  └──┴──┴──┘                                              │
└──────────────────────────────────────────────────────────┘
```

- Eén set primary text / headline / description / CTA per bundle.
- Tabs tonen mini-thumbnail per ratio; klik schakelt grote preview.
- "Unbundle" knop in de overflow menu (handmatig terug naar losse ads).

## Technische wijzigingen

### NEW `src/lib/ad-bundle.ts`
Pure util:
- `parseCreativeName(fileName)` → `{ baseName, ratio, extension }`
- `bundleByBaseName(items)` → `CreativeBundle[]` (dedupe op ratio per bundle)
- `RATIO_TO_PLACEMENTS` constante (zie tabel hierboven)

### EDIT `src/pages/client-workspace/AdLauncherTab.tsx`
Vervang `CreativeRow` door `BundleRow`:
```ts
interface BundleVariant {
  ratio: '1:1' | '4:5' | '9:16' | '16:9' | null;
  file: File; preview_url: string;
  storage_path?: string; uploading: boolean; upload_error?: string;
}
interface BundleRow {
  id: string; baseName: string;
  variants: BundleVariant[];
  texts: CreativeText;
  launch_status?: 'pending'|'success'|'failed';
  launch_error?: string; ad_id?: string;
}
```
- `handleFiles` parst elk bestand, voegt toe aan bestaande bundle of maakt nieuwe.
- Launch payload stuurt nu `creatives: [{ base_name, texts, variants: [{ ratio, storage_path, file_name, file_type }] }]`.

### NEW `src/components/ad-launcher/BundlePreviewCard.tsx`
Eén card per bundle met:
- Grote preview (afbeelding/video) van actieve tab
- Tab-rij met thumbnails per ratio
- "Voeg formaat toe" knop (drop-zone voor extra ratio die nog mist)
- Edit-texts + verwijder + unbundle acties

### EDIT `supabase/functions/meta-upload-creative/index.ts`
Body-schema verandert naar:
```ts
creatives: Array<{
  base_name: string;
  texts: CreativeText;
  variants: Array<{ ratio: string|null; storage_path: string; file_name: string; file_type: string }>;
}>
```

Per bundle:
1. Upload alle varianten naar Meta → `image_hash` of `video_id` per ratio.
2. Kies "primary" variant (voorkeur 1:1, anders eerste) voor top-level `image_hash`/`video_id`.
3. Bouw `asset_feed_spec` met:
   - `images` of `videos` array met alle hashes/ids
   - `asset_customization_rules`: per variant een rule met `customization_spec` uit `RATIO_TO_PLACEMENTS` + bijbehorende `image_hash` of `video_id`
4. Stuur via bestaande Ads Copy API flow (`/{source_ad_id}/copies` met `creative_parameters`). Eén bundle = één nieuwe ad.
5. `ad_launches.creative_filename` = `base_name (3 formaten)`.

Voorbeeld `asset_feed_spec`:
```json
{
  "ad_formats": ["SINGLE_IMAGE"],
  "images": [{"hash": "H1"}, {"hash": "H45"}, {"hash": "H916"}],
  "bodies": [...], "titles": [...], "descriptions": [...],
  "link_urls": [{"website_url": "..."}],
  "call_to_action_types": ["APPLY_NOW"],
  "call_to_actions": [{...}],
  "asset_customization_rules": [
    { "customization_spec": { "publisher_platforms":["facebook","instagram","audience_network"],
        "facebook_positions":["feed","marketplace","search","video_feeds"],
        "instagram_positions":["stream","explore","explore_home"],
        "audience_network_positions":["classic"] },
      "image_label": { "name": "H1" } },
    { "customization_spec": { "publisher_platforms":["facebook","instagram"],
        "facebook_positions":["feed"], "instagram_positions":["stream","explore"] },
      "image_label": { "name": "H45" } },
    { "customization_spec": { "publisher_platforms":["facebook","instagram","messenger"],
        "facebook_positions":["story","facebook_reels"],
        "instagram_positions":["story","reels"], "messenger_positions":["story"] },
      "image_label": { "name": "H916" } }
  ]
}
```
(Voor video gebruikt Meta dezelfde structuur met `videos` + `video_label`.)

## Geen database-wijzigingen
`ad_launches` blijft één row per resulterende Meta-ad. Filename krijgt een suffix `(N formaten)` zodat je in de history ziet dat het een bundle was.

## Backwards compatible
- Losse upload (1 file, geen ratio-suffix) = bundle met 1 variant `ratio:null` → edge function valt terug op huidige single-image/video flow (geen `asset_customization_rules`).
- Geen breaking changes voor bestaande launches.

## Wat ik aanmaak na goedkeuring
- `src/lib/ad-bundle.ts` (util)
- `src/components/ad-launcher/BundlePreviewCard.tsx` (UI)
- Aanpassing in `src/pages/client-workspace/AdLauncherTab.tsx` (bundle state + payload)
- Aanpassing in `supabase/functions/meta-upload-creative/index.ts` (variants → asset_customization_rules)
