## Doel

De ad-library kaart in de Inspiration Hub aanpassen zodat hij dezelfde leesvolgorde heeft als een Meta Ad Library kaart, zonder lege ruimtes en met nette weergave voor story-formaten.

## Nieuwe kaartstructuur (top → bottom)

```text
┌──────────────────────────────────────────┐
│ ✓ Active   [Video|Carousel]   FB IG       │  ← status header (blijft)
│ Library ID: 123…                          │
│ Gestart op 2024-…                         │
├──────────────────────────────────────────┤
│ 🟣 Logo  Adverteerder                     │  ← adverteerder header (blijft)
│         Sponsored                  ↗      │
├──────────────────────────────────────────┤
│ Primary text – tot ~6 regels…             │  ← klikbaar; opent dialog met
│ "Lees meer" indicator wanneer afgekapt    │     volledige tekst
├──────────────────────────────────────────┤
│ [ Media: image / carousel / video / story]│  ← strak in 1:1, 4:5 of 9:16
├──────────────────────────────────────────┤
│ Headline (bold)                           │
│ Description (klein, muted)                │
│                            [ CTA ]        │
└──────────────────────────────────────────┘
```

De volgorde primary text → media → headline/description/CTA is exact zoals in de Meta Ad Library screenshot.

## Wijzigingen

### 1. `src/pages/AdsInspirationPage.tsx` — `AdLibraryCard`
- Verwijder de vaste `min-h-[88px]` op de primary-text knop en `min-h-[68px]` op de footer; gebruik natuurlijke hoogte zodat er geen lege ruimte ontstaat.
- Toon primary text met `line-clamp-6` (default) en een subtiele "Lees meer" link onderaan wanneer de tekst afgekapt is. Klik opent reeds de dialog met de volledige tekst.
- Verwijder fallback-tekst zoals "Geen headline beschikbaar" — laat de footer-sectie weg als er niets is, in plaats van een lege block te tonen.
- Footer toont in deze volgorde: **headline** (bold, max 2 regels) → **description** (muted, max 3 regels) → **CTA** rechts onderin als badge.

### 2. `src/pages/AdsInspirationPage.tsx` — `AdMediaFrame`
- Bepaal de aspect-ratio strikt op basis van `media_type` en gedetecteerde dimensies:
  - `story` of portrait media → `aspect-[9/16]`
  - default afbeelding/video → `aspect-[4/5]` (Meta feed default) i.p.v. `aspect-square`, omdat dit beter aansluit bij de meeste Meta ads.
  - vierkante media (gedetecteerd uit dimensies) → `aspect-square`
- Bij story-fallback zonder media: laat de "telefoonkaart" placeholder de **volledige 9:16 frame** vullen (geen kleine kaart op een grijs vlak), met de primary text + CTA er netjes in. Geen overbodige witruimte meer.
- Carousel arrows en dots blijven werken binnen het frame.

### 3. `src/pages/AdsInspirationPage.tsx` — Detail dialog
- Houd de huidige volgorde (advertentietekst → headline → beschrijving → CTA) in het rechterpaneel; verwijder de "Platformen" sectie die meestal leeg is en die de gebruiker eerder al weg wilde hebben.
- Verwijder de redundante "Library ID" badge bovenin de dialog (staat al in de kaart).

### 4. Scraper (`supabase/functions/scrape-ads-inspiration/index.ts`)
- Geen functionele logica-wijziging nodig: `media_type = 'story'` wordt al gezet wanneer er geen image/video gevonden is.
- Kleine controle: als enrich-snapshot een 9:16 image vindt, blijf `media_type = 'image'` maar laat de frontend portrait detecteren via dimensies (al aanwezig in `isPortraitMedia`).

## Acceptatiecriteria

- Kaart heeft geen grote witruimte meer onder de media.
- Primary text is zichtbaar, afgekapt op ~6 regels, klikbaar voor volledige weergave.
- Headline en description staan onder de media, niet erboven.
- Story-formaten vullen netjes een 9:16 frame zonder grijze randen rondom.
- Carousels blijven binnen hetzelfde frame doorklikbaar.
- "Geen headline beschikbaar" / lege "Platformen"-blok verschijnen niet meer.
