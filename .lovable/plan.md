

# Wekelijkse Auto-Briefing Workflow

## Wat verandert

De briefing-flow wordt omgedraaid: AI genereert **wekelijks automatisch** een concept-briefing per client op basis van alle beschikbare data (learnings, trend reports, analyst reports, rollen, USPs). De gebruiker kan optioneel handmatige input toevoegen, de briefing bewerken, goedkeuren en exporteren.

## Nieuwe flow

```text
Wekelijkse cron job (elke maandag)
        │
        ▼
AI genereert automatisch concept-briefing
(op basis van agent_reports, learnings, rollen, locaties, USPs)
        │
        ▼
Briefing verschijnt in lijst met status "draft"
        │
        ▼
Gebruiker opent briefing → bewerkbare preview
Optioneel: handmatige input toevoegen via inline formulier
        │
        ▼
Klik "In review" → status: "in_review"
        │
        ▼
Klik "Goedkeuren" → status: "approved"
Velden worden read-only, Export knop verschijnt
        │
        ▼
"Exporteer als CSV" → download
```

## Wijzigingen

### 1. Nieuwe edge function: `auto-generate-briefing`
- Wordt wekelijks getriggerd via `pg_cron` + `pg_net`
- Per client: haalt laatste `agent_reports` (trend scout + analyst), `client_learnings`, rollen, locaties, USPs op
- Genereert een concept-briefing via Lovable AI (Gemini) met dezelfde tool-calling structuur als `generate-briefing`
- Slaat op als `generated_briefings` met status `draft` en de juiste `week_number`
- Maakt bijbehorende `briefing_rows` aan

### 2. Database: pg_cron job aanmaken
- Elke maandag 07:00 UTC: HTTP POST naar `auto-generate-briefing`
- Gebruikt `pg_cron` + `pg_net` extensies

### 3. BriefingDetailView herschrijven — bewerkbare preview + approve flow
- **Status stepper** bovenaan: Draft → In Review → Approved (visuele 3-stappen indicator)
- **Inline editing**: alle content-velden worden textarea/input velden wanneer status niet `approved` is
- **Briefing rows**: tabelcellen worden bewerkbaar (input fields)
- **Handmatige input sectie**: uitklapbaar formulier bovenaan voor extra context (vacature-specifieke wensen, designer notes) — wordt opgeslagen als extra velden in `content`
- **Save knop**: slaat wijzigingen op naar `generated_briefings.content` en `briefing_rows`
- **Status knoppen**:
  - "Markeer als in review" (draft → in_review)
  - "Goedkeuren" (in_review → approved) — zet `approved_by` en `approved_at`
- **Export knop**: alleen zichtbaar bij status `approved`, download als CSV

### 4. BriefingsTab updaten
- Status labels/kleuren voor `in_review` toevoegen
- "Nieuw briefing" knop blijft bestaan voor handmatige briefings

### 5. generate-briefing edge function verrijken
- Agent reports (trend scout + analyst) ophalen en als extra context meegeven in de AI prompt
- Wordt gebruikt door zowel de handmatige als de automatische flow

## Bestanden

| Bestand | Actie |
|---------|-------|
| `supabase/functions/auto-generate-briefing/index.ts` | Nieuw — wekelijkse auto-generatie |
| `supabase/functions/generate-briefing/index.ts` | Update — agent_reports context toevoegen |
| `src/components/briefings/BriefingDetailView.tsx` | Herschrijven — editable + approve + export |
| `src/components/briefings/BriefingStatusStepper.tsx` | Nieuw — visuele status indicator |
| `src/pages/client-workspace/BriefingsTab.tsx` | Update — in_review status, labels |
| Database | pg_cron + pg_net extensies, cron job insert |
| `supabase/config.toml` | Toevoegen: `[functions.auto-generate-briefing]` |

## Technische details

- `pg_cron` schedule: `'0 7 * * 1'` (maandag 07:00 UTC)
- Auto-briefing loopt over alle clients in de `clients` tabel
- Status flow: `draft` → `in_review` → `approved`
- Approved briefings krijgen `approved_by` (user id) en `approved_at` (timestamp) — kolommen bestaan al
- Export: verbeterde CSV met alle briefing velden + rows

