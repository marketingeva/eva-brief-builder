

# Fix: Primary Text, Destination en CTA ophalen voor alle ad-types

## Probleem (uit de API responses)

Er zijn twee cases:

1. **Helpende Plus ad** (`120236412314030110`): image_url werkt, cta_type=LEARN_MORE, maar `primary_text`, `headline`, `description` zijn `null`. De `link_url` is `http://fb.me/` (nutteloos).
2. **VIG ad** (`120242921431630110`): alles is `null` — image, text, CTA, link, form. Dit zijn waarschijnlijk **dynamic creative ads** die `asset_feed_spec` gebruiken in plaats van `object_story_spec`.

## Oorzaak

De huidige Meta API query haalt alleen `object_story_spec` op via field expansion op het creative object. Maar:
- Dynamic creative ads slaan tekst op in `asset_feed_spec.bodies`, headlines in `asset_feed_spec.titles`, links in `asset_feed_spec.link_urls`, en afbeeldingen in `asset_feed_spec.images`
- Sommige ads hebben de data in `effective_object_story_id` (een gerenderde post) in plaats van in `object_story_spec`
- De `link_url` "http://fb.me/" is een Facebook redirect stub — niet de echte destination

## Plan

### 1. Uitbreiden Meta API query in edge function

Wijzig de `adDetailId` query om meer velden op te halen:

```
fields=id,name,status,effective_status,
  creative{id,image_url,asset_feed_spec,
    object_story_spec{link_data{...},video_data{...},template_data{...}},
    effective_object_story_id},
  adcreatives{body,image_url,link_url,object_story_spec,asset_feed_spec}
```

Plus haal op ad-niveau ook `full_picture` op als ultieme image fallback.

### 2. Normalisatie-helper uitbreiden met asset_feed_spec fallback

Voeg aan de fallback-keten toe:
```
primaryText: l.message ?? v.message ?? t.message 
  ?? asset_feed_spec?.bodies?.[0]?.text ?? null

headline: l.name ?? v.title ?? t.name 
  ?? asset_feed_spec?.titles?.[0]?.text ?? null

linkUrl: l.link ?? v.call_to_action?.value?.link 
  ?? asset_feed_spec?.link_urls?.[0]?.website_url ?? null
  (filter out "http://fb.me/" as useless)

imageUrl: c.image_url ?? l.picture ?? v.image_url 
  ?? asset_feed_spec?.images?.[0]?.url ?? ad.full_picture ?? null

ctaType: l.call_to_action?.type ?? v.call_to_action?.type 
  ?? asset_feed_spec?.call_to_action_types?.[0] ?? null
```

### 3. Filter "fb.me" redirect URLs

Als `link_url` gelijk is aan `http://fb.me/` of `https://fb.me/`, toon dan "Geen bestemming beschikbaar" in de UI in plaats van de nutteloze link.

### Bestanden

| Bestand | Wijziging |
|---------|-----------|
| `supabase/functions/fetch-meta-ads/index.ts` | Uitbreiden fields query met `asset_feed_spec`, `full_picture`; uitbreiden normalisatie fallback-keten |
| `src/pages/client-workspace/LiveAdsTab.tsx` | Filter `fb.me` URLs in destination display |

