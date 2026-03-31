

# AI Agent Team per Client

## Overzicht

Drie gespecialiseerde AI agents per client workspace, elk met een eigen rol. Ze draaien automatisch op triggers (upload, data-refresh) en zijn optioneel aanspreekbaar via een chat-interface.

```text
┌─────────────────────────────────────────────────┐
│  Client Workspace Tabs                          │
│  [Overzicht] [Learning] [Briefings] [Creatives] │
│  [Live Ads] [AI Team] ← NIEUW                   │
└─────────────────────────────────────────────────┘

AI Team tab:
┌──────────────┬──────────────┬──────────────────┐
│ 📊 Ads       │ 🔍 Trend     │ ✍️ Copywriter    │
│ Analyst      │ Scout        │                  │
│              │              │                  │
│ Analyseert   │ Scrapt Ads   │ Schrijft copy    │
│ campagne-    │ Library op   │ bij uploads van  │
│ resultaten   │ trends voor  │ de grafisch      │
│ en geeft     │ de zorg-     │ designer         │
│ aanbevelin-  │ sector       │                  │
│ gen          │              │                  │
├──────────────┴──────────────┴──────────────────┤
│ [Chat met agents]                               │
│ ┌────────────────────────────────────────────┐  │
│ │ Jij: Welke hooks werken het best bij VIG?  │  │
│ │ Analyst: Op basis van de laatste 30 dagen..│  │
│ └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## De drie agents

### 1. Ads Performance Analyst
- **Trigger**: Automatisch bij openen Live Ads tab of handmatig via chat
- **Input**: Meta API campagne-data (spend, impressions, clicks, leads, CPL) + client learnings
- **Output**: Performance samenvatting, winnende/verliezende ads, aanbevelingen voor optimalisatie
- **Opslaan**: Resultaten in nieuwe `agent_reports` tabel

### 2. Trend Scout (Ads Library)
- **Trigger**: Handmatig via chat ("scan trends voor VIG-zorg") of wekelijks
- **Input**: Facebook Ads Library API — zoekt op zorgorganisaties, concurrenten, en sector-keywords
- **Output**: Trending hooks, visuele stijlen, CTA-patronen in de zorgsector
- **Opslaan**: Trends in `agent_reports` tabel, bruikbaar als context voor de andere agents

### 3. Creative Copywriter
- **Trigger**: Automatisch bij nieuwe creative upload (bestaat al grotendeels als `analyze-creative`)
- **Input**: Geüploade afbeelding/video + volledige client Learning context
- **Output**: Primary text, headlines, CTA — al bestaande functionaliteit, wordt de "agent-versie"
- **Verbetering**: Gebruikt nu ook output van Analyst (wat werkt?) en Trend Scout (wat is trending?) als extra context

## Technisch plan

### Database

Nieuwe tabel `agent_reports`:
```sql
CREATE TABLE agent_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  agent_type TEXT NOT NULL, -- 'analyst', 'trend_scout', 'copywriter'
  report_type TEXT,         -- 'performance_summary', 'trend_scan', 'copy_generation'
  content JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Nieuwe tabel `agent_conversations` voor de chat:
```sql
CREATE TABLE agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  user_id UUID NOT NULL,
  agent_type TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Edge Functions

| Functie | Doel |
|---------|------|
| `agent-analyst` | Haalt Meta ads data op, analyseert met Lovable AI, slaat rapport op |
| `agent-trend-scout` | Zoekt in Facebook Ads Library API op zorg-keywords, analyseert patronen |
| `agent-chat` | Streaming chat endpoint — routeert naar juiste agent op basis van `agent_type`, injecteert client Learning context + eerdere rapporten |

De bestaande `analyze-creative` functie wordt hergebruikt/gerefactord als de Copywriter agent.

### Frontend

1. **Nieuwe tab "AI Team"** in `ClientWorkspace.tsx`
2. **Agent cards**: Drie kaarten met laatste rapport + status
3. **Chat interface**: Onderaan de pagina, agent-selectie via tabs/dropdown, streaming responses
4. **Auto-triggers**: Creative upload → Copywriter draait automatisch (al bestaand), Live Ads refresh → Analyst rapport optioneel

### Implementatievolgorde

1. Database migratie (2 tabellen + RLS)
2. `agent-analyst` edge function — performance analyse
3. `agent-trend-scout` edge function — Ads Library scanning
4. `agent-chat` edge function — streaming chat met context-injectie
5. `AI Team` tab UI met agent cards + chat
6. Koppel bestaande `analyze-creative` als Copywriter agent

## Benodigdheden

- **Meta Access Token**: Reeds geconfigureerd (`META_ACCESS_TOKEN` secret)
- **Facebook Ads Library API**: Gebruikt dezelfde Meta API token, endpoint `ads_archive`
- **Lovable AI**: Reeds beschikbaar (`LOVABLE_API_KEY`), gebruikt `google/gemini-3-flash-preview`
- **Geen extra API keys nodig**

