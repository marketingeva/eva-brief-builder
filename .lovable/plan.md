## Diagnose

De huidige upload maakt de advertentie wel aan en de verificatielog laat zien dat `object_story_spec.instagram_user_id` op `17841404254570727` staat. Toch toont Meta Ads Manager bij de ad-level identity nog “Use Facebook Page”. Dat wijst erop dat alleen het veld in de creative niet genoeg is voor de Ads Manager identity-selector, óf dat onze creative-vorm niet volledig volgens Meta’s verwachte lead-ad payload wordt opgebouwd.

Belangrijk uit de Meta API-docs:
- Voor Instagram ads moet de creative zowel `page_id` als `instagram_user_id` bevatten.
- Sinds API v22 is `instagram_actor_id` deprecated; we moeten dus niet meer bouwen op het legacy actor field.
- Voor lead ads hoort de lead form CTA in `object_story_spec.link_data.call_to_action`, niet alleen los in `asset_feed_spec`/creative parameters.
- Voor ad account discovery bestaat ook `/{ad_account_id}/connected_instagram_accounts`, naast `/{ad_account_id}/instagram_accounts` en page endpoints.

## Plan

1. **Instagram discovery uitbreiden**
   - Voeg `/{ad_account_id}/connected_instagram_accounts` toe aan `meta-list-resources` en `resolveIgIdentity`.
   - Blijf `/{page_id}/instagram_accounts`, `/{page_id}/page_backed_instagram_accounts`, `instagram_business_account` en `connected_instagram_account` gebruiken.
   - Normaliseer de selectie naar het nieuwe Meta-veld: `instagram_user_id`, met `1784...` als voorkeurs-ID en legacy actor alleen nog als referentie/matching.

2. **Deprecated actor-id uit de upload halen**
   - Stop met het meesturen van `instagram_actor_id` bij nieuwe creatives.
   - Gebruik uitsluitend `object_story_spec.instagram_user_id` voor API v21+ / v22+ gedrag.
   - Legacy `1646...` blijft alleen bruikbaar om het juiste `1784...` profiel te vinden.

3. **Creative-payload corrigeren naar Meta lead-ad structuur**
   - Bouw `object_story_spec` niet meer alleen als `{ page_id, instagram_user_id }`.
   - Voeg expliciet `link_data` toe met:
     - `message`
     - `name`
     - `description`
     - `link`
     - `call_to_action: { type, value: { lead_gen_form_id, link } }`
     - bij single image/video ook het juiste media field.
   - Voor multi-asset `asset_feed_spec` houden we de plaatsingsregels, maar zorgen we dat de story spec óók de lead-ad CTA en Instagram identity bevat zodat Meta Ads Manager de identity niet als “Facebook Page fallback” interpreteert.

4. **Ad-level verificatie aanscherpen**
   - Na creatie halen we de ad/creative terug met extra velden:
     - `object_story_spec`
     - `instagram_user_id`
     - `actor_id`
     - `effective_object_story_id`
     - `asset_feed_spec`
   - Log expliciet of de gekozen Instagram ID overeenkomt met het verwachte `17841404254570727`.
   - Als Meta geen IG identity teruggeeft of een andere ID koppelt, laat de launch falen in plaats van “succes” te tonen.

5. **Single-ad copy route repareren**
   - De huidige route voor één bestand dupliceert een bestaande advertentie via `/copies`; daarbij kan de oude identity van de bronadvertentie meekomen.
   - Ik trek single creative uploads gelijk met multi-format uploads: altijd een nieuwe creative maken met expliciete `page_id + instagram_user_id` en daarna een nieuwe ad maken.
   - Daardoor is de Instagram-koppeling niet langer afhankelijk van de bronadvertentie.

## Validatie

- Test `meta-list-resources` voor Rivas en controleer dat het profiel als `businessId: 17841404254570727` beschikbaar is.
- Test `meta-upload-creative` met Rivas.
- Controleer de logs op:
  - creative `object_story_spec.page_id = 179116508833113`
  - creative `object_story_spec.instagram_user_id = 17841404254570727`
  - ad verification matched = true
- Pas daarna is de upload “geslaagd” voor de UI.