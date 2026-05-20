## Doel
Zorgen dat de launcher niet alleen succesvol een ad aanmaakt, maar dat Meta Ads Manager bij **Identity → Instagram profile** automatisch het juiste Instagram-profiel toont in plaats van “Use Facebook Page” + foutmelding.

## Bevinding
De laatste upload is technisch gelukt: de backend vond en accepteerde `instagram_user_id=17841404254570727` via `page.page_backed_instagram_accounts`, en er is een ad aangemaakt. De screenshot wijst erop dat Meta de identiteit in de UI nog niet volledig herkent/selecteert op ad-niveau. Volgens Meta moet bij Instagram/mixed placements de creative expliciet een `page_id` én `instagram_user_id` bevatten. Bij asset-feed creatives is dat extra gevoelig: de identity moet in de juiste creativevelden staan en niet alleen indirect via een fallback.

## Plan
1. **Payload hardenen volgens Meta’s docs**
   - Bij multi-format/asset-feed uploads altijd `instagram_user_id` meesturen zodra Instagram-placements aanwezig zijn.
   - `instagram_actor_id` volledig verwijderd houden.
   - `object_story_spec` expliciet houden als `{ page_id, instagram_user_id }`.
   - Daarnaast het geaccepteerde IG ID ook als top-level creative identity veld meesturen waar Meta dit ondersteunt, zodat Ads Manager de Instagram identity betrouwbaar invult.

2. **Geen Page-ID als Instagram-kandidaat gebruiken**
   - De huidige resolver neemt ook `page.fields` mee, waardoor de Facebook Page ID (`179116...`) als IG-kandidaat kan worden geprobeerd.
   - Dat wordt uitgesloten: alleen IDs uit echte IG-bronnen gebruiken (`instagram_business_account`, `connected_instagram_account`, `page_backed_instagram_accounts`, `instagram_accounts`, ad-account IG endpoints, of handmatige instelling).

3. **Geaccepteerde IG ID opslaan voor de klant**
   - Als Meta een automatisch gevonden IG ID accepteert, deze opslaan in `clients.meta_instagram_account_id`.
   - Daardoor gebruikt de volgende launch meteen de werkende Meta Graph Instagram User ID in plaats van de oude `1646...` UI-ID.

4. **Controle na aanmaken**
   - Na `adcreatives` aanmaken de creative teruglezen met `object_story_spec` en identityvelden.
   - Loggen welk IG ID daadwerkelijk op de creative staat, zodat dit niet meer giswerk is.

5. **Validatie**
   - Edge function deployen.
   - Testen met dezelfde Rivas-client/adset.
   - Controleren in logs dat:
     - de oude `1646...` niet meer als eerste/foute kandidaat gebruikt wordt;
     - de geaccepteerde `17841404254570727` op de creative staat;
     - het klantrecord daarna dit werkende ID bewaart.

## Technische details
- Bestand: `supabase/functions/meta-upload-creative/index.ts`
- Mogelijke kleine UI-tekstupdate blijft beperkt tot de bestaande Meta-instellingen, alleen als nodig om duidelijk te maken dat het opgeslagen ID de Meta Graph Instagram User ID is.