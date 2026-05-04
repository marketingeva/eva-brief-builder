import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sparkles, RefreshCw, Heart, ExternalLink, Loader2,
  CheckCircle2, Facebook, Instagram, PlayCircle, BadgeInfo,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const FIXED_QUERY = 'Verzorgende IG';
const SOURCE_LABELS = ['Nederland', 'Employment', 'Active', 'Media: all'];

type HubTab = 'ad-library' | 'hooks';

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
}

const PAGE_SIZE = 12;

interface SearchRow {
  id: string;
  query: string;
  result_count: number;
  created_at: string;
  source_url?: string | null;
}

interface ClientOption {
  id: string;
  name: string;
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

export default function AdsInspirationPage() {
  const [activeTab, setActiveTab] = useState<HubTab>('ad-library');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState<SearchRow | null>(null);
  const [items, setItems] = useState<InspirationItem[]>([]);
  const [favorites, setFavorites] = useState<Record<string, string>>({});
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [activeClient, setActiveClient] = useState<string>('global');
  const [previewItem, setPreviewItem] = useState<InspirationItem | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  const loadFavorites = useCallback(async () => {
    const clientFilter = activeClient === 'global' ? null : activeClient;
    let q = supabase.from('inspiration_favorites').select('id, item_id, client_id');
    q = clientFilter ? q.eq('client_id', clientFilter) : q.is('client_id', null);
    const { data } = await q;
    const map: Record<string, string> = {};
    (data || []).forEach((f: any) => { map[f.item_id] = f.id; });
    setFavorites(map);
  }, [activeClient]);

  const loadHub = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-ads-inspiration', {
        body: { forceRefresh, tab: activeTab },
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
  }, [activeTab]);

  useEffect(() => {
    (async () => {
      const [{ data: cs }, { data: latest }] = await Promise.all([
        supabase.from('clients').select('id,name').order('name'),
        supabase
          .from('inspiration_searches')
          .select('id, query, result_count, created_at, source_url')
          .eq('query', FIXED_QUERY)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      setClients(cs || []);
      if (latest) setSearch(latest as SearchRow);
    })();
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    loadHub(false);
  }, [loadHub]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites, items.length]);

  const hookItems = useMemo(() => {
    return items
      .filter((item) => item.hook_text || item.is_hook_candidate)
      .sort((a, b) => (a.hook_category || '').localeCompare(b.hook_category || ''));
  }, [items]);

  const toggleFavorite = async (item: InspirationItem) => {
    const existing = favorites[item.id];
    const clientFilter = activeClient === 'global' ? null : activeClient;
    if (existing) {
      const { error } = await supabase.from('inspiration_favorites').delete().eq('id', existing);
      if (error) {
        toast.error('Verwijderen mislukt');
        return;
      }
      setFavorites((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }

    const { data, error } = await supabase
      .from('inspiration_favorites')
      .insert({ item_id: item.id, client_id: clientFilter })
      .select('id')
      .single();

    if (error) {
      toast.error('Opslaan mislukt');
      return;
    }

    setFavorites((prev) => ({ ...prev, [item.id]: data.id }));
    toast.success(activeClient === 'global' ? 'Bewaard' : `Bewaard voor ${clients.find((c) => c.id === activeClient)?.name}`);
  };

  return (
    <div className="p-8 max-w-[1440px] mx-auto space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Inspiration Hub
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Meta Ad Library inspiratie voor <span className="text-foreground font-medium">{FIXED_QUERY}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {SOURCE_LABELS.map((label) => (
              <Badge key={label} variant="secondary" className="rounded-full px-3 py-1 text-[11px] font-medium">
                {label}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={activeClient} onValueChange={setActiveClient}>
            <SelectTrigger className="w-[190px] h-9 rounded-full text-xs">
              <SelectValue placeholder="Favorieten voor..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Algemeen</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => loadHub(true)} disabled={loading} className="rounded-full h-9 text-xs">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Vernieuwen uit Meta Ad Library
          </Button>
        </div>
      </div>

      <div className="glass rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { key: 'ad-library', label: 'Ad Library' },
            { key: 'hooks', label: 'Hooks' },
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

        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <BadgeInfo className="h-3.5 w-3.5" />
          {search ? `${search.result_count} advertenties opgeslagen` : 'Bron wordt geladen'}
        </div>
      </div>

      <section className="glass rounded-3xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Bron</p>
            <p className="text-sm font-medium text-foreground mt-1">Meta Ad Library · Verzorgende IG · Nederland · Employment</p>
          </div>
          {search?.source_url && (
            <a href={search.source_url} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="rounded-full text-xs">
                <ExternalLink className="h-3 w-3 mr-1" /> Open bron
              </Button>
            </a>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: activeTab === 'hooks' ? 6 : 8 }).map((_, i) => (
              <Skeleton key={i} className={cn('rounded-2xl', activeTab === 'hooks' ? 'h-[220px]' : 'h-[520px]')} />
            ))}
          </div>
        ) : activeTab === 'ad-library' ? (
          items.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {items.slice(0, visibleCount).map((item) => (
                  <AdLibraryCard
                    key={item.id}
                    item={item}
                    isFavorite={!!favorites[item.id]}
                    onToggleFavorite={() => toggleFavorite(item)}
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
          )
        ) : hookItems.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {hookItems.map((item) => (
              <HookCard
                key={item.id}
                item={item}
                onOpen={() => setPreviewItem(item)}
              />
            ))}
          </div>
        ) : (
          <EmptyState label="Nog geen hooks afgeleid uit deze advertenties" />
        )}
      </section>

      <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-background/95 backdrop-blur-xl">
          {previewItem && (
            <div className="grid md:grid-cols-[1.1fr_0.9fr] gap-0">
              <div className="bg-muted/30 p-4 flex items-center justify-center min-h-[420px] max-h-[82vh] overflow-auto">
                {previewItem.video_url ? (
                  <video src={previewItem.video_url} controls className="w-full rounded-lg bg-background" />
                ) : getAdPreviewSrc(previewItem) ? (
                  <img
                    src={getAdPreviewSrc(previewItem) || ''}
                    alt={previewItem.advertiser_name || 'Advertentie preview'}
                    className="w-full h-auto object-contain rounded-lg"
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">Geen media-preview beschikbaar</div>
                )}
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
                  {previewItem.external_id && (
                    <Badge variant="secondary" className="rounded-full">Library ID: {previewItem.external_id}</Badge>
                  )}
                </div>

                {previewItem.started_running && (
                  <p className="text-xs text-muted-foreground">Started running on {previewItem.started_running}</p>
                )}

                {previewItem.hook_text && (
                  <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 space-y-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Hook</p>
                    <p className="text-sm font-medium text-foreground">{previewItem.hook_text}</p>
                    {previewItem.hook_category && (
                      <p className="text-xs text-muted-foreground">Categorie: {previewItem.hook_category}</p>
                    )}
                  </div>
                )}

                {previewItem.primary_text && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Advertentietekst</p>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">{previewItem.primary_text}</p>
                  </div>
                )}

                {previewItem.headline && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Headline</p>
                    <p className="text-sm font-semibold text-foreground">{previewItem.headline}</p>
                  </div>
                )}

                {previewItem.description && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Beschrijving</p>
                    <p className="text-sm text-foreground/85 whitespace-pre-wrap leading-relaxed">{previewItem.description}</p>
                  </div>
                )}

                {previewItem.cta && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">CTA</p>
                    <Badge variant="secondary" className="rounded-full">{previewItem.cta}</Badge>
                  </div>
                )}

                {previewItem.publisher_platforms && previewItem.publisher_platforms.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Platformen</p>
                    <div className="flex flex-wrap gap-2">
                      {previewItem.publisher_platforms.map((platform) => (
                        <Badge key={platform} variant="secondary" className="rounded-full">{platform}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2 flex-wrap">
                  {previewItem.ad_library_url && (
                    <a href={previewItem.ad_library_url} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm" className="rounded-full text-xs">
                        <ExternalLink className="h-3 w-3 mr-1" /> In Ads Library
                      </Button>
                    </a>
                  )}
                  <Button
                    onClick={() => toggleFavorite(previewItem)}
                    variant={favorites[previewItem.id] ? 'default' : 'outline'}
                    size="sm"
                    className="rounded-full text-xs"
                  >
                    <Heart className={cn('h-3 w-3 mr-1', favorites[previewItem.id] && 'fill-current')} />
                    {favorites[previewItem.id] ? 'Bewaard' : 'Bewaar'}
                  </Button>
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
  onToggleFavorite,
  onPreview,
}: {
  item: InspirationItem;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onPreview: () => void;
}) {
  const previewSrc = getAdPreviewSrc(item);
  const platforms = item.publisher_platforms || [];
  const carouselThumbs = (item.media_urls || []).filter((u) => u && u !== previewSrc).slice(0, 3);
  const isCarousel = item.media_type === 'carousel' || carouselThumbs.length > 0;
  const isVideo = item.media_type === 'video' || !!item.video_url;
  const advertiserDisplay = item.advertiser_name && item.advertiser_name.trim().length > 1
    ? item.advertiser_name
    : 'Onbekend';

  return (
    <div className="group rounded-2xl overflow-hidden bg-card border border-border/60 hover:border-border transition-all hover:shadow-md flex flex-col">
      <div className="px-4 pt-4 pb-3 space-y-1.5 relative">
        <button
          onClick={onToggleFavorite}
          className={cn(
            'absolute top-3 right-3 h-7 w-7 rounded-full flex items-center justify-center transition z-10',
            isFavorite ? 'bg-primary text-primary-foreground' : 'bg-muted/70 text-foreground hover:bg-muted'
          )}
        >
          <Heart className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
        </button>

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

      {item.primary_text && (
        <div className="px-4 pb-3">
          <p className="text-xs text-foreground/85 leading-relaxed whitespace-pre-wrap line-clamp-5">{item.primary_text}</p>
        </div>
      )}

      <button onClick={onPreview} className="block w-full bg-muted/40 aspect-square overflow-hidden relative">
        {previewSrc ? (
          <img
            src={previewSrc}
            alt={advertiserDisplay}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">Geen preview</div>
        )}
        {isVideo && (
          <div className="absolute inset-0 bg-background/10 flex items-center justify-center">
            <div className="h-12 w-12 rounded-full bg-background/80 border border-border/70 flex items-center justify-center">
              <PlayCircle className="h-6 w-6 text-foreground" />
            </div>
          </div>
        )}
      </button>

      {isCarousel && carouselThumbs.length > 0 && (
        <div className="px-4 pt-3 flex gap-1.5 overflow-x-auto">
          {carouselThumbs.map((url) => (
            <img key={url} src={url} alt="" className="h-12 w-12 rounded-md object-cover bg-muted flex-shrink-0" loading="lazy" />
          ))}
        </div>
      )}

      {(item.headline || item.description || item.cta) && (
        <div className="px-4 py-3 mt-auto border-t border-border/60 space-y-1">
          {item.headline && (
            <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{item.headline}</p>
          )}
          {item.description && (
            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{item.description}</p>
          )}
          {item.cta && (
            <p className="text-[11px] text-primary font-medium">{item.cta}</p>
          )}
        </div>
      )}
    </div>
  );
}

function HookCard({ item, onOpen }: { item: InspirationItem; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="text-left rounded-2xl border border-border/60 bg-card p-5 hover:border-border hover:shadow-md transition-all h-full"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <Badge variant="secondary" className="rounded-full">
          {item.hook_category || 'Algemene hook'}
        </Badge>
        {item.media_type === 'video' && (
          <Badge variant="secondary" className="rounded-full">Video-ad</Badge>
        )}
      </div>

      <p className="text-base font-medium text-foreground leading-snug mb-4">
        {item.hook_text || item.primary_text || 'Geen hook gevonden'}
      </p>

      <div className="space-y-2 text-sm text-muted-foreground">
        <p><span className="text-foreground font-medium">Adverteerder:</span> {item.advertiser_name || 'Onbekend'}</p>
        {item.headline && <p><span className="text-foreground font-medium">Headline:</span> {item.headline}</p>}
        {item.started_running && <p><span className="text-foreground font-medium">Sinds:</span> {item.started_running}</p>}
      </div>

      <div className="pt-4 mt-4 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
        <span>Open bronadvertentie</span>
        <ExternalLink className="h-3.5 w-3.5" />
      </div>
    </button>
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
