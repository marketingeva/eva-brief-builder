

# Waarom de Trend Scout geen echte advertenties vindt — en hoe dit op te lossen

## Het probleem

De huidige Trend Scout functie vindt **0 advertenties** omdat de Facebook Ads Library API verkeerd wordt aangesproken:

1. **`ad_type=POLITICAL_AND_ISSUE_ADS`** — De eerste loop zoekt alleen naar politieke advertenties, niet naar recruitment/vacature-advertenties
2. **Geen `ad_type` parameter** — De tweede loop laat dit weg, maar de API vereist dit veld expliciet
3. **Ontbrekende API-permissie** — Om ALLE advertenties (inclusief vacatures) te doorzoeken via `ad_type=ALL`, moet de Meta App de **`ads_read`** permissie hebben en een goedgekeurd review hebben doorlopen

## Wat er nodig is

### 1. Meta App permissies controleren
De `META_ACCESS_TOKEN` en `META_APP_ID` zijn al geconfigureerd. Maar voor de Ads Library API met `ad_type=ALL` heb je nodig:
- **`ads_read`** permissie op je Meta App (in Meta for Developers)
- De app moet door Meta zijn goedgekeurd voor Ads Library API toegang

**Alternatief als je die permissie niet hebt:** Je kunt `ad_type=POLITICAL_AND_ISSUE_ADS` gebruiken (werkt zonder review), maar dan vind je alleen politieke/issue-ads — niet de recruitment-ads die je zoekt.

### 2. Edge function fixen
Ongeacht de permissie-status, de code moet verbeterd worden:
- **`ad_type=ALL`** gebruiken in plaats van `POLITICAL_AND_ISSUE_ADS`
- **Betere zoektermen**: specifieke concurrenten/pagina-namen zoeken (bijv. "Buurtzorg", "ASZ", "Zorggroep Charim")
- **`search_page_ids`** parameter toevoegen om specifieke concurrenten te monitoren
- **Error logging** toevoegen zodat we zien wat de API precies teruggeeft

### 3. Fallback: zoeken op pagina-naam
Als `ad_type=ALL` niet beschikbaar is, kun je ook zoeken via de **Ads Library website scraping** als alternatief, of zoeken met `EMPLOYMENT_ADS` als ad_type (indien beschikbaar met jouw token).

## Implementatieplan

### Stap 1: API-toegang testen
- De edge function aanpassen om de exacte API-response te loggen (inclusief errors)
- Testen met `ad_type=ALL` om te zien of je token voldoende rechten heeft

### Stap 2: Edge function verbeteren
- `ad_type` parameter corrigeren naar `ALL`
- Zoektermen verfijnen: concurrenten-namen, specifieke zorgtermen
- Optioneel: `search_page_ids` toevoegen voor gerichte concurrent-monitoring
- Response errors loggen zodat je direct ziet waarom het faalt

### Stap 3: Als permissie ontbreekt
- Je moet in de [Meta for Developers](https://developers.facebook.com/) console de Ads Library API permissie aanvragen
- Dit is een review-proces dat enkele dagen kan duren

## Samenvatting

Het kernprobleem is dat de API wordt aangesproken met het verkeerde `ad_type`. De fix is technisch simpel (parameter wijzigen), maar het hangt af van of jouw Meta App de juiste permissies heeft. Ik kan de edge function direct updaten en testen om te zien wat er precies terugkomt van de API.

