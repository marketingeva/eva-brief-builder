Plan om dit goed te fixen:

1. **Instagram-account expliciet ophalen en opslaan, net als Facebook Page**
   - Breid de bestaande Meta resource-functie uit met een `instagram_accounts` resource.
   - Gebruik hiervoor dezelfde bewezen Page-token aanpak als bij lead forms: eerst Page access token ophalen, daarna de aan de Page gekoppelde Instagram identity ophalen.
   - Resultaat teruggeven als duidelijke lijst met `id`, `name/username` en source.

2. **Launcher UI gebruikt een echte Instagram-selectie in plaats van verborgen auto-guessing**
   - Voeg in de Meta-instellingen een automatische Instagram lookup/selectie toe op basis van de ingestelde Facebook Page ID.
   - Laat de gekozen Instagram ID opslaan in `clients.meta_instagram_account_id`, precies zoals de Facebook Page ID nu client-specifiek wordt opgeslagen.
   - Houd handmatige invoer alleen als fallback, maar de normale route wordt: Page kiezen/instellen → Instagram account ophalen → opslaan → launcher gebruikt exact die identity.

3. **Upload-flow simpeler en deterministischer maken**
   - Bij launch eerst de opgeslagen Instagram ID gebruiken.
   - Alleen als die ontbreekt, fallback naar server-side lookup via dezelfde Page-token resolver.
   - Stoppen met brede candidate guessing over ad-account endpoints als primaire route, omdat Meta Ads Manager de identity blijkbaar niet als “geselecteerd profiel” ziet ondanks creative-acceptatie.

4. **Ad creation aansluiten op Meta’s identity requirement**
   - Voor placement asset creatives altijd `object_story_spec.page_id` én `object_story_spec.instagram_user_id` zetten.
   - De gekozen/gevonden Instagram ID na creative creation verifiëren en loggen.
   - Als Meta geen Instagram identity accepteert, een concrete fout teruggeven: “Instagram-profiel niet gevonden voor deze Page; open Meta-instellingen en selecteer het gekoppelde profiel.”

5. **Validatie**
   - Edge function deployen.
   - Met de Rivas client controleren dat de Instagram lookup hetzelfde account teruggeeft als de Page-koppeling.
   - Controleren dat nieuwe uploads niet meer afhankelijk zijn van het oude `1646...` ID en dat de opgeslagen `1784...` identity wordt gebruikt.