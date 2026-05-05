## Probleem

Twee bugs verhinderen dat opgeslagen advertenties zichtbaar blijven:

1. **Onzichtbaar in "Opgeslagen" tab**: De query `inspiration_favorites` met embed `client:clients(name)` faalt stilletjes omdat er **geen foreign key bestaat** tussen `inspiration_favorites.client_id` en `clients.id`. PostgREST geeft een error → geen data → "Opgeslagen advertenties (0)" terwijl de favoriet wél in de database staat.

2. **Verlies bij offline gaan**: `inspiration_favorites.item_id` heeft `ON DELETE CASCADE` naar `inspiration_items`. Als een Meta-ad uit de cache verdwijnt of opgeschoond wordt, verdwijnt de favoriet automatisch mee. Daarnaast maakt elke refresh nieuwe `inspiration_items`-rijen aan; alle live-data (afbeelding, tekst, headline) zit dáár — niet in de favoriet zelf.

## Oplossing

### 1. Database migratie

```sql
-- Foreign key naar clients zodat embedding werkt
ALTER TABLE public.inspiration_favorites
  ADD CONSTRAINT inspiration_favorites_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

-- Zwakke koppeling naar items: verwijderen van bron mag favoriet niet droppen
ALTER TABLE public.inspiration_favorites DROP CONSTRAINT inspiration_favorites_item_id_fkey;
ALTER TABLE public.inspiration_favorites ALTER COLUMN item_id DROP NOT NULL;
ALTER TABLE public.inspiration_favorites
  ADD CONSTRAINT inspiration_favorites_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.inspiration_items(id) ON DELETE SET NULL;

-- Snapshot-kolommen op inspiration_favorites: alle benodigde ad-data
ALTER TABLE public.inspiration_favorites
  ADD COLUMN advertiser_name      text,
  ADD COLUMN advertiser_logo_url  text,
  ADD COLUMN advertiser_page_url  text,
  ADD COLUMN primary_text         text,
  ADD COLUMN headline             text,
  ADD COLUMN description          text,
  ADD COLUMN cta                  text,
  ADD COLUMN image_url            text,
  ADD COLUMN video_url            text,
  ADD COLUMN media_preview_url    text,
  ADD COLUMN media_urls           text[] DEFAULT '{}',
  ADD COLUMN media_type           text,
  ADD COLUMN publisher_platforms  text[] DEFAULT '{}',
  ADD COLUMN ad_library_url       text,
  ADD COLUMN external_id          text,
  ADD COLUMN started_running      text,
  ADD COLUMN raw_payload          jsonb DEFAULT '{}'::jsonb;

-- Backfill bestaande favorieten met snapshot uit huidige items
UPDATE public.inspiration_favorites f
SET advertiser_name = i.advertiser_name, /* ... alle velden ... */
FROM public.inspiration_items i
WHERE i.id = f.item_id AND f.advertiser_name IS NULL;
```

### 2. Code-aanpassingen

**`src/pages/AdsInspirationPage.tsx`**
- `saveFavoriteWithContext`: voeg snapshot van alle ad-velden toe aan de insert (advertiser, primary_text, headline, description, cta, image_url, video_url, media_urls, ad_library_url, etc.).
- `loadSavedFavoriteItems`: lees snapshotvelden direct uit `inspiration_favorites` zelf in plaats van via een join met `inspiration_items`. Gebruik `client:clients(name)` embed (werkt nu de FK bestaat).
- Type `InspirationItem`-shape construeren uit favorite-row zodat bestaande UI ongewijzigd werkt.

**`src/pages/client-workspace/InspirationHubTab.tsx`**
- Idem: lees uit `inspiration_favorites` snapshotvelden, niet via join.

### 3. Resultaat

- Favoriet blijft permanent zichtbaar, ook als Meta-ad offline gaat of de scrape-cache verloopt.
- Embed-error verdwijnt → "Opgeslagen advertenties" toont juiste aantal.
- Geen extra workflow voor de gebruiker — alles werkt automatisch via de bestaande "hartje"-knop.