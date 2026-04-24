

# Fix: Alle ad sets onder een campagne laden

## Probleem
Het `name_filter` (clientnaam, bv. "Rivas") wordt nu ook toegepast op **ad sets** en **lead forms**. Ad sets onder de campagne "Rivas - Evergreen - Maart" heten echter "Algemeen", "Locatie - Sliedrecht", "Managementassistent" enz. — geen van die namen bevat "rivas", dus ze worden er allemaal uitgefilterd. Resultaat: veel ad sets ontbreken.

Bewijs uit het Meta-screenshot: 28 ad sets in deze campagne, met namen die de clientnaam niet bevatten.

## Oplossing
Het `name_filter` is alleen bedoeld om de juiste **campagnes per klant** te identificeren. Zodra een campagne is gekozen, zijn ad sets en lead forms al gescoped (per `campaign_id` resp. `page_id`) en hoeven niet nogmaals op clientnaam gefilterd te worden.

## Wijzigingen

**`supabase/functions/meta-list-resources/index.ts`**
- **Ad sets**: `matchesName(...)` filter verwijderen → álle 28 ad sets onder de campagne worden teruggegeven (alleen DELETED/ARCHIVED uitgesloten).
- **Lead forms**: idem — geen naamfilter, alleen status-filter.
- **Campaigns**: blijft ongewijzigd (filter op clientnaam blijft hier nodig).
- Sortering "ACTIVE eerst" blijft staan voor alle drie.

**`src/components/ad-launcher/MetaSelectors.tsx`**
- Frontend stuurt geen `name_filter` meer mee bij ad sets en lead forms (kost niets, maar maakt het expliciet).
- Effect-dependency `nameFilter` verwijderen uit ad set & lead form effects (voorkomt onnodig herladen).

## Verwacht resultaat
Voor campagne "Rivas - Evergreen - Maart" worden alle 28 ad sets ingeladen, met "Managementassistent" en "Algemeen" (ACTIVE) bovenaan, gevolgd door "Locatie - Sliedrecht" (Learning limited / PAUSED) en de overige PAUSED/Off ad sets daaronder, alfabetisch gesorteerd. Zoeken in de combobox blijft client-side werken via het `CommandInput` zoekveld.

Geen DB-migraties, geen nieuwe secrets.

