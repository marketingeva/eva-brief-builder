## Probleem

De laatste upload is technisch gelukt, maar de logs tonen dat de app alsnog een **page-backed Instagram-account** gebruikt:

```text
IG actor resolved via page.page_backed_instagram_accounts.page_token 17841404254570727
```

In je Meta-screenshot staat juist het echte beschikbare Instagram-profiel:

```text
rivaszorggroep — ID: 1646842048691596
```

Daardoor ziet Meta de advertentie alsof er geen echt Instagram-profiel op ad-niveau is gekozen.

## Plan

1. **Instagram Account ID als klantinstelling toevoegen**
   - Voeg bij Meta-instellingen een veld toe voor het Instagram Account ID.
   - Voor Rivas vullen we dit met `1646842048691596`.

2. **Upload-payload uitbreiden**
   - `AdLauncherTab` haalt naast Facebook Page ID ook het Instagram Account ID op.
   - Bij `Launch Ads` wordt dit ID meegestuurd naar `meta-upload-creative`.

3. **Edge function aanpassen**
   - De functie gebruikt eerst het expliciet ingestelde Instagram Account ID.
   - Alleen als dat veld leeg is, probeert de functie nog automatisch te resolven.
   - De page-backed fallback wordt niet meer stilletjes gebruikt voor directe creatives, omdat dat precies deze Meta-fout veroorzaakt.

4. **Betere foutmelding toevoegen**
   - Als er geen geldig Instagram Account ID is ingesteld, krijgt de gebruiker een duidelijke melding in de app:
     “Vul het Instagram Account ID in bij Meta-instellingen.”

5. **Verifiëren**
   - Na implementatie controleren we in de logs dat de functie `1646842048691596` gebruikt.
   - Daarna opnieuw launch testen en bevestigen dat Meta het Instagram-profiel correct herkent.

## Technische details

- Database: optionele kolom op `clients`, bijvoorbeeld `meta_instagram_account_id`.
- Frontend: `MetaSettingsDialog.tsx` en `AdLauncherTab.tsx` uitbreiden.
- Backend function: `supabase/functions/meta-upload-creative/index.ts` gebruikt de override vóór automatische lookup.