## Analyse

De huidige fout is niet meer dezelfde als de eerdere `instagram_actor_id` fout. De launcher probeert nu te compenseren door het Instagram veld soms weg te laten, maar Meta accepteert dat bij deze ad creative niet:

- `asset_feed_spec` + Instagram placements vereist een geldig `object_story_spec.instagram_user_id`.
- De ID uit de screenshot (`1646842048691596`) is het Instagram profile / UI-ID dat Meta toont in Ads Manager, maar Meta’s adcreative endpoint verwacht de Instagram User ID / Business Account ID die via Graph API-resources komt.
- `instagram_actor_id` mag niet meer gebruikt worden; Meta documentatie geeft aan dat dit deprecated/ongeldig is voor deze flow.
- Alleen `page_id` meesturen faalt met `Instagram-account ontbreekt` omdat de asset feed Instagram placements bevat.

## Wat ik ga aanpassen

1. **Meta ID resolving robuust maken**
   - Stoppen met blind vertrouwen op `clients.meta_instagram_account_id` als API-ID.
   - Een resolver bouwen die eerst Graph API-bronnen probeert die Meta hiervoor documenteert:
     - `{page_id}?fields=instagram_business_account{id,username}`
     - `{page_id}/instagram_accounts`
     - `act_{ad_account_id}/connected_instagram_accounts`
     - `act_{ad_account_id}/instagram_accounts`
   - Matchen op opgeslagen ID én username-achtige waarden waar beschikbaar.
   - De gevonden Instagram ID loggen met bronlabel, zodat toekomstige fouten direct uitlegbaar zijn.

2. **Geen ongeldige creatieve meer aanmaken**
   - Als er Instagram placements in `asset_customization_rules` zitten, moet er vóór het aanmaken van de creative een geldige `instagram_user_id` zijn.
   - Als die niet gevonden wordt: geen halfbakken fallback naar alleen `page_id`, maar een duidelijke foutmelding: “Meta geeft geen geldige Instagram User ID terug voor deze Page/ad account; koppel het Instagram-account aan de Page/ad account of vul de Graph API Instagram User ID in.”

3. **Payload corrigeren volgens Meta’s vereisten**
   - `object_story_spec` bevat altijd `page_id` en bij Instagram placements ook `instagram_user_id`.
   - `instagram_actor_id` blijft volledig verwijderd.
   - `asset_feed_spec` blijft de basis voor 1:1 / 4:5 / 9:16 placement customization.

4. **Instellingen UI minder misleidend maken**
   - De label/helpttekst aanpassen: het veld is niet “Instagram profile ID uit Ads Manager”, maar “Meta Instagram User ID / Business Account ID”.
   - Duidelijk maken dat de 1646… ID uit de dropdown mogelijk niet werkt voor de API.

5. **Validatie via logs/test**
   - De functie deployen.
   - Daarna logs gebruiken om te verifiëren dat de resolver de juiste Graph API endpoints probeert en niet meer met een ongeldige ID naar `adcreatives` of `ads` gaat.

## Verwachte uitkomst

De launcher werkt zodra Meta via de Page/ad account een echte Instagram User ID teruggeeft. Als Meta dat account niet via de API beschikbaar stelt, krijgt de gebruiker een duidelijke configuratiefout in plaats van steeds wisselende Meta-errors.