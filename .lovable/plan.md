## Design-analyse van de referentie

Wat valt op in de geüploade referentie-screenshots (de "Let's start strong!" en de fitness-dashboard mockups):

- **Sidebar**: pillvormige verticale navigatie met grote ronde icon-knoppen, één actieve knop in vol-gekleurd (oranje/groen) en de rest licht/donker. Iconen zijn groot, gecentreerd, met kleine tekstlabels eronder.
- **Cards**: zacht, "soft-UI"/neumorphic-achtig — zachte schaduwen, ruime border-radius (rounded-2xl/3xl), veel witruimte, dunne contouren, geen harde randen.
- **Typografie**: zeer grote, vette display headings ("Let's start strong!"), rustige subtekst, getallen krijgen visueel gewicht (groot + bold), labels klein en muted.
- **Iconen-pillen**: ronde witte chips met subtiele schaduw en een mini-icoontje binnenin (Workout / Meal / Water…), gebruikt als snelle navigatie/quick-actions.
- **Statistieken**: grote getallen + klein label-tekstje eronder; data-blokjes als losse cards naast elkaar i.p.v. één tabel.
- **Kleur-accent**: één signature-kleur (oranje in referentie) wordt gebruikt voor de actieve nav-pil, één call-to-action knop, en kleine progress-arcs. De rest is neutraal.
- **Ronde vormen**: sterk gebruik van pill-shapes (volledig ronde tabs/segmented controls voor Daily/Weekly/Monthly).

We vertalen deze stijl naar Eva: dezelfde **donkerpaarse sidebar** en **gele/paarse accenten** blijven, maar de vormgeving wordt zachter, ronder, ruimer.

## Scope: ongeveer de helft van de app

Doel is design-refresh, niet functioneel. We pakken de gedeelde "shell" + drie hoofd-pagina's aan, dat dekt visueel zo'n 50% van wat de gebruiker dagelijks ziet:

1. `src/components/AppLayout.tsx` — sidebar
2. `src/pages/BriefingsPage.tsx` — overzicht + detail-header
3. `src/pages/AdLauncherPage.tsx` — page-header
4. `src/pages/ClientWorkspace.tsx` — client-header + tabs
5. `src/pages/client-workspace/OverviewTab.tsx` — stats-cards + info-card

Niet aangeraakt deze ronde: BriefingTable, Creatives & Copy, Live Ads, AI Team, Learning-modules, dialogs. Functionaliteit, props, routes, queries en state blijven 1-op-1 hetzelfde.

## Visuele richting (behoud huidige kleuren)

- Behoud: donkerpaars (`--sidebar-background` 272 40% 16%), brand-paars `--primary` (272 56% 38%), geel-accent `--accent` (38 92% 55%), warm off-white `--background` (40 20% 97%).
- Toevoegen aan stijl-laag (geen kleurwijziging):
  - Zachtere, grotere radius op cards (`rounded-2xl`).
  - Lichtere, diffuse schaduwen (soft-shadow utility) i.p.v. de huidige `shadow-sm`.
  - Meer padding/whitespace in containers.
  - Ronde pill-knoppen (volledig `rounded-full`) voor segmented controls en quick-actions.
  - Grote display-headings (text-3xl/4xl, font-semibold, tracking-tight).

## Wijzigingen per bestand

### 1. `src/components/AppLayout.tsx` — Sidebar refresh
- Sidebar krijgt iets ruimere padding en zachtere afgeronde hoeken aan de rechterkant (`rounded-r-3xl`) zodat hij als een "floating panel" oogt tegen de off-white achtergrond.
- Tools (Ad Launcher, Briefings) worden grotere pill-buttons met een vierkant icoon-vlak links (rounded-xl) — actieve state krijgt geel accent-bar links of een vol-gele icoon-tile (gebruikt huidig `--sidebar-primary`).
- Client-list-items: het ronde initiaal-tegeltje wordt iets groter en krijgt bij de actieve client een gele rand.
- Search-input wordt volledig rond (`rounded-full`), iets lichter contrast.
- Footer (uitloggen + email) krijgt een dunne separator + meer adem.
- Collapsed-mode behouden, maar met zachtere transitie.

