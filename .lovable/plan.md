## Plan

De upload werkt nu, maar de Instagram-pagina wordt in Meta niet betrouwbaar als gekozen profiel gezet. Ik ga dit oplossen door de Instagram-identiteit niet meer als één los ID te behandelen, maar als een expliciete combinatie van Page + Instagram Business ID + legacy actor ID, en door na het aanmaken te verifiëren wat Meta daadwerkelijk aan de advertentie heeft gekoppeld.

## Wat ik aanpas

1. **Instagram-account discovery corrigeren**
   - `meta-list-resources` moet per Instagram-profiel beide ID’s teruggeven:
     - `businessId` / Graph ID, bijvoorbeeld `17841404254570727`
     - `actorId` / legacy ID, bijvoorbeeld `1646842048691596`
   - De dropdown mag nog steeds één profiel tonen, maar intern moet de selectie beide waarden bewaren.
   - Nu geeft de lijst voor Rivas alleen `17841404254570727` terug vanuit `page_backed_instagram_accounts`; dat is waarschijnlijk waarom de UI en upload niet dezelfde identiteit blijven gebruiken.

2. **Client-instelling uitbreiden zonder verkeerde overschrijving**
   - De huidige opgeslagen waarde is `1646842048691596`.
   - De upload moet die waarde kunnen matchen met het bijbehorende `17841404254570727`, maar mag niet zomaar een fallback-ID opslaan als “gekozen profiel”.
   - Ik voorkom dat een succesvolle fallback de klantinstelling vervuilt met het verkeerde ID-type.

3. **Creative-payload strakker maken**
   - Voor directe multi-format creatives zet ik:
     - `object_story_spec.page_id` = Facebook Page ID
     - `object_story_spec.instagram_user_id` = `1784...` Business Instagram ID
   - Ik maak `instagram_actor_id` alleen nog conditioneel: als Meta dit veld accepteert voor deze API-versie gebruiken we het, maar als Meta het als deprecated ziet, wordt de creative opnieuw aangemaakt zonder dat veld in plaats van een verkeerde Instagram-selectie te accepteren.

4. **Ad-level verificatie toevoegen**
   - Na het aanmaken van de ad haal ik bij Meta de aangemaakte creative/ad terug op.
   - Ik log/verifieer:
     - Facebook Page ID
     - `object_story_spec.instagram_user_id`
     - eventueel top-level Instagram identity velden die Meta teruggeeft
   - Daardoor kunnen we zien of Meta echt `17841404254570727` heeft vastgezet, in plaats van alleen dat de upload “succesvol” was.

5. **UI verduidelijken**
   - In de Meta-instellingen toon ik bij Instagram-profielen beide ID’s waar beschikbaar.
   - Handmatige invoer accepteert beide typen, maar de tekst moet duidelijk maken dat de app intern de juiste combinatie gebruikt.

## Technische kern

Voor Rivas hoort dit de gewenste koppeling te zijn:

```ts
page_id: "179116508833113"
object_story_spec.instagram_user_id: "17841404254570727"
instagram_actor_id: "1646842048691596" // alleen gebruiken als Meta dit nog accepteert
```

Als Meta `instagram_actor_id` blijft afkeuren als deprecated, dan wordt de fallback:

```ts
page_id: "179116508833113"
object_story_spec.instagram_user_id: "17841404254570727"
// geen instagram_actor_id
```

## Validatie

Na implementatie test ik met Rivas en controleer ik niet alleen of de advertentie wordt aangemaakt, maar ook welk Instagram-profiel Meta terugrapporteert op de creative/ad.