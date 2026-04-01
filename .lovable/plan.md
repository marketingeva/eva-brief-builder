

# Briefing Restructuur: Weekoverzicht + Verbeterde Export

## Wat verandert

De briefing-structuur wordt omgebouwd van "1 briefing per functie" naar **1 weekbriefing met alle functies in één overzichtelijke tabel**. De tabelweergave wordt de primaire view (niet de kaartjes). Export wordt professioneel en direct bruikbaar.

## Wijzigingen

### 1. BriefingDetailView herschrijven — tabel-first approach

- **Tabel wordt de standaard view** (geen toggle meer tussen kaart/tabel)
- **Strategische context** (creative richting, doelgroep, etc.) als compacte header boven de tabel, niet als aparte kaartjes
- **Tabel layout fixes**:
  - Alle cellen krijgen `whitespace-pre-wrap` en `word-break: break-word` — geen afgekapte tekst
  - Verwijder `truncate` en `max-w-[200px]` classes
  - Minimale kolombreedte per veld voor leesbaarheid
  - Textarea in edit-modus in plaats van single-line Input
- **USP's als bulletpoints**: USP-tekst splitsen op `\n` of `,` en renderen als `<ul><li>` in de cel
- **"Omschrijving" veld**: Eén overkoepelend veld in de strategische header voor het creatieve format (los van de per-rij omschrijving)
- **Creative inspiratie met afbeelding**: Voeg een upload-knop toe per rij in de `creative_inspiratie` kolom; afbeelding wordt opgeslagen in Supabase Storage en getoond als thumbnail in de cel

### 2. CSV/Excel export verbeteren

- **Volledig uitgeschreven teksten** — geen truncatie
- **USP's als bulletpoints**: In de CSV-cel met `\n• ` prefix per USP
- **Strategische context als apart blok** onder de functie-tabel (met duidelijke header)
- **BOM + UTF-8** voor correcte weergave in Excel/Sheets (al aanwezig)
- **Creative inspiratie afbeelding**: Als URL in de export-cel

### 3. BriefingsTab — weekoverzicht structuur

- Per week wordt **één briefing-kaart** getoond (niet per functie)
- Klik op een weekbriefing → opent de tabelweergave met alle functies van die week
- Titel wordt "Weekbriefing {nummer}" in plaats van functienaam
- Aantal functies als subtekst

### 4. briefing_rows tabel — afbeelding kolom

- Nieuwe kolom `creative_image_path` (text, nullable) toevoegen via migratie
- Wordt gebruikt voor de creative inspiratie afbeelding URL

### 5. Supabase Storage bucket

- Bucket `briefing-assets` aanmaken voor creative inspiratie afbeeldingen

## Bestanden

| Bestand | Actie |
|---------|-------|
| `src/components/briefings/BriefingDetailView.tsx` | Herschrijven — tabel-first, wrap text, USP bullets, image upload |
| `src/pages/client-workspace/BriefingsTab.tsx` | Update — weekoverzicht groepering |
| Database migratie | `creative_image_path` kolom + storage bucket |

## Technische details

- USP split logica: `usps.split(/[,\n]/).filter(Boolean)` → render als `<li>`
- Afbeelding upload via `supabase.storage.from('briefing-assets').upload()`
- Export: `\n• ` als bullet-separator in CSV cellen (Excel/Sheets-compatible)
- Tabel cellen: `min-w-[150px]` per content kolom, `whitespace-pre-wrap break-words`

