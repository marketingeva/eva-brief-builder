Ik ga de Inspiration Hub zo aanpassen dat de kaarten meer lijken op de echte Meta Ad Library-opbouw: organisatie bovenaan, advertentietekst boven de creative, headline/description onder de creative, en alleen 12 advertenties initieel zichtbaar met een knop om meer te laden.

Plan:

1. Datamodel en types afronden
- De databasekolommen `media_urls` en `description` bestaan al.
- Ik werk de frontend-types bij zodat `description` en `media_urls` echt gebruikt worden in de UI.
- Ik zorg dat inserts vanuit de scraper deze velden ook vullen; nu worden ze nog niet opgeslagen.

2. Scraper corrigeren: advertentietekst vs description
- `primary_text` wordt uitsluitend de echte advertentietekst/body boven de afbeelding.
- `headline` wordt de link/headline tekst.
- `description` wordt de linkbeschrijving/description onder de afbeelding.
- `cta` blijft apart voor CTA/caption als die beschikbaar is.
- De huidige fout waarbij `title + description + caption` in `primary_text` wordt geplakt, haal ik eruit.
- De snapshot fallback mag niet langer automatisch `og:description` als advertentietekst opslaan, omdat dat precies de verwarring veroorzaakt.

3. Organisatienaam verbeteren
- Als de officiële Meta API geen toegang geeft, valt de scraper terug op HTML-scraping. Daar komt nu vaak `Onbekend` of `Meer informatie` uit.
- Ik maak de HTML-parser strenger: boilerplate zoals `Meer informatie`, `Sponsored`, `Onbekend` wordt nooit als organisatie gebruikt.
- Ik voeg heuristieken toe om de organisatie uit betere bronnen te halen: Facebook page links, aria-labels, nearby sponsored block, en eventueel tekst op/onder de creative zoals `van Savelberg` of `bij Liante` als fallback.
- Als er echt niets betrouwbaar is, blijft de fallback netjes leeg/`Onbekend`, maar niet meer foutief `Meer informatie`.

4. Media: afbeeldingen, video’s en carousels
- De scraper verzamelt meerdere geldige media-URL’s per advertentie in `media_urls`.
- Video-URL’s/posters worden apart gedetecteerd en `media_type` wordt `video`, `carousel` of `image`.
- Ik pas de scoring aan zodat kleine logo’s/avatars niet als advertentiecreative eindigen.
- In de UI toon ik:
  - video met play-overlay / video player in preview,
  - carousel als meerdere thumbnails/strip,
  - gewone image als één creative.

5. UI layout corrigeren
- Het kopje/platformblok met `Platforms Niet beschikbaar` verdwijnt van de kaart.
- De kaartvolgorde wordt:
  1. status + Library ID + startdatum,
  2. organisatie + Sponsored,
  3. advertentietekst boven de media,
  4. image/video/carousel,
  5. headline/description/CTA onder de media indien aanwezig.
- In de detail-popup toon ik dezelfde scheiding expliciet met labels: `Advertentietekst`, `Headline`, `Beschrijving`, `CTA`.

6. Eerst 12 laden, daarna “Meer laden”
- De scraper mag nog steeds meer resultaten ophalen en opslaan, maar de UI toont initieel 12 advertenties.
- Onderaan komt een knop `Meer laden` die telkens 12 extra advertenties zichtbaar maakt.
- Bij verversen, tabwissel of nieuwe resultaten reset de zichtbare teller terug naar 12.
- De Hooks-tab krijgt vergelijkbaar limietgedrag als daar veel resultaten staan, of blijft afgeleid van de geladen advertenties als dat beter aansluit bij de bestaande UX.

7. Cache en bestaande foute data
- Omdat er nu al fout gecachte items staan, laat ik de kwaliteitscontrole ook letten op ontbrekende `description/media_urls`, boilerplate organisatie, en verkeerd gevulde `primary_text`.
- Daardoor wordt bij de eerstvolgende refresh automatisch nieuwe data opgehaald in plaats van oude foutieve cache te tonen.
- Na de codewijziging deploy ik de backendfunctie opnieuw zodat de knop direct de nieuwe logica gebruikt.

Technische details:
- Bestanden die ik aanpas: `supabase/functions/scrape-ads-inspiration/index.ts` en `src/pages/AdsInspirationPage.tsx`.
- Ik wijzig geen gegenereerde backend client/types-bestanden handmatig.
- Er is waarschijnlijk geen nieuwe database-migratie nodig, omdat `media_urls` en `description` al bestaan.
- De officiële Meta API faalt momenteel met permissies en valt terug op scraping; ik verbeter daarom vooral de fallback-parser, zodat de pagina ook zonder die permissie bruikbaar is.