
Doel: de advertentie-preview op advertentieniveau echt bruikbaar maken, zodat afbeelding, advertentietekst, CTA en gekoppeld formulier gevuld zijn en de afbeelding niet meer wazig is.

Kernbevindingen uit de huidige code en logs:
- De backend vraagt nog steeds de verkeerde Meta-velden op voor ad detail.
- In `fetch-meta-ads` wordt nu vooral geleund op `creative.title`, `creative.body`, `creative.call_to_action_type`, `thumbnail_url` en een niet-uitgewerkte `object_story_spec`.
- De netwerkrespons laat precies dat probleem zien: `primary_text`, `headline`, `cta_type` en `lead_form` komen als `null` terug, terwijl de image URL een `p64x64`-achtige preview-URL is.
- De UI heeft daarnaast 2 losse issues: de dialog mist een description, en `Badge` geeft een ref-warning.

Implementatieplan:
1. Repareer de ad-detail query in de backend
- Vervang de huidige ad-detail Meta-call door een expliciete nested field query op:
  - `creative.image_url`
  - `creative.object_story_spec.link_data`
  - `creative.object_story_spec.video_data`
  - `creative.object_story_spec.template_data`
- Stop met vertrouwen op `creative.title/body/call_to_action_type/thumbnail_url` als primaire bron.

2. Normaliseer de creative-data met een vaste fallback-keten
- Voeg één helper toe die uit `object_story_spec` de previewvelden haalt:
  - tekst: `link_data.message || video_data.message || template_data.message`
  - headline: `link_data.name || video_data.title || template_data.name`
  - CTA: `link_data.call_to_action?.type || video_data.call_to_action?.type || template_data.call_to_action?.type`
  - formulier: `*.call_to_action?.value?.lead_gen_form_id`
  - afbeelding: `creative.image_url || link_data.picture || video_data.image_url`
- Als deze velden ontbreken, geef bewust `null` terug in plaats van oude foutieve fallbackwaarden.

3. Los de wazige afbeelding structureel op
- Gebruik nooit `thumbnail_url` als previewbron.
- Voeg een extra fallback toe voor gevallen waarin Meta alsnog een kleine preview-URL terugstuurt:
  - lees `image_hash` uit `link_data` / creative waar beschikbaar
  - resolve die via het advertentie-account naar de originele image URL
- Voeg eventueel een kleine guard toe: als de gekozen image URL duidelijk een mini-preview is (zoals `p64x64`), probeer automatisch de volgende bron.

4. Maak de frontend preview robuuster
- Reset `adDetail` meteen vóór een nieuwe detail-fetch, zodat oude of lege data niet blijft hangen.
- Houd loading, lege staat en foutstaat duidelijk gescheiden.
- Laat alleen secties zien die echt data hebben, behalve de verplichte placeholders (“Geen tekst beschikbaar”, “Geen formulier gekoppeld”).
- Voeg een subtiele bron/debug fallback toe in de UI wanneer Meta geen content terugstuurt, zodat sneller zichtbaar is of het om API-data of rendering gaat.

5. Los de console-waarschuwingen mee op
- Voeg `DialogDescription` toe aan de preview-dialog voor accessibility.
- Update `src/components/ui/badge.tsx` naar een `forwardRef`-component, zodat Radix/refs geen warning meer geven vanuit `LiveAdsTab`.

Technische details:
- Aan te passen bestanden:
  - `supabase/functions/fetch-meta-ads/index.ts`
  - `src/pages/client-workspace/LiveAdsTab.tsx`
  - `src/components/ui/badge.tsx`
- Geen databasewijzigingen nodig.
- Geen extra secrets nodig; de bestaande Meta-secrets zijn al aanwezig.

Validatie na implementatie:
- Test met een advertentie die nu leeg terugkomt, zoals de Wijdezorg ads uit de logs.
- Controleer dat de functie-response voor `adDetailId` niet meer `null` teruggeeft voor tekst/CTA/formulier wanneer Meta die informatie heeft.
- Controleer dat de image URL niet meer uit een lage resolutie preview bestaat.
- Controleer end-to-end in de Live Ads flow: campagne → advertentieset → advertentie → preview-dialog.