### 2. `src/pages/BriefingsPage.tsx` — Overzichtspagina
- Page-header met grote display heading "Briefings" (text-3xl, semibold) + subtekst.
- "Nieuwe week"-knop wordt een prominente pill-button met geel accent of paars (huidige primary), `rounded-full`, ruimere padding.
- Week-cards: `rounded-2xl`, zachtere shadow, hover-state met lichte lift (`hover:-translate-y-0.5 hover:shadow-md`), ruimere binnenpadding, week-nummer veel groter weergeven (text-2xl bold) als visueel anker.
- Status-badges per klant: pill-shape, iets zachter contrast.
- Detail-view header: ruimere whitespace, "Terug"-knop als ronde ghost-pill, titel groter, export-PDF-knop als pill met paarse fill.

### 3. `src/pages/AdLauncherPage.tsx` — Page-header
- Grote display-heading, ruimere top-padding.
- Klant-selector + Meta-instellingen rechts gegroepeerd in een lichte "control bar" met zachte achtergrond en `rounded-full` controls.
- Icon-tile naast titel wordt groter en krijgt een geel-naar-paars subtiele tint (binnen huidige palette).

### 4. `src/pages/ClientWorkspace.tsx` — Client-header + tabs
- Client-avatar wordt groter (h-12 w-12), met zachte ring.
- Naam in display-grootte, care_type als subtiel pill-label eronder.
- Learning-status badge wordt een echte ronde pill met icoontje + dot-indicator.
- Tabs onderaan de header worden een **pill-segmented control** (rounded-full container, actieve tab = gevulde paarse pill met witte tekst) i.p.v. de huidige underline-tabs. Iconen blijven zichtbaar.

### 5. `src/pages/client-workspace/OverviewTab.tsx` — Stats + info
- Drie stats-cards worden groter, met zachte schaduw, `rounded-2xl`, en tonen het getal in display-formaat (text-3xl bold) met klein muted label eronder — exact het patroon uit de referentie ("8 745 / Steps").
- Icoon-tile linksboven elke card wordt een rond chip (`rounded-xl`, h-11 w-11) met zachte gekleurde achtergrond.
- "Over {client}"-card krijgt ruimere binnenpadding, sectie-labels worden kleine uppercase chips.
- Eventueel een rij ronde "quick action"-iconen toevoegen bovenaan (Briefings, Creatives, Live Ads, AI Team) als snelkoppelingen — zelfde stijl als de Workout/Meal/Water-pillen in de referentie. Functioneel zijn dit gewoon `navigate()`-knoppen naar bestaande tabs.

## Stijl-laag (utility-toevoeging)

In `src/index.css` één nieuwe utility-klasse `.shadow-soft` toevoegen voor de zachte diffuse schaduw die in de referentie wordt gebruikt:

```text
.shadow-soft { box-shadow: 0 1px 2px rgba(40,20,60,.04), 0 8px 24px -8px rgba(40,20,60,.08); }
.shadow-soft-lg { box-shadow: 0 2px 4px rgba(40,20,60,.05), 0 16px 40px -12px rgba(40,20,60,.12); }
```

Geen Tailwind-config wijzigingen, geen nieuwe kleuren, geen fontwijziging (DM Sans blijft).

## Wat expliciet NIET verandert

- Routes, props, datastructuren, Supabase-queries, contexten.
- Kleurenpalet (paars/geel/off-white blijft identiek).
- Lettertype (DM Sans).
- Functionaliteit van knoppen (klik-handlers blijven 1-op-1).
- Briefing-tabel, Creatives & Copy, Live Ads, AI Team, Learning, alle dialogs.

## Resultaat

De gebruiker ziet bij de volgende preview een duidelijk frissere, zachtere, meer "premium soft-UI"-look in de sidebar, page-headers, client-header, tabs, en de Overzicht-tab van een client — terwijl alles blijft werken zoals nu. De andere helft van de app (de zwaardere werkschermen) volgt later in een tweede ronde als je tevreden bent over de richting.
