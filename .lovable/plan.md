Doel
De Inspiration Hub wordt omgebouwd naar 2 duidelijke tabs:
1. Ad Library
2. Hooks

Wat ik ga aanpassen

1. Inspiration Hub herstructureren
- De huidige modus “Afbeeldingen” / “Afbeeldingen + hooks” verwijderen.
- Bovenin 2 tabs maken:
  - Ad Library
  - Hooks
- De Ad Library-tab krijgt een vaste bron en vaste filters gebaseerd op jouw link:
  - land: Nederland
  - categorie: Employment
  - status: Active
  - zoekterm: Verzorgende IG
  - media: all
- De vrije zoekbalk verdwijnt hier dus als primaire input; de hub wordt een vaste inspiratiebron voor deze doelgroep.

2. Ad Library-tab functioneel opnieuw opzetten
- De scraper aanpassen zodat hij exact op de Meta Ad Library URL en parameters werkt die jij doorgaf, in plaats van de huidige lossere query-opbouw.
- De huidige fout corrigeren waarbij de edge function nu nog `ad_type=all` gebruikt voor de scrape-fallback, terwijl jij expliciet employment ads wilt.
- Resultaten opslaan als echte “ad library snapshots” met per advertentie:
  - adverteerder
  - advertentietekst
  - afbeelding of video-indicatie
  - ad library link
  - library ID
  - startdatum
  - platformen indien beschikbaar
- UI van de cards aanpassen zodat image en video beide goed weergegeven worden. Voor video’s toon ik een duidelijke video-state/thumbnail-link in plaats van ze als afbeelding te behandelen.

3. Datamodel uitbreiden voor Ad Library-items
- De bestaande inspiratietabellen blijven de basis, maar ik voeg gerichte velden toe zodat Ad Library-data niet meer “half” in het huidige images-model wordt geperst.
- Waarschijnlijke extra velden:
  - tab_type / source_type
  - media_preview_url
  - video_url of snapshot_url
  - publisher_platforms
  - raw_payload / metadata
  - sort_mode / source_url op search-niveau
- Bestaande favorieten en opslag blijven werken.

4. Scrape-logica betrouwbaarder maken
- Eerst de officiële archive API-resultaten gebruiken voor stabiele metadata.
- Daarna per ad de snapshot/render-pagina gebruiken om creatives betrouwbaarder uit te lezen, omdat de listing-pagina zelf niet alle media volledig en consistent bevat.
- Fall-back scraping op de listing alleen gebruiken als aanvullende bron, niet meer als primaire waarheid.
- Deduplicatie verbeteren op library ID.
- Cache-key aanscherpen zodat resultaten specifiek zijn voor:
  - query
  - country
  - ad_type
  - media_type
  - sort_mode
- Oude generieke cache wordt dus niet meer per ongeluk hergebruikt.

5. Hooks-tab toevoegen
- Nieuwe Hooks-tab bouwen die niet simpelweg hetzelfde overzicht met tekst toont, maar echte hook-inspiratie uit de gescrapete advertentieteksten haalt.
- Per hook laat ik zien:
  - hook-zin of opener
  - type hook (bijv. collega’s, betekenisvol werk, flexibiliteit, waardering, ontwikkeling)
  - voorbeeldadvertentie / bron
  - gekoppelde adverteerder
- Hooks worden afgeleid uit de opgeslagen Ad Library-items voor “Verzorgende IG” in Nederland, zodat deze tab direct gevoed wordt vanuit echte advertenties.

6. UX en gedrag verbeteren
- In de Ad Library-tab een duidelijke knop “Vernieuwen uit Meta Ad Library” toevoegen.
- Recente zoekopdrachten vervangen of versimpelen naar een vaste dataset-weergave, omdat deze hub nu niet meer generiek zoekgedreven is maar bron-gedreven.
- Favorieten behouden op itemniveau.
- Detailmodal behouden, maar uitbreiden voor advertentietekst en media-type.

Waarom dit nodig is
- De huidige implementatie is nog te generiek en gebruikt niet exact jouw Meta Ad Library-scope.
- In de edge function zit nu al een inhoudelijke mismatch: de scrape-URL gebruikt `ad_type=all`, terwijl jouw use case `employment_ads` vereist.
- De huidige UI probeert hooks als view-mode boven op dezelfde resultaten te tonen, terwijl jij eigenlijk 2 aparte werkmodi wilt: echte ads bekijken en hooks analyseren.

Technische details
- Bestanden die ik verwacht aan te passen:
  - `src/pages/AdsInspirationPage.tsx`
  - `supabase/functions/scrape-ads-inspiration/index.ts`
  - mogelijk `src/integrations/supabase/types.ts` (automatisch bijgewerkt na schemawijziging)
  - nieuwe migratie voor extra inspiratievelden
- Database:
  - bestaande tabellen `inspiration_searches`, `inspiration_items`, `inspiration_favorites` blijven bruikbaar
  - schema wordt uitgebreid i.p.v. vervangen
- Backend:
  - edge function gebruikt bestaande secrets en connectoren; er zijn geen nieuwe geheimen nodig
- Beperkingen:
  - De officiële archive API geeft metadata heel goed terug, maar media-assets vereisen vaak extra scraping van de snapshot/ad detail pagina. Daarom combineer ik beide bronnen.

Resultaat na implementatie
- Een Inspiration Hub met:
  - Tab 1: Ad Library — echte Nederlandse employment ads voor “Verzorgende IG” inclusief tekst + afbeelding/video
  - Tab 2: Hooks — afgeleide hook-inspiratie uit dezelfde advertentiebron
- Resultaten die veel dichter aansluiten op jouw gedeelde link en screenshot.