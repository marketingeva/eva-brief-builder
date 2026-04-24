# Fix: tekstvarianten alleen bundelen onder één advertentie als de gekozen advertentieset dat echt ondersteunt

## Probleem
De huidige flow probeert meerdere `primary_texts`, `headlines` en `descriptions` in één advertentie te stoppen via `asset_feed_spec`. Dat hoort bij Meta Dynamic Creative. Voor zulke advertentiesets geldt:
- er mag maar één advertentie in de set zitten
- de set moet in de praktijk leeg zijn voor deze aanmaakflow

De fout `100/1885553` komt dus niet door de UI, maar doordat de gekozen advertentieset nog steeds als Dynamic Creative wordt behandeld. Daardoor mislukt de upload zodra er al een advertentie in zit of zodra de set niet geschikt is voor deze flow.

## Plan

### 1. Ad set-capability check toevoegen vóór upload
Ik voeg een extra check toe in de backend die eerst de gekozen advertentieset uitleest en bepaalt:
- of de set Dynamic Creative gebruikt
- of er al advertenties in die set bestaan
- of de set geschikt is voor “één advertentie met meerdere tekstvarianten”

Zo stopt de flow niet meer pas ná het uploaden, maar meteen met een duidelijke reden.

### 2. Uploadlogica opsplitsen in ondersteunde paden
Ik maak de uploadflow expliciet:
- **Ondersteund pad:** per creativebestand precies **één advertentie** aanmaken met alle tekstvarianten gebundeld
- **Niet ondersteund pad:** de flow hard blokkeren met een concrete foutmelding in plaats van een misleidende “launch mislukt” na afloop

Belangrijk: ik haal de impliciete aanname weg dat elke advertentieset `asset_feed_spec` accepteert voor lead ads. De functie kiest alleen nog het single-ad-variant pad als de advertentiesetconfiguratie dat daadwerkelijk toelaat.

### 3. UI-feedback verbeteren in Ad Launcher
In de launcher laat ik vóór het klikken op “Launch Ads” zien wanneer de geselecteerde advertentieset ongeschikt is voor deze variant-flow, inclusief boodschap zoals:
- deze advertentieset gebruikt Dynamic Creative
- er staat al een advertentie in deze set
- kies een lege geschikte advertentieset om tekstvarianten onder één advertentie te uploaden

Daardoor weet je vooraf waarom het niet kan, in plaats van pas na een mislukte upload.

### 4. Resultaatmapping en logging aanscherpen
Ik zorg dat de response en status per creativebestand duidelijk maken:
- 1 bestand => 1 advertentie
- hoeveel tekstvarianten zijn meegestuurd
- waarom een bestand eventueel is geblokkeerd

Zo blijft de preview in de app overeenkomen met wat Meta daadwerkelijk accepteert.

## Verwacht resultaat
- Als de gekozen advertentieset geschikt is, worden je **tekstvarianten onder één advertentie** aangemaakt.
- Als de advertentieset dat niet ondersteunt, krijg je **direct een duidelijke blokkade** in de app in plaats van de generieke Meta-fout achteraf.
- De app doet dan dus niet meer alsof dit “gewoon zou moeten werken” terwijl Meta het voor die set afwijst.

## Technische details
- Bestanden: `supabase/functions/meta-upload-creative/index.ts`, `src/pages/client-workspace/AdLauncherTab.tsx`, mogelijk `src/components/ad-launcher/MetaSelectors.tsx` en/of `supabase/functions/meta-list-resources/index.ts`
- Geen database-migraties
- Geen nieuwe secrets
- De fix richt zich op correcte detectie van advertentieset-type + veilige branching van de creative payload

```text
UI selecteert campagne + ad set
        ↓
backend leest ad set details
        ↓
[geschikt]  -> 1 ad per bestand, met alle tekstvarianten gebundeld
[niet geschikt] -> duidelijke foutmelding vóór launch
```

## Belangrijke nuance
De echte fix is dus niet “blind opnieuw proberen”, maar de flow laten aansluiten op wat Meta voor dit type advertentieset toestaat. Zonder die check blijf je in dezelfde foutlus hangen.