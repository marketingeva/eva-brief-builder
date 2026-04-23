

# Ad Launcher — Searchable dropdowns, status badges, layout polish

## Wat ga ik bouwen

Op basis van je RapidAds-screenshots maak ik de selectie-velden krachtiger en de layout strakker.

### 1. Searchable dropdowns met status (campagnes + ad sets)
- Vervang de standaard `Select` voor **Campagne** en **Ad set** door een **Combobox** (Popover + Command) met:
  - Zoekveld bovenaan (`Search campaigns...` / `Search ad sets...`)
  - **Groen bolletje** voor `ACTIVE` items, grijs voor `PAUSED`, rood voor andere statussen
  - **Status-pill** naast de naam: `ABO` / `CBO` (afgeleid uit campagne `is_budget_optimized` / objective) of het ruwe statuslabel voor ad sets
  - **Sortering**: actieve items altijd bovenaan, daarna alfabetisch
- De geselecteerde optie toont in de trigger ook het bolletje + de naam

### 2. Edge function uitbreiding
- `meta-list-resources` geeft extra velden mee:
  - Campagnes: `daily_budget`, `lifetime_budget`, `bid_strategy` → om ABO/CBO af te leiden (als campagne een budget heeft = CBO, anders ABO)
  - Ad sets: `daily_budget`, `lifetime_budget` (al via status zichtbaar)
- Sorteer in de function: actief eerst, dan op naam

### 3. Lead forms — zelfde behandeling
- Ook searchable + status badge (`ACTIVE` lead forms bovenaan met groen bolletje)

### 4. Website URL default
- Initial `selection.link_url` wordt `'http://fb.me/'` (in plaats van leeg)
- Het input-veld toont deze waarde direct na laden van de tab

### 5. Visuele polish (op basis van screenshots)
**Launcher-header rechtsboven** (Preview & Launch card):
- "Uploading to **[KlantBadge]** / **[Campagne-badge]**" pill-rij bovenaan, met groene/paarse dot
- Knoppen: `+ Create Ad Set` (outline, disabled placeholder), `▶ Launch Ads` (primary, prominent), tandwiel-icoon (settings shortcut)
- Subtitel: "Preview {n} creatives ready to launch."

**Creative-rijen** (zoals screenshot 2):
- Grotere thumbnail (96px), bestandsnaam prominent
- Onder de naam: `1.99 MB · PNG · ● Ready` met status-dot
- Action-knoppen rechts als ronde icon-buttons: `P` (Primary text count), `H` (Headline count), `D` (Description count), bewerken (pen), verwijderen (prullenbak)

**Editing panel** (zoals screenshot 3):
- Header met thumbnail + bestandsnaam: "EDIT CREATIVE TEXTS"
- Toolbar bovenaan: `Copy From` / `Copy to All` / `Import` / `✨ Generate`
- Per veld een teller rechtsboven: `1 OF 5`
- "+ Add Variation" als volle-breedte knop onder elk veld
- Secties met uppercase labels: `PRIMARY TEXT`, `HEADLINE`, `DESCRIPTION`, `CALL TO ACTION`

## Bestanden die wijzigen

| Bestand | Wijziging |
|---|---|
| `supabase/functions/meta-list-resources/index.ts` | Extra velden, sortering actief-eerst, ABO/CBO afleiding |
| `src/components/ad-launcher/MetaSelectors.tsx` | Vervang Select door Combobox met search + status-dot + badge |
| `src/pages/client-workspace/AdLauncherTab.tsx` | Default `link_url='http://fb.me/'`, header-redesign, creative-rij styling |
| `src/components/ad-launcher/CreativeTextsPanel.tsx` | Toolbar (Copy From/To All/Import/Generate), `1 OF 5` tellers, full-width "Add Variation" |

Geen database-migraties nodig, geen nieuwe secrets.

