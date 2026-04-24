## Wat ik heb vastgesteld

**Do I know what the issue is?** Ja.

De kern lijkt niet te zijn dat Meta "meerdere tekstvarianten" onmogelijk maakt, maar dat **onze app een volledig nieuwe ad creative vanaf nul opbouwt met een te minimale payload**. Daardoor krijgen we op dit account/ad set-profiel de fout:

- `adcreatives: Invalid parameter — object_story_spec param is ongeldig` (`100/1443048`)

### Waarschijnlijk hoe Rapid Ads dit oplost
Ik kon geen publieke technische documentatie vinden van hun exacte interne payload, dus ik kan hun implementatie niet 100% bewijzen. Maar de publieke signalen zijn sterk:

- Hun site noemt expliciet:
  - **"Configure settings once"**
  - **"placements and enhancement preferences"**
  - **"auto-disable enhancements"**
- Op hun site staat ook een testimonial die zegt dat Rapid Ads **Advantage+ enhancements niet automatisch aanzet**.
- Een vergelijkbare bulk-tool met publieke docs (**AdsUploader**) documenteert een **API-configuratie op basis van een bestaande source ad/template**, plus een keuze tussen:
  - **Flexible Texts**
  - **Separate Ads**

De meest waarschijnlijke conclusie is dus:

1. Ze bouwen niet blind een kale creative op met alleen `page_id + lead_form_id + media + teksten`.
2. Ze **kopiëren of hergebruiken een bestaande werkende ad/ad creative als template**.
3. Daarbij behouden ze verborgen maar belangrijke Meta-velden zoals:
   - placement-/profile-informatie
   - enhancement-instellingen
   - mogelijke `instagram_user_id`
   - exacte creative-structuur die al geldig is voor dat account/ad set/type
4. Daarna **overschrijven** ze alleen media, tekstvelden en enhancement-flags.

## Waarom onze huidige aanpak kwetsbaar is

In de huidige code zie ik dit patroon:

- `supabase/functions/meta-upload-creative/index.ts`
  - bouwt `object_story_spec` zelf op
  - experimenteert met `asset_feed_spec` + `degrees_of_freedom_spec`
- `src/components/ad-launcher/MetaSettingsDialog.tsx`
  - bewaart alleen `meta_page_id`
- `src/components/ad-launcher/MetaSelectors.tsx`
  - laat campagne, ad set en lead form kiezen
  - **geen source ad / template ad selectie**
- `src/pages/client-workspace/AdLauncherTab.tsx`
  - lanceert direct naar `meta-upload-creative`

Dus: wij missen precies de context die bulk-tools vaak gebruiken om Meta-creatives geldig te houden.

## Belangrijkste hypothese

De fout komt waarschijnlijk doordat deze ad set / placements / lead-ad configuratie **meer creatieve context nodig heeft dan alleen `page_id`**. Denk aan:

- `instagram_user_id` voor gemixte placements
- bestaande enhancement- of placement-configuratie
- specifieke structuur die hoort bij een bestaand werkend lead-ad template

Dat verklaart ook waarom handmatig in Meta Ads Manager wél lukt: de UI vult verborgen of afgeleide velden voor je in.

## Plan

1. **Template-gebaseerde flow toevoegen**
   - In plaats van een creative vanaf nul op te bouwen, laten we de gebruiker eerst een **bestaande advertentie als template** kiezen.
   - Die advertentie moet al correct werken in dezelfde account/campagne/ad set-context.

2. **Volledige creative-context uitlezen**
   - De gekozen template-ad uitlezen via Meta.
   - Relevante velden meenemen zoals:
     - `object_story_spec`
     - `asset_feed_spec` / flexible text config als aanwezig
     - `degrees_of_freedom_spec`
     - profiel-/placementvelden zoals `instagram_user_id`
     - enhancement-instellingen

3. **Clone + override strategie bouwen**
   - Nieuwe creative maken op basis van die template-context.
   - Alleen dit vervangen:
     - afbeelding/video
     - primary texts
     - headlines
     - descriptions
     - CTA / link waar nodig
   - De rest intact laten om Meta-validatie niet te breken.

4. **Enhancement controls toevoegen**
   - Een duidelijke instelling toevoegen om enhancement-features standaard uit te zetten of per type te regelen.
   - Dit sluit beter aan op hoe Rapid Ads zich positioneert.

5. **Debugging verbeteren**
   - Bij elke creative creation de Meta-response uitbreiden met:
     - request-shape fingerprint
     - returned creative fields
     - welke velden Meta terugstuurt of stript
   - Ook `fetch-meta-ads` uitbreiden zodat flexible texts zichtbaar zijn in de app.

6. **Fallback-modus toevoegen**
   - Als template-based flexible text voor een bepaald ad type toch niet ondersteund blijkt:
     - automatisch of handmatig terugvallen op **Separate Ads**
     - dus 1 advertentie per tekstcombinatie

## Technische details

### Bestanden die aangepast moeten worden
- `supabase/functions/meta-upload-creative/index.ts`
- `supabase/functions/fetch-meta-ads/index.ts`
- `src/components/ad-launcher/MetaSelectors.tsx`
- `src/pages/client-workspace/AdLauncherTab.tsx`
- mogelijk `src/components/ad-launcher/MetaSettingsDialog.tsx` of een nieuwe selector voor template ads

### Verwachte nieuwe UX
```text
Campagne -> Ad set -> Template ad -> Lead form -> Upload creatives -> Tekstmodus
                                                   |-> Flexible Texts
                                                   |-> Separate Ads
```

### Waarom dit de beste route is
- Sluit veel beter aan op hoe bulk-tools dit waarschijnlijk doen
- Vermijdt fragiele, handmatig opgebouwde `object_story_spec`
- Maakt de flow account-specifiek en placement-specifiek robuuster
- Geeft ons meteen een realistische fallback

## Validatie na implementatie

Na bouw valideren we dit met 1 echte template-ad:

1. template selecteren
2. 1 creative uploaden met 2-3 tekstvarianten
3. launch uitvoeren
4. creative direct teruglezen uit Meta
5. checken of:
   - creative succesvol aangemaakt is
   - multiple texts echt zijn opgeslagen
   - enhancements correct uit staan
   - de app dezelfde varianten ook toont

## Verwachte uitkomst

Niet meer gokken met losse Meta-payloads, maar een launcher die werkt zoals serieuze bulk-tools dat waarschijnlijk doen: **template-first, context-preserving, met flexible texts waar mogelijk en separate ads als fallback**.