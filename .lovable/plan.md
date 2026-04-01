

# Fix Briefing Export & UI

## Problemen

1. **CSV export is rommelig** — geen kolombreedtes, geen text wrapping, strategische context als losse regels onderaan
2. **"Omschrijving (creatief format)"** veld staat boven de tabel en heeft geen functie → verwijderen
3. **Kolom-volgorde mismatch** — header toont `Hook, USP's, Omschrijving` maar body rendert `Hook, Omschrijving, USP's` (swapped)
4. **Afbeelding upload** staat technisch in de code maar is moeilijk zichtbaar door de kolom-mismatch

## Wijzigingen

### 1. Verwijder "Omschrijving (creatief format)" blok
- Regels 267-280 in `BriefingDetailView.tsx` verwijderen
- `formatDescription` state en gerelateerde save/export logica opschonen

### 2. Fix kolom-volgorde in tabel body
- Body rendert nu: `functie, locatie, hook, omschrijving, usps, creative_inspiratie`
- Header verwacht: `functie, locatie, hook, usps, omschrijving, creative_inspiratie`
- Fix: verander de loop op regel 367 van `['functie', 'locatie', 'hook', 'omschrijving']` naar `['functie', 'locatie', 'hook']`, en render USPs daarna, dan Omschrijving als apart veld, dan Creative inspiratie + afbeelding

### 3. Voeg aparte "Afbeelding" kolom toe aan tabel
- Nieuwe kolom "Inspiratie afbeelding" naast Creative inspiratie
- Toont thumbnail + upload knop duidelijk zichtbaar per rij
- Niet verstopt in dezelfde cel als de tekst

### 4. Verbeterde Excel export (XLSX in plaats van CSV)
- Gebruik `openpyxl` via een edge function of direct XLSX-compatible output
- Alternatief: verbeter de CSV zodat kolommen correct gescheiden zijn en multiline cellen werken
- Concrete fix: gebruik tab-separated values met juiste quoting, of genereer een echte `.xlsx` via een client-side library (`xlsx`/`SheetJS`)
- Kolombreedtes instellen, text wrap aan, header vet
- USP's als bullet-lijst in cel
- Strategische context als apart tabblad of koptekst-blok met lege rij ertussen
- Afbeelding URL als klikbare link in de cel

### Bestanden

| Bestand | Actie |
|---------|-------|
| `src/components/briefings/BriefingDetailView.tsx` | Verwijder format description, fix kolom-volgorde, split afbeelding kolom, XLSX export |
| `package.json` | Toevoegen: `xlsx` (SheetJS) voor client-side Excel generatie |

## Technische details

- SheetJS (`xlsx` npm package) voor client-side `.xlsx` generatie met `!cols` voor kolombreedtes en cell styles
- USP formatting: `• item1\n• item2` in de Excel cel met wrap text
- Strategische context → apart sheet of header-blok met lege rij separator
- Afbeelding kolom: toont thumbnail (80px) + upload knop in edit mode, URL in export

