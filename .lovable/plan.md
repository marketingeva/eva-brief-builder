## Wat gaan we doen

Drie aanpassingen, in deze volgorde:

### 1. Klantpagina tabbladen opschonen

In `src/pages/ClientWorkspace.tsx` de tabs-array reduceren tot alleen:
**Overzicht · Learning · Live Ads**

De rendering van `BriefingsTab`, `CreativesCopyTab` en `AITeamTab` haal ik uit de switch (de bestanden zelf laat ik staan — nog bereikbaar via de globale **Briefings** tool in de sidebar, en niet wegzouden andere features).

Ook in `src/pages/client-workspace/OverviewTab.tsx` de quick-action knoppen *Briefings*, *Creatives* en *AI Team* uit `quickActions` halen, zodat alleen Learning + Live Ads overblijven onder de klantnaam.

### 2. Care-type label verbergen voor Wijdezorg

In `ClientWorkspace.tsx` (regel 92-96) de `care_type` pill conditioneel verbergen wanneer de klantnaam Wijdezorg is. Andere klanten houden hun label gewoon.

```tsx
{client.care_type && client.name.toLowerCase() !== 'wijdezorg' && (...)}
```

### 3. Eva — globale AI-assistent (Jarvis-stijl)

**Plek in de UI:** in de sidebar footer (`AppLayout.tsx`), direct **boven** de `ThemeToggle`. Een opvallende Eva-knop met een kleine pulserende cirkel als icoon. Klikken opent een **fullscreen overlay** (geen route-wissel, blijft over de huidige pagina heen) zodat je Eva overal kunt aanroepen.

**De interface:**

```text
┌──────────────────────────────────────────────┐
│  ✕                                    Eva    │
│                                              │
│              ╭─────────╮                     │
│             ╱  ◉ ◉ ◉  ╲    ← levende       │
│            │  ◉◉◉◉◉◉◉  │     SVG-orb        │
│             ╲  ◉ ◉ ◉  ╱     (pulseert/      │
│              ╰─────────╯      glowt als     │
│                                praat)        │
│                                              │
│  ─────── chat history ────────────           │
│  Eva: Hoi, ik ben Eva. Vraag me iets…       │
│  Jij: Hoeveel leads had Wijdezorg…           │
│  Eva: Wijdezorg had 47 leads…                │
│                                              │
│  ┌────────────────────────────────────┐ ⌃   │
│  │ Vraag Eva iets...                  │ →   │
│  └────────────────────────────────────┘     │
└──────────────────────────────────────────────┘
```

- **Orb**: SVG met meerdere concentrische ringen + binnenste cirkel die op AI-state animeert
  - *idle*: zachte pulse, paarse gloed
  - *thinking*: ringen draaien sneller, gele accenten
  - *speaking*: golfpatroon, sterke glow
  - Pure CSS/SVG-animatie (geen extra dependencies)
- **Chat**: clean message-list met markdown rendering, streaming tokens, copy-knop per Eva-bericht
- **Input**: groot textarea aan de onderkant, Enter om te versturen, Shift+Enter voor nieuwe regel
- **Quick suggestions** bij lege chat: knoppen als "Hoe presteert Wijdezorg deze week?" / "Lanceer een advertentie voor…" / "Welke klant heeft de hoogste CTR?"

**Wat Eva kan (tool-calling):**

Eva is een nieuwe edge function `eva-chat` die OpenAI-compatible tool-calling gebruikt via Lovable AI Gateway (`google/gemini-3-flash-preview` als default, fallback `openai/gpt-5-mini` voor zware tool-loops). Eva krijgt een **agent-loop** die tools achter elkaar mag aanroepen tot het antwoord rond is. Tools die ik registreer:

| Tool | Doet |
|---|---|
| `list_clients` | Geeft alle klanten + slug + care_type |
| `get_client_summary(client_name_or_id)` | Klantprofiel: learning, USPs, locaties, brand |
| `get_live_ads_metrics(client_name?, date_range?)` | Roept intern `fetch-meta-ads` aan; geeft spend / leads / CTR / CPL terug, optioneel per klant |
| `list_active_campaigns(client_name?)` | Actieve Meta campagnes met basis-metrics |
| `toggle_campaign_status(campaign_id, active)` | Herbruikt `toggle-meta-status` edge function |
| `launch_ad(...)` | Stap-voor-stap: vraagt Eva eerst om bevestiging in chat (klant, campagne/adset, creative-URL of recente upload, copy, CTA) en roept dan `meta-upload-creative` aan |
| `create_adset(...)` | Roept `meta-create-adset` aan met de parameters die Eva via vraaggesprek heeft verzameld |
| `search_briefings(client_name?, week?)` | Geeft recente briefings terug |

Eva voert tools server-side uit (in de edge function) zodat geen API-keys naar de client lekken. Voor destructieve acties (launch_ad, toggle, create_adset) **vraagt Eva altijd eerst expliciet om "Ja, doe maar"** voordat de tool draait — system prompt regelt dit.

**Persistente conversatie:** nieuwe tabel `eva_conversations` (één rij per gebruiker met `messages jsonb`) zodat Eva context behoudt tussen sessies. RLS: gebruiker ziet alleen eigen rij.

**System prompt:** Eva is een Nederlandse, grounded recruitment-marketing assistent voor Eva AI Marketeer (sluit aan op de bestaande project-persona). Mag tools gebruiken, mag niet hallucineren over campagnes/cijfers, vraagt door bij onduidelijkheid, bevestigt destructieve acties.

**Streaming:** SSE token-by-token, met een aparte event-stream voor tool-call status (`🔧 Live Ads ophalen…`) zodat de gebruiker ziet wat Eva doet.

## Bestanden die ik aanmaak/aanpas

**Aanpassen**
- `src/pages/ClientWorkspace.tsx` — tabs reduceren + Wijdezorg-label verbergen
- `src/pages/client-workspace/OverviewTab.tsx` — quickActions reduceren
- `src/components/AppLayout.tsx` — Eva-knop boven ThemeToggle + overlay mounten

**Nieuw**
- `src/components/eva/EvaOverlay.tsx` — fullscreen overlay met chat
- `src/components/eva/EvaOrb.tsx` — geanimeerde Jarvis-orb (SVG)
- `src/components/eva/EvaMessage.tsx` — chat bubble met markdown
- `src/contexts/EvaContext.tsx` — open/close state, conversatie-state, streamhandler
- `supabase/functions/eva-chat/index.ts` — agent-loop met tool-calling
- DB-migratie: tabel `eva_conversations` (user_id, messages jsonb, updated_at) + RLS

## Aannames die ik maak

- "Creative and Coffee" = **Creatives & Copy** tab — die haal ik weg
- Eva-knop alleen in de globale sidebar (niet ook nog elders)
- Eva-overlay sluit met Esc of het kruisje, geen aparte route nodig
- Voor markdown installeer ik `react-markdown` + `remark-gfm` (lichtgewicht, breed gebruikt)

Klopt dit zo? Dan bouw ik het in deze volgorde: eerst stap 1+2 (snelle opschoning), dan Eva van backend → orb → chat → integratie in sidebar.