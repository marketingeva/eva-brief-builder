# Dark Mode toevoegen

Een complete, premium dark mode toevoegen die naadloos werkt met de bestaande liquid-glass / Apple-esque stijl, met een toggle in de sidebar en correcte dark tokens voor alle UI-elementen.

## Wat de gebruiker krijgt

- **Theme toggle** in de sidebar footer (zon/maan icoon, naast de uitlog-knop), met drie standen: Licht / Donker / Systeem.
- **Voorkeur wordt onthouden** (localStorage) en respecteert de OS-instelling als fallback.
- **Geen flits van wit** bij paginalaad (FOUC voorkomen via inline script in `index.html`).
- **Alle elementen** kloppen in dark: sidebar, glass cards, headers, pills, tabs, briefing-tabel, dialogen, inputs, badges, hover-states, aurora-achtergrond.

## Hoe het eruitziet (donker)

- Achtergrond: diep paars-zwart (rond `hsl(272 25% 8%)`) met een subtielere aurora (paars + amber gloeden, lagere alpha).
- Cards / glass: donker frosted glas — `rgba(30, 20, 45, 0.55)` met `backdrop-filter: blur(20px)` en zachte witte 1px inner-glow voor de "liquid" rand.
- Tekst: zacht off-white (`hsl(270 15% 92%)`), muted-tekst lichter grijs-paars.
- Brand-paars en geel-accent blijven hetzelfde, maar krijgen iets hogere lichtheid in dark voor contrast.
- Sidebar wordt nog donkerder (bijna zwart-paars) zodat hij apart staat van de content.

## Technische uitvoering

### 1. `next-themes` provider opzetten
- Wrap de app in `ThemeProvider` (al geïnstalleerd, v0.3.0) in `src/main.tsx` of `src/App.tsx` met `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`.

### 2. Dark tokens in `src/index.css`
Voeg een `.dark` blok toe met dark varianten van alle CSS-variabelen:
```css
.dark {
  --background: 272 25% 8%;
  --foreground: 270 15% 92%;
  --card: 272 22% 12%;
  --card-foreground: 270 15% 92%;
  --popover: 272 22% 12%;
  --popover-foreground: 270 15% 92%;
  --primary: 272 70% 65%;       /* iets lichter paars voor contrast */
  --primary-foreground: 272 25% 10%;
  --secondary: 272 18% 18%;
  --secondary-foreground: 270 15% 92%;
  --muted: 272 18% 16%;
  --muted-foreground: 270 10% 65%;
  --accent: 38 92% 60%;
  --accent-foreground: 38 92% 12%;
  --destructive: 0 65% 55%;
  --destructive-foreground: 0 0% 100%;
  --border: 272 15% 22%;
  --input: 272 15% 22%;
  --ring: 272 70% 65%;
  --sidebar-background: 272 30% 6%;
  --sidebar-foreground: 270 12% 86%;
  --sidebar-primary: 38 92% 60%;
  --sidebar-primary-foreground: 38 92% 12%;
  --sidebar-accent: 272 25% 14%;
  --sidebar-accent-foreground: 270 12% 92%;
  --sidebar-border: 272 20% 16%;
  --sidebar-ring: 272 70% 65%;
  --success: 152 55% 50%;
  --warning: 38 92% 58%;
}
```

### 3. Liquid-glass utilities dark-aware maken
In `@layer utilities` van `src/index.css`, duplicate alle `.glass*` regels onder `.dark .glass*` met donkere `rgba` waarden, donkere borders en aangepaste schaduwen. De aurora krijgt ook een dark variant met lagere opacity gloeden.

```css
.dark .glass {
  background: rgba(30, 20, 45, 0.55);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 10px 30px -12px rgba(0, 0, 0, 0.5);
}
/* idem voor .glass-strong, .glass-pill, .glass-subtle, .glass-dark */

.dark .bg-aurora {
  background-color: hsl(var(--background));
  background-image:
    radial-gradient(at 12% 8%, hsl(var(--primary) / 0.18) 0px, transparent 55%),
    radial-gradient(at 88% 12%, hsl(var(--accent) / 0.10) 0px, transparent 55%),
    radial-gradient(at 78% 92%, hsl(272 70% 50% / 0.16) 0px, transparent 55%),
    radial-gradient(at 8% 88%, hsl(38 92% 50% / 0.06) 0px, transparent 55%);
}
```

### 4. Hardcoded `border-white/40`, `border-white/50` etc. semantisch maken
In `AppLayout.tsx`, `BriefingsPage.tsx`, `AdLauncherPage.tsx`, `ClientWorkspace.tsx`: vervang `border-white/40|50` door `border-border/60` (of `border-white/10` onder `.dark` via een dedicated utility) zodat randen ook in dark werken.

### 5. Theme toggle component
Nieuw bestand `src/components/ThemeToggle.tsx`: kleine knop met `Sun`/`Moon`/`Monitor` icoon (lucide), gebruikt `useTheme()` van `next-themes`, toont segmented pill of dropdown. Plaats hem in `AppLayout.tsx` boven de uitlog-knop.

### 6. FOUC-preventie
In `index.html` een klein inline `<script>` toevoegen vóór `<body>` dat direct `document.documentElement.classList.add('dark')` zet o.b.v. localStorage / `prefers-color-scheme`.

### 7. Spot-check componenten
Doorlopen en waar nodig fixen (alleen dark-incorrecte plekken):
- `BriefingTable`, `LiveAdsTab`, `AITeamTab`, `LearningTab`, `CreativesCopyTab` — checken op hardcoded `bg-white`, `text-black`, etc.
- `Login.tsx` — donkere variant header/card.
- `AddClientDialog`, `MetaSettingsDialog`, `NewWeekDialog`, `NewBriefingDialog` — dialogen gebruiken al `bg-popover` tokens dus zouden moeten werken.
- `CreativeUploadZone` — dropzone-achtergrond verifiëren.

## Bestanden die wijzigen

- `src/index.css` — dark tokens + dark glass/aurora utilities
- `src/main.tsx` (of `src/App.tsx`) — ThemeProvider wrapper
- `src/components/ThemeToggle.tsx` — nieuw
- `src/components/AppLayout.tsx` — toggle plaatsen + border tokens
- `src/pages/BriefingsPage.tsx` — border tokens
- `src/pages/AdLauncherPage.tsx` — border tokens
- `src/pages/ClientWorkspace.tsx` — border tokens
- `src/pages/Login.tsx` — kleine dark-tweaks waar nodig
- `index.html` — FOUC-preventie script

## Niet in scope

- Geen functionele wijzigingen, alleen visueel + theme-toggle.
- Geen wijzigingen aan brand-kleuren of typografie.
- Geen aparte "auto-switch op tijd"-feature; alleen Licht / Donker / Systeem.

Klaar om te bouwen?
