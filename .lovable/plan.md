

# Trend Scout upgraden met Firecrawl scraping

## Wat verandert

De `agent-trend-scout` edge function wordt herschreven om **Firecrawl** te gebruiken in plaats van de Meta Ads Library API. Firecrawl scrapt de publieke Facebook Ads Library website direct — geen API-permissies nodig.

## Aanpak

### Flow

```text
Zoektermen (bijv. "verpleegkundige vacature", "Buurtzorg")
        │
        ▼  (per zoekterm)
┌──────────────────────────┐
│  Firecrawl Scrape        │  URL: facebook.com/ads/library/?q={term}&country=NL&ad_type=all
│  format: markdown        │
└──────────┬───────────────┘
           │  markdown content (advertentieteksten, paginanamen, etc.)
           ▼
┌──────────────────────────┐
│  Lovable AI (Gemini)     │  Analyseert alle gescrapete content
│  Trendrapport genereren  │
└──────────┬───────────────┘
           │
           ▼
     agent_reports tabel
```

### Stap 1: Edge function herschrijven (`agent-trend-scout/index.ts`)

- **Meta API code verwijderen** — geen `META_ACCESS_TOKEN` meer nodig
- **Firecrawl scraping toevoegen**: Per zoekterm de URL `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=NL&q={term}&media_type=all` scrapen via Firecrawl API (`FIRECRAWL_API_KEY`)
- **Markdown format**: Firecrawl retourneert pagina-inhoud als markdown — bevat advertentieteksten, paginanamen, datums
- **Rate limiting**: Max 5 zoektermen, sequentieel met korte delay om Firecrawl credits te besparen
- **Fallback**: Als Firecrawl geen content retourneert, AI alsnog een marktanalyse laten genereren op basis van sectorkennis
- **AI analyse**: Alle gescrapete markdown samenvoegen en naar Gemini sturen met hetzelfde analyseprompt (trending hooks, copy patronen, concurrentie-analyse, kansen, suggesties)
- **Opslag**: Rapport opslaan in `agent_reports` met metadata over scraped content

### Stap 2: Zoektermen optimaliseren

Default zoektermen worden:
- Client-naam (eigen ads monitoren)
- Specifieke concurrenten: "Buurtzorg", "Vivisol", "Aafje"
- Sector-termen: "verpleegkundige vacature", "zorg medewerker gezocht", "thuiszorg", "werken in de zorg"

### Wat er NIET verandert

- De AI analyse prompt blijft inhoudelijk gelijk
- Het rapport wordt op dezelfde manier opgeslagen in `agent_reports`
- De UI in het AI Team tab hoeft niet aangepast te worden
- Credits: ~5 Firecrawl credits per scan (1 per zoekterm)

## Technische details

- Firecrawl API endpoint: `https://api.firecrawl.dev/v1/scrape`
- Secret: `FIRECRAWL_API_KEY` (zojuist gekoppeld)
- Scrape opties: `formats: ['markdown']`, `onlyMainContent: true`, `waitFor: 3000` (Facebook laadt dynamisch)
- `LOVABLE_API_KEY` blijft nodig voor Gemini AI analyse

