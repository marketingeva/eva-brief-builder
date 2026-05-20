## Advies
Ja, je richting klopt: we moeten niet één ID proberen alsof beide ID-types hetzelfde veld gebruiken. De fout laat precies zien dat Meta ze verschillend valideert:

- `1646842048691596` faalt als `instagram_user_id`
- `17841404254570727` faalt als `instagram_actor_id`

Dus de fix is: beide waarden gebruiken, maar elk op het juiste Meta-veld.

## Plan
1. **Instagram-ID’s als pair behandelen**
   - Bouw in `meta-upload-creative` een resolver die per Instagram-profiel zowel de `ig_id`/legacy actor ID als de `1784...` Business Account ID bewaart.
   - Niet meer één platte kandidatenlijst met losse IDs proberen.

2. **Payload aanpassen naar dual-ID payload**
   - Voor directe creatives met meerdere formaten:
     - `object_story_spec.instagram_user_id` krijgt het `1784...` Instagram Business Account ID.
     - top-level `instagram_actor_id` krijgt het legacy actor/user ID `1646...`.
   - Als één van beide ontbreekt, alleen dan een gecontroleerde fallback proberen.

3. **Resource discovery gelijk trekken met Facebook Page-selectie**
   - `meta-list-resources` laat per Instagram-account beide IDs zien/teruggeven, niet alleen `id`.
   - De UI blijft simpel: gebruiker kiest één Instagram-profiel, intern slaan/gebruiken we de juiste ID-combinatie.

4. **Geen verkeerde overschrijvingen meer**
   - Voorkom dat een succesvolle fallback het opgeslagen client-ID vervangt door het verkeerde ID-type.
   - Alleen opslaan als we zeker weten dat het bij hetzelfde profiel hoort.

5. **Validatie via logs**
   - Extra logging toevoegen rond de uiteindelijke payload-identiteit: welke `instagram_actor_id` en welke `instagram_user_id` gebruikt zijn.
   - Daarna kan een nieuwe testlaunch direct bevestigen of Meta de Instagram-profielselectie accepteert.

## Technische kern
De huidige code gebruikt `cand.id` voor beide plekken:

```ts
story.instagram_user_id = cand.id;
payload.instagram_actor_id = cand.id;
```

Dat is waarschijnlijk de oorzaak. Dit moet worden:

```ts
story.instagram_user_id = businessAccountId; // 1784...
payload.instagram_actor_id = actorId;        // 1646...
```

Voor Rivas wordt dat dus:

```ts
instagram_user_id: "17841404254570727"
instagram_actor_id: "1646842048691596"
```