

# Fix: Ad Preview — Primary Text, Destination & CTA

## Probleem
1. **Runtime error op line 154**: `creative_id: creative.id` — `creative` is niet gedefinieerd, moet `c.id` zijn. Dit crasht de hele ad-detail response.
2. De Meta API query vraagt de juiste velden op via field expansion, maar de crash op line 154 zorgt ervoor dat er nooit data terugkomt.
3. De afbeelding is wazig omdat als fallback alsnog een thumbnail-URL wordt gebruikt.

## Plan

### 1. Fix runtime crash in edge function (line 154)
- Verander `creative.id` → `c.id` (de variabele die op line 85 is gedefineerd)

### 2. Verbeter image resolution
- Voeg `image_url` toe als expliciet veld in de creative field expansion (naast object_story_spec)
- Bij de adimages hash-lookup: vraag ook `url_128` en `url` op, en gebruik de grootste beschikbare variant
- Fallback: als alle URLs nog steeds `p64x64` bevatten, gebruik `full_picture` van de ad post zelf

### 3. Voeg destination URL toe aan de UI
- De `link_url` wordt al opgehaald maar alleen klein getoond onder CTA
- Maak een apart "Destination" blok in de preview dialog, zoals in Facebook Ads Manager
- Toon de volledige link met een extern-link icoon

### 4. Bestanden

| Bestand | Wijziging |
|---------|-----------|
| `supabase/functions/fetch-meta-ads/index.ts` | Fix `creative.id` → `c.id`, verbeter image fallback |
| `src/pages/client-workspace/LiveAdsTab.tsx` | Voeg "Destination" sectie toe in preview dialog |

