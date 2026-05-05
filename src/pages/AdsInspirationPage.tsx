import { useCallback, useEffect, useState } from 'react';
import {
  Sparkles, RefreshCw, Heart, ExternalLink, Loader2,
  CheckCircle2, Facebook, Instagram, PlayCircle, BadgeInfo, ChevronLeft, ChevronRight, Search,
  Bookmark, BookmarkCheck, Trash2, MapPin, Building2, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent,
} from '@/components/ui/dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const FIXED_QUERY = 'Verzorgende IG';
const GENERAL_CLIENT_VALUE = '__general__';
const ALL_LOCATIONS_VALUE = '__all__';

type HubTab = 'ad-library' | 'hooks' | 'saved';

function normalizeHookText(text: string): string {
  return (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

interface InspirationItem {
  id: string;
  search_id: string;
  advertiser_name: string | null;
  advertiser_page_url: string | null;
  advertiser_logo_url: string | null;
  ad_library_url: string | null;
  image_url: string | null;
  media_preview_url?: string | null;
  media_urls?: string[] | null;
  video_url?: string | null;
  snapshot_url?: string | null;
  primary_text: string | null;
  description?: string | null;
  external_id: string | null;
  started_running: string | null;
  headline?: string | null;
  cta?: string | null;
  media_type?: string | null;
  publisher_platforms?: string[] | null;
  hook_text?: string | null;
  hook_category?: string | null;
  is_hook_candidate?: boolean | null;
  raw_payload?: Record<string, unknown> | null;
}

const PAGE_SIZE = 12;

interface SearchRow {
  id: string;
  query: string;
  result_count: number;
  created_at: string;
  source_url?: string | null;
}


function getPreviewDimensions(url: string): { width: number; height: number } | null {
  const match = url.match(/(?:_|-)(?:s|p)(\d{2,4})x(\d{2,4})(?:_|\.|&|$)/i) || url.match(/[?&]stp=[^&]*(?:s|p)(\d{2,4})x(\d{2,4})/i);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

function getAdPreviewSrc(item: InspirationItem): string | null {
  const src = item.media_preview_url || item.image_url;
  if (!src) return null;
  const dimensions = getPreviewDimensions(src);
  if (dimensions && Math.max(dimensions.width, dimensions.height) <= 120) return null;
  return src;
}

function isVideoUrl(url: string | null | undefined): boolean {
  return !!url && /\.mp4(?:[?&]|$)|video|playable_url/i.test(url);
}

function isPortraitMedia(url: string | null | undefined): boolean {
  if (!url) return false;
  const dimensions = getPreviewDimensions(url);
  return !!dimensions && dimensions.height > dimensions.width * 1.2;
}

function isDestinationLabel(value: string | null | undefined): boolean {
  const text = (value || '').trim();
  return /^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/|\b)/i.test(text) && !/[?]/.test(text);
}

function looksLikePrimaryText(value: string | null | undefined): boolean {
  const text = (value || '').trim();
  if (!text || isDestinationLabel(text)) return false;
  return /[?]/.test(text) || /\b(?:jij|jouw|je|wil je|ben jij|word jij|zoek je|kom werken)\b/i.test(text);
}

function textFromRawPayload(raw: InspirationItem['raw_payload'], keys: string[]): string | null {
  if (!raw || typeof raw !== 'object') return null;
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function inferMissingHeadline(description: string | null | undefined): string | null {
  const text = (description || '').trim();
  if (/\bCareflex\b/i.test(text) && /\b(?:Helpende|Verzorgende IG|Verpleegkundige)\b/i.test(text)) {
    return 'Zorgprofessional bij Careflex';
  }
  return null;
}

function getDisplayTextParts(item: InspirationItem) {
  const rawDestination = textFromRawPayload(item.raw_payload, ['destination_label', 'link_caption', 'caption']);
  const rawHeadline = textFromRawPayload(item.raw_payload, ['link_title', 'headline']);
  const headlineIsDestination = isDestinationLabel(item.headline);
  const descriptionLooksPrimary = looksLikePrimaryText(item.description);

  // Repair older cached scrapes where Meta's order was captured as:
  // link-preview description -> destination URL -> primary text.
  if (headlineIsDestination && descriptionLooksPrimary) {
    return {
      primaryText: item.description,
      destinationLabel: item.headline,
      headline: rawHeadline && !isDestinationLabel(rawHeadline) ? rawHeadline : inferMissingHeadline(item.primary_text),
      description: item.primary_text,
      cta: item.cta && !isDestinationLabel(item.cta) ? item.cta : null,
    };
  }

  return {
    primaryText: item.primary_text,
    destinationLabel: rawDestination || (headlineIsDestination ? item.headline : null),
    headline: headlineIsDestination ? (rawHeadline && !isDestinationLabel(rawHeadline) ? rawHeadline : null) : item.headline,
    description: item.description,
    cta: item.cta && !isDestinationLabel(item.cta) ? item.cta : null,
  };
}

function getMediaUrls(item: InspirationItem): string[] {
  const fallback = getAdPreviewSrc(item);
  const urls = [item.video_url, ...(item.media_urls || []), fallback, item.image_url, item.media_preview_url]
    .filter(Boolean) as string[];
  const deduped = [...new Set(urls)];
  const filtered = deduped.filter((url) =>
    isVideoUrl(url) || !getPreviewDimensions(url) || Math.max(getPreviewDimensions(url)!.width, getPreviewDimensions(url)!.height) > 120,
  );
  // Always make sure we have at least one entry if any raw url exists, even if it looks like a logo
  if (filtered.length === 0 && deduped.length > 0) return [deduped[0]];
  return filtered;
}

interface GeneratedHook {
  id: string;
  hook_text: string;
  hook_category: string;
  rationale?: string;
}

interface ClientOption {
  id: string;
  name: string;
}

interface LocationOption {
  id: string;
  name: string;
  city: string | null;
}

interface SavedHookRow {
  id: string;
  client_id: string | null;
  location_id: string | null;
  location_label: string | null;
  role_query: string;
  hook_text: string;
  hook_category: string | null;
  rationale: string | null;
  created_at: string;
  client?: { name: string } | null;
}

export default function AdsInspirationPage() {
  const [activeTab, setActiveTab] = useState<HubTab>('ad-library');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState<SearchRow | null>(null);
  const [items, setItems] = useState<InspirationItem[]>([]);
  const [favorites, setFavorites] = useState<Record<string, string>>({});
  const [previewItem, setPreviewItem] = useState<InspirationItem | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const [activeQuery, setActiveQuery] = useState<string>('');
  const [queryInput, setQueryInput] = useState<string>('');
  const [generatedHooks, setGeneratedHooks] = useState<GeneratedHook[]>([]);
  const [hooksLoading, setHooksLoading] = useState(false);
  const [hooksRole, setHooksRole] = useState<string>('');
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [locationsByClient, setLocationsByClient] = useState<Record<string, LocationOption[]>>({});
  const [hookClient, setHookClient] = useState<string>(GENERAL_CLIENT_VALUE);
  const [hookLocation, setHookLocation] = useState<string>(ALL_LOCATIONS_VALUE);
  const [savedHooks, setSavedHooks] = useState<SavedHookRow[]>([]);
  const [savedHookKeys, setSavedHookKeys] = useState<Set<string>>(new Set());
  const [savedFavoriteItems, setSavedFavoriteItems] = useState<Array<{ favorite_id: string; client_id: string | null; client?: { name: string } | null; item: InspirationItem }>>([]);


  const resolvedClientId = hookClient === GENERAL_CLIENT_VALUE ? null : hookClient;
  const resolvedLocationId = hookLocation === ALL_LOCATIONS_VALUE ? null : hookLocation;
  const currentLocations = hookClient === GENERAL_CLIENT_VALUE ? [] : (locationsByClient[hookClient] || []);

  const loadFavorites = useCallback(async () => {
    const { data } = await supabase
      .from('inspiration_favorites')
      .select('id, item_id, client_id');
    const map: Record<string, string> = {};
    (data || []).forEach((f: any) => {
      // Use a composite key so the same item can be favorited under different clients
      const key = `${f.item_id}::${f.client_id || 'global'}`;
      map[key] = f.id;
    });
    setFavorites(map);
  }, []);

  const loadClients = useCallback(async () => {
    const { data } = await supabase.from('clients').select('id, name').order('name');
    setClients((data || []) as ClientOption[]);
  }, []);

  const loadLocationsForClient = useCallback(async (clientId: string) => {
    if (locationsByClient[clientId]) return;
    const { data } = await supabase
      .from('client_locations')
      .select('id, name, city')
      .eq('client_id', clientId)
      .order('name');
    setLocationsByClient((prev) => ({ ...prev, [clientId]: (data || []) as LocationOption[] }));
  }, [locationsByClient]);

  const loadSavedHooks = useCallback(async () => {
    const { data } = await supabase
      .from('saved_inspiration_hooks')
      .select('id, client_id, location_id, location_label, role_query, hook_text, hook_category, rationale, created_at, client:clients(name)')
      .order('created_at', { ascending: false });
    const rows = (data || []) as SavedHookRow[];
    setSavedHooks(rows);
    setSavedHookKeys(new Set(rows.map((r) => `${r.client_id || 'global'}::${normalizeHookText(r.hook_text)}`)));
  }, []);

  const loadSavedFavoriteItems = useCallback(async () => {
    const { data: favs } = await supabase
      .from('inspiration_favorites')
      .select('id, item_id, client_id, client:clients(name)')
      .order('created_at', { ascending: false });
    const itemIds = [...new Set((favs || []).map((f: any) => f.item_id))];
    if (itemIds.length === 0) {
      setSavedFavoriteItems([]);
      return;
    }
    const { data: rawItems } = await supabase
      .from('inspiration_items')
      .select('*')
      .in('id', itemIds);
    const itemMap = new Map<string, InspirationItem>();
    (rawItems || []).forEach((it: any) => itemMap.set(it.id, it as InspirationItem));
    setSavedFavoriteItems(
      (favs || [])
        .map((f: any) => {
          const item = itemMap.get(f.item_id);
          return item ? { favorite_id: f.id, client_id: f.client_id, client: f.client, item } : null;
        })
        .filter(Boolean) as Array<{ favorite_id: string; client_id: string | null; client?: { name: string } | null; item: InspirationItem }>
    );
  }, []);


  const generateHooks = useCallback(async (role: string) => {
    const trimmed = role.trim();
    if (!trimmed) return;
    setHooksLoading(true);
    setHooksRole(trimmed);
    try {
      const { data, error } = await supabase.functions.invoke('generate-hooks-inspiration', {
        body: { role: trimmed },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setGeneratedHooks(data.hooks || []);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Hooks genereren mislukt');
    } finally {
      setHooksLoading(false);
    }
  }, []);

  const loadHub = useCallback(async (forceRefresh = false, queryOverride?: string) => {
    const queryToUse = (queryOverride ?? activeQuery).trim() || FIXED_QUERY;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-ads-inspiration', {
        body: { forceRefresh, tab: activeTab, query: queryToUse },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSearch(data.search || null);
      setItems(data.items || []);
      setVisibleCount(PAGE_SIZE);
      if (forceRefresh) toast.success('Ad Library vernieuwd');
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Meta Ad Library ophalen mislukt');
    } finally {
      setLoading(false);
    }
  }, [activeTab, activeQuery]);

  useEffect(() => {
    if (!activeQuery) return;
    (async () => {
      const { data: latest } = await supabase
        .from('inspiration_searches')
        .select('id, query, result_count, created_at, source_url')
        .eq('query', activeQuery)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest) setSearch(latest as SearchRow);
    })();
  }, [activeQuery]);

  useEffect(() => {
    if (!activeQuery) return;
    setVisibleCount(PAGE_SIZE);
    loadHub(false);
  }, [loadHub, activeQuery]);

  const submitQuery = (e?: React.FormEvent) => {
    e?.preventDefault();
    const next = queryInput.trim();
    if (!next || next === activeQuery) return;
    setActiveQuery(next);
  };

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites, items.length]);

  useEffect(() => {
    loadClients();
    loadSavedHooks();
    loadSavedFavoriteItems();
  }, [loadClients, loadSavedHooks, loadSavedFavoriteItems]);

  useEffect(() => {
    if (hookClient !== GENERAL_CLIENT_VALUE) {
      loadLocationsForClient(hookClient);
    }
    setHookLocation(ALL_LOCATIONS_VALUE);
  }, [hookClient, loadLocationsForClient]);

  const favoriteKeyFor = (itemId: string, clientId: string | null) => `${itemId}::${clientId || 'global'}`;

  const isItemFavorited = (itemId: string) => {
    return Object.keys(favorites).some((k) => k.startsWith(`${itemId}::`));
  };

  const removeAllFavoritesForItem = async (itemId: string) => {
    const ids = Object.entries(favorites)
      .filter(([k]) => k.startsWith(`${itemId}::`))
      .map(([, v]) => v);
    if (ids.length === 0) return;
    const { error } = await supabase.from('inspiration_favorites').delete().in('id', ids);
    if (error) {
      toast.error('Verwijderen mislukt');
      return;
    }
    setFavorites((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (k.startsWith(`${itemId}::`)) delete next[k]; });
      return next;
    });
    loadSavedFavoriteItems();
  };

  const saveFavoriteWithContext = async (item: InspirationItem, clientId: string | null) => {
    const key = favoriteKeyFor(item.id, clientId);
    if (favorites[key]) {
      toast.info('Al bewaard voor deze context');
      return;
    }
    const { data, error } = await supabase
      .from('inspiration_favorites')
      .insert({ item_id: item.id, client_id: clientId })
      .select('id')
      .single();
    if (error) {
      toast.error('Opslaan mislukt');
      return;
    }
    setFavorites((prev) => ({ ...prev, [key]: data.id }));
    const clientName = clientId ? clients.find((c) => c.id === clientId)?.name : null;
    toast.success(clientName ? `Bewaard voor ${clientName}` : 'Bewaard als algemeen');
    loadSavedFavoriteItems();
  };

  const saveHook = async (hook: GeneratedHook) => {
    const locationLabel = resolvedLocationId
      ? currentLocations.find((l) => l.id === resolvedLocationId)?.name || null
      : (resolvedClientId ? 'Alle locaties' : null);

    const { error } = await supabase
      .from('saved_inspiration_hooks')
      .insert({
        client_id: resolvedClientId,
        location_id: resolvedLocationId,
        location_label: locationLabel,
        role_query: hooksRole,
        hook_text: hook.hook_text,
        hook_category: hook.hook_category || null,
        rationale: hook.rationale || null,
      });

    if (error) {
      toast.error('Opslaan mislukt');
      return;
    }

    const clientName = resolvedClientId ? clients.find((c) => c.id === resolvedClientId)?.name : null;
    const ctxParts = [clientName || 'Algemeen', locationLabel].filter(Boolean);
    toast.success(`Hook bewaard (${ctxParts.join(' · ')})`);
    loadSavedHooks();
  };

  const deleteSavedHook = async (id: string) => {
    const { error } = await supabase.from('saved_inspiration_hooks').delete().eq('id', id);
    if (error) {
      toast.error('Verwijderen mislukt');
      return;
    }
    toast.success('Verwijderd');
    loadSavedHooks();
  };

  const deleteSavedFavorite = async (favoriteId: string) => {
    const { error } = await supabase.from('inspiration_favorites').delete().eq('id', favoriteId);
    if (error) {
      toast.error('Verwijderen mislukt');
      return;
    }
    toast.success('Verwijderd');
    loadFavorites();
    loadSavedFavoriteItems();
  };


  return (
    <div className="p-8 max-w-[1440px] mx-auto space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Inspiration Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeTab === 'ad-library' && (activeQuery
              ? <>Meta Ad Library inspiratie voor <span className="text-foreground font-medium">{activeQuery}</span></>
              : <>Voer een zoekterm in om Meta Ad Library te doorzoeken</>)}
            {activeTab === 'hooks' && <>Confronterende hooks gegenereerd op basis van een functie</>}
            {activeTab === 'saved' && <>Al je opgeslagen advertenties en hooks op één plek</>}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {activeTab === 'ad-library' && (
            <>
              <form onSubmit={submitQuery} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder="Zoekterm, bv. Verzorgende IG"
                  className="h-9 pl-8 pr-3 w-[260px] rounded-full text-xs bg-background"
                />
              </form>
              <Button onClick={() => loadHub(true)} disabled={loading || !activeQuery} className="rounded-full h-9 text-xs">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Vernieuwen uit Meta Ad Library
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { key: 'ad-library', label: 'Ad Library' },
            { key: 'hooks', label: 'Hooks' },
            { key: 'saved', label: 'Opgeslagen' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'h-10 px-4 rounded-full text-sm transition-colors',
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground shadow-soft'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'ad-library' && (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <BadgeInfo className="h-3.5 w-3.5" />
            {search ? `${search.result_count} advertenties opgeslagen` : 'Bron wordt geladen'}
          </div>
        )}
        {activeTab === 'saved' && (
          <div className="text-xs text-muted-foreground">
            {savedHooks.length} hooks · {savedFavoriteItems.length} advertenties
          </div>
        )}
      </div>


      <section className="rounded-3xl border border-border/60 bg-card p-5 space-y-4">
        {activeTab === 'ad-library' ? (
          <>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Bron</p>
                <p className="text-sm font-medium text-foreground mt-1">Meta Ad Library{activeQuery ? ` · ${activeQuery}` : ''} · Nederland · Employment</p>
              </div>
              {search?.source_url && (
                <a href={search.source_url} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm" className="rounded-full text-xs">
                    <ExternalLink className="h-3 w-3 mr-1" /> Open bron
                  </Button>
                </a>
              )}
            </div>

            {!activeQuery ? (
              <EmptyState label="Voer een zoekterm in (bv. Verzorgende IG) en druk op Enter om te zoeken" />
            ) : loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="rounded-2xl h-[520px]" />
                ))}
              </div>
            ) : items.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
                  {items.slice(0, visibleCount).map((item) => (
                    <AdLibraryCard
                      key={item.id}
                      item={item}
                      isFavorite={isItemFavorited(item.id)}
                      clients={clients}
                      locationsByClient={locationsByClient}
                      onLoadLocations={loadLocationsForClient}
                      onSaveWithContext={(clientId) => saveFavoriteWithContext(item, clientId)}
                      onUnfavorite={() => removeAllFavoritesForItem(item.id)}
                      onPreview={() => setPreviewItem(item)}
                    />
                  ))}
                </div>
                {visibleCount < items.length && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      className="rounded-full text-xs"
                      onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                    >
                      Meer laden ({items.length - visibleCount})
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState label="Geen advertenties gevonden" />
            )}
          </>
        ) : activeTab === 'hooks' ? (
          <HooksGenerator
            loading={hooksLoading}
            hooks={generatedHooks}
            role={hooksRole}
            onGenerate={generateHooks}
            onSave={saveHook}
            isSaved={(text) => savedHookKeys.has(`${resolvedClientId || 'global'}::${normalizeHookText(text)}`)}
            clients={clients}
            currentLocations={currentLocations}
            hookClient={hookClient}
            hookLocation={hookLocation}
            onClientChange={setHookClient}
            onLocationChange={setHookLocation}
          />
        ) : (
          <SavedOverview
            savedHooks={savedHooks}
            savedFavoriteItems={savedFavoriteItems}
            onDeleteHook={deleteSavedHook}
            onDeleteFavorite={deleteSavedFavorite}
            onPreview={(item) => setPreviewItem(item)}
          />
        )}
      </section>

      <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-background/95 backdrop-blur-xl">
          {previewItem && (
            <div className="grid md:grid-cols-[1.1fr_0.9fr] gap-0">
      <div className="bg-muted/30 p-4 flex items-start justify-center max-h-[82vh] overflow-auto">
                <AdMediaFrame
                  urls={getMediaUrls(previewItem)}
                  label={previewItem.advertiser_name || 'Advertentie preview'}
                  fallbackItem={previewItem}
                  mode="detail"
                />
              </div>

              <div className="p-6 space-y-4 max-h-[82vh] overflow-auto">
                <div className="flex items-center gap-3">
                  {previewItem.advertiser_logo_url ? (
                    <img src={previewItem.advertiser_logo_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground">
                      {(previewItem.advertiser_name || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-foreground">{previewItem.advertiser_name || 'Onbekend'}</p>
                    <p className="text-xs text-muted-foreground">Sponsored</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="rounded-full">Active</Badge>
                  {previewItem.media_type === 'video' && (
                    <Badge variant="secondary" className="rounded-full">Video</Badge>
                  )}
                </div>

                {previewItem.started_running && (
                  <p className="text-xs text-muted-foreground">Started running on {previewItem.started_running}</p>
                )}

                {(() => {
                  const { primaryText, destinationLabel, headline, description, cta } = getDisplayTextParts(previewItem);
                  return (
                    <>
                      {primaryText && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Primary text</p>
                          <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">{primaryText}</p>
                        </div>
                      )}

                      {destinationLabel && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Bestemming</p>
                          <p className="text-sm text-foreground/85">{destinationLabel}</p>
                        </div>
                      )}

                      {headline && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Headline</p>
                          <p className="text-sm font-semibold text-foreground leading-snug">{headline}</p>
                        </div>
                      )}

                      {description && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Beschrijving</p>
                          <p className="text-sm text-foreground/85 whitespace-pre-wrap leading-relaxed">{description}</p>
                        </div>
                      )}

                      {cta && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">CTA</p>
                          <Badge variant="secondary" className="rounded-full">{cta}</Badge>
                        </div>
                      )}
                    </>
                  );
                })()}

                {previewItem.hook_text && activeTab === 'hooks' && (
                  <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 space-y-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Hook</p>
                    <p className="text-sm font-medium text-foreground">{previewItem.hook_text}</p>
                    {previewItem.hook_category && (
                      <p className="text-xs text-muted-foreground">Categorie: {previewItem.hook_category}</p>
                    )}
                  </div>
                )}

                {/* Platformen sectie verwijderd – meestal leeg */}

                <div className="flex gap-2 pt-2 flex-wrap">
                  {previewItem.ad_library_url && (
                    <a href={previewItem.ad_library_url} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm" className="rounded-full text-xs">
                        <ExternalLink className="h-3 w-3 mr-1" /> In Ads Library
                      </Button>
                    </a>
                  )}
                  <SaveContextPopover
                    isFavorite={isItemFavorited(previewItem.id)}
                    clients={clients}
                    locationsByClient={locationsByClient}
                    onLoadLocations={loadLocationsForClient}
                    onSave={(clientId) => saveFavoriteWithContext(previewItem, clientId)}
                    onUnfavorite={() => removeAllFavoritesForItem(previewItem.id)}
                    triggerSize="sm"
                  />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdLibraryCard({
  item,
  isFavorite,
  clients,
  locationsByClient,
  onLoadLocations,
  onSaveWithContext,
  onUnfavorite,
  onPreview,
}: {
  item: InspirationItem;
  isFavorite: boolean;
  clients: ClientOption[];
  locationsByClient: Record<string, LocationOption[]>;
  onLoadLocations: (clientId: string) => Promise<void> | void;
  onSaveWithContext: (clientId: string | null) => Promise<void> | void;
  onUnfavorite: () => Promise<void> | void;
  onPreview: () => void;
}) {
  const mediaUrls = getMediaUrls(item);
  const platforms = item.publisher_platforms || [];
  const isCarousel = item.media_type === 'carousel' || mediaUrls.length > 1;
  const isVideo = item.media_type === 'video' || !!item.video_url || mediaUrls.some(isVideoUrl);
  const { primaryText, destinationLabel, headline, description, cta } = getDisplayTextParts(item);
  const advertiserDisplay = item.advertiser_name && item.advertiser_name.trim().length > 1
    ? item.advertiser_name
    : 'Onbekend';
  const hasFooter = !!(destinationLabel || headline || description || cta);

  return (
    <div className="group rounded-2xl overflow-hidden bg-card border border-border/60 hover:border-border transition-all hover:shadow-md flex flex-col">
      <div className="px-4 pt-4 pb-3 space-y-1.5 relative">
        <div className="absolute top-3 right-3 z-10">
          <SaveContextPopover
            isFavorite={isFavorite}
            clients={clients}
            locationsByClient={locationsByClient}
            onLoadLocations={onLoadLocations}
            onSave={onSaveWithContext}
            onUnfavorite={onUnfavorite}
            triggerSize="icon"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            <span className="text-[11px] font-medium text-foreground">Active</span>
          </div>
          {isVideo && <Badge variant="secondary" className="rounded-full text-[10px] px-2 py-0">Video</Badge>}
          {isCarousel && !isVideo && <Badge variant="secondary" className="rounded-full text-[10px] px-2 py-0">Carousel</Badge>}
          {platforms.includes('FACEBOOK') && <Facebook className="h-3 w-3 text-muted-foreground" />}
          {platforms.includes('INSTAGRAM') && <Instagram className="h-3 w-3 text-muted-foreground" />}
        </div>

        {item.external_id && (
          <p className="text-[11px] text-muted-foreground">Library ID: {item.external_id}</p>
        )}
        {item.started_running && (
          <p className="text-[11px] text-muted-foreground">Gestart op {item.started_running}</p>
        )}
      </div>

      <div className="h-px bg-border/60 mx-4" />

      <div className="px-4 py-3 flex items-center gap-2.5">
        {item.advertiser_logo_url ? (
          <img src={item.advertiser_logo_url} alt="" className="h-9 w-9 rounded-full object-cover bg-muted" />
        ) : (
          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold text-muted-foreground">
            {advertiserDisplay.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground truncate">{advertiserDisplay}</p>
          <p className="text-[11px] text-muted-foreground">Sponsored</p>
        </div>
        {item.ad_library_url && (
          <a href={item.ad_library_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-foreground">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {primaryText && (
        <button
          type="button"
          onClick={onPreview}
          className="px-4 pb-3 text-left w-full hover:bg-muted/20 transition-colors group/text"
        >
          <p className="text-xs text-foreground/85 leading-relaxed whitespace-pre-wrap line-clamp-6">{primaryText}</p>
          {primaryText.length > 280 && (
            <span className="text-[11px] text-primary font-medium mt-1 inline-block group-hover/text:underline">
              Lees meer
            </span>
          )}
        </button>
      )}

      <AdMediaFrame urls={mediaUrls} label={advertiserDisplay} onOpen={onPreview} fallbackItem={item} />

      {hasFooter && (
        <div className="px-4 py-3 border-t border-border/60 flex flex-col gap-1.5">
          {destinationLabel && (
            <p className="text-[10px] font-medium uppercase text-muted-foreground leading-none truncate">{destinationLabel}</p>
          )}
          {headline && (
            <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{headline}</p>
          )}
          {description && (
            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">{description}</p>
          )}
          {cta && (
            <div className="flex justify-end pt-1">
              <span className="text-[10px] uppercase tracking-wide text-primary font-semibold whitespace-nowrap rounded-full bg-primary/10 px-2.5 py-1">
                {cta}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AdMediaFrame({
  urls,
  label,
  onOpen,
  fallbackItem,
  mode = 'card',
}: {
  urls: string[];
  label: string;
  onOpen?: () => void;
  fallbackItem?: InspirationItem;
  mode?: 'card' | 'detail';
}) {
  const [index, setIndex] = useState(0);
  const activeUrl = urls[index] || null;
  const hasMultiple = urls.length > 1;
  const activeIsVideo = isVideoUrl(activeUrl);
  const isStory = fallbackItem?.media_type === 'story';

  const goTo = (nextIndex: number) => {
    const total = urls.length;
    if (!total) return;
    setIndex((nextIndex + total) % total);
  };

  // Vaste container-hoogte zoals Meta Ad Library: alle creatives (1:1, 4:5, 9:16)
  // worden via object-contain in dezelfde frame-hoogte gepast.
  const frameAspect = mode === 'card' ? 'aspect-[4/5]' : '';

  return (
    <div className={cn(
      'w-full overflow-hidden relative bg-muted/30',
      mode === 'detail'
        ? 'rounded-lg flex items-center justify-center max-h-[76vh]'
        : `${frameAspect} flex items-center justify-center`
    )}>
      {activeUrl ? (
        activeIsVideo ? (
          <video src={activeUrl} controls playsInline preload="metadata" className="w-full h-full object-contain" />
        ) : (
          <button onClick={onOpen} className={cn('block w-full h-full', mode === 'detail' && 'cursor-zoom-out')}>
            <img
              src={activeUrl}
              alt={label}
              className={cn(
                'block w-full h-full object-contain transition-transform duration-300',
                mode === 'detail' ? 'max-h-[76vh]' : 'group-hover:scale-[1.01]'
              )}
              loading="lazy"
            />
          </button>
        )
      ) : (
        <button
          onClick={onOpen}
          className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center bg-gradient-to-br from-muted/40 via-muted/20 to-background"
        >
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <PlayCircle className="h-6 w-6 text-primary/70" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-foreground">{isStory ? 'Story-formaat' : 'Geen preview beschikbaar'}</p>
            <p className="text-[11px] text-muted-foreground">Open in Meta Ad Library voor de volledige creatieve weergave</p>
          </div>
        </button>
      )}

      {activeIsVideo && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-background/85 border border-border/70 px-2 py-1 flex items-center gap-1 text-[10px] font-medium text-foreground">
          <PlayCircle className="h-3 w-3" /> Video
        </div>
      )}

      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/85 border border-border/70 flex items-center justify-center text-foreground shadow-sm hover:bg-background"
            aria-label="Vorige carousel slide"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/85 border border-border/70 flex items-center justify-center text-foreground shadow-sm hover:bg-background"
            aria-label="Volgende carousel slide"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-1.5">
            {urls.map((url, dotIndex) => (
              <button
                key={`${url}-${dotIndex}`}
                type="button"
                onClick={() => setIndex(dotIndex)}
                className={cn(
                  'h-1.5 rounded-full transition-all bg-background/75 border border-border/70',
                  dotIndex === index ? 'w-5' : 'w-1.5 opacity-70'
                )}
                aria-label={`Carousel slide ${dotIndex + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function HooksGenerator({
  loading,
  hooks,
  role,
  onGenerate,
  onSave,
  isSaved,
  saveContextLabel,
}: {
  loading: boolean;
  hooks: GeneratedHook[];
  role: string;
  onGenerate: (role: string) => void;
  onSave: (hook: GeneratedHook) => void;
  isSaved: (text: string) => boolean;
  saveContextLabel: string;
}) {
  const [input, setInput] = useState('');

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const v = input.trim();
    if (!v || loading) return;
    onGenerate(v);
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Genereer hooks</p>
        <p className="text-sm text-muted-foreground mt-1">
          Vul een functie in (bv. <span className="text-foreground font-medium">Verzorgende IG</span>, <span className="text-foreground font-medium">BBL Verpleegkunde</span>, <span className="text-foreground font-medium">Helpende Plus</span>) en genereer 12 confronterende hooks.
        </p>
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[260px] max-w-[480px]">
          <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary pointer-events-none" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Functie, bv. Verzorgende IG"
            className="h-10 pl-9 pr-3 rounded-full text-sm bg-background"
          />
        </div>
        <Button type="submit" disabled={loading || !input.trim()} className="rounded-full h-10 text-xs">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
          Genereer hooks
        </Button>
      </form>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="rounded-2xl h-[180px]" />
          ))}
        </div>
      ) : hooks.length > 0 ? (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              {hooks.length} hooks voor <span className="text-foreground font-medium">{role}</span>
            </p>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Bookmark className="h-3 w-3" /> Bewaarcontext: <span className="text-foreground font-medium">{saveContextLabel}</span>
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {hooks.map((h) => {
              const saved = isSaved(h.hook_text);
              return (
                <div
                  key={h.id}
                  className="rounded-2xl border border-border/60 bg-background p-5 hover:border-border hover:shadow-md transition-all flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="secondary" className="rounded-full text-[11px]">
                      {h.hook_category || 'Algemeen'}
                    </Badge>
                    <Button
                      type="button"
                      variant={saved ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => onSave(h)}
                      disabled={saved}
                      className="rounded-full h-7 text-[11px] px-2.5"
                    >
                      {saved ? (
                        <><BookmarkCheck className="h-3 w-3 mr-1" /> Bewaard</>
                      ) : (
                        <><Bookmark className="h-3 w-3 mr-1" /> Bewaar</>
                      )}
                    </Button>
                  </div>
                  <p className="text-base font-medium text-foreground leading-snug flex-1">
                    {h.hook_text}
                  </p>
                  {h.rationale && (
                    <p className="text-xs text-muted-foreground leading-relaxed pt-2 border-t border-border/60">
                      {h.rationale}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyState label="Vul een functie in en genereer hooks om te starten" />
      )}
    </div>
  );
}

function SavedOverview({
  savedHooks,
  savedFavoriteItems,
  onDeleteHook,
  onDeleteFavorite,
  onPreview,
}: {
  savedHooks: SavedHookRow[];
  savedFavoriteItems: Array<{ favorite_id: string; client_id: string | null; client?: { name: string } | null; item: InspirationItem }>;
  onDeleteHook: (id: string) => void;
  onDeleteFavorite: (id: string) => void;
  onPreview: (item: InspirationItem) => void;
}) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Opgeslagen hooks
            <span className="text-xs font-normal text-muted-foreground">({savedHooks.length})</span>
          </h2>
        </div>
        {savedHooks.length === 0 ? (
          <EmptyState label="Nog geen hooks bewaard" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {savedHooks.map((h) => (
              <div
                key={h.id}
                className="rounded-2xl border border-border/60 bg-background p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="secondary" className="rounded-full text-[11px]">
                      {h.hook_category || 'Algemeen'}
                    </Badge>
                    <Badge variant="outline" className="rounded-full text-[10px]">
                      <Building2 className="h-2.5 w-2.5 mr-1" /> {h.client?.name || 'Algemeen'}
                    </Badge>
                    {(h.location_label || h.client_id) && (
                      <Badge variant="outline" className="rounded-full text-[10px]">
                        <MapPin className="h-2.5 w-2.5 mr-1" /> {h.location_label || 'Alle locaties'}
                      </Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onDeleteHook(h.id)}
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-base font-medium text-foreground leading-snug">{h.hook_text}</p>
                {h.rationale && (
                  <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/60 pt-2">{h.rationale}</p>
                )}
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Functie: {h.role_query}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Heart className="h-3.5 w-3.5 text-primary" /> Opgeslagen advertenties
          <span className="text-xs font-normal text-muted-foreground">({savedFavoriteItems.length})</span>
        </h2>
        {savedFavoriteItems.length === 0 ? (
          <EmptyState label="Nog geen advertenties bewaard" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {savedFavoriteItems.map(({ favorite_id, client, item }) => (
              <div key={favorite_id} className="rounded-2xl border border-border/60 bg-background p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="outline" className="rounded-full text-[10px]">
                    <Building2 className="h-2.5 w-2.5 mr-1" /> {client?.name || 'Algemeen'}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onDeleteFavorite(favorite_id)}
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <button onClick={() => onPreview(item)} className="text-left space-y-2">
                  <p className="text-sm font-semibold text-foreground truncate">{item.advertiser_name || 'Onbekend'}</p>
                  {item.primary_text && (
                    <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{item.primary_text}</p>
                  )}
                  {item.headline && (
                    <p className="text-xs font-medium text-foreground line-clamp-2">{item.headline}</p>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-12 text-center">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground mt-1">Ververs de bron om opnieuw uit Meta Ad Library te laden.</p>
    </div>
  );
}
