import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sparkles, RefreshCw, Heart, ExternalLink, Loader2,
  CheckCircle2, Facebook, Instagram, PlayCircle, BadgeInfo, ChevronLeft, ChevronRight,
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
      headline: rawHeadline && !isDestinationLabel(rawHeadline) ? rawHeadline : null,
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

                      {(destinationLabel || headline || description) && (
                        <div className="space-y-1.5">
                          {destinationLabel && <p className="text-[11px] uppercase text-muted-foreground">{destinationLabel}</p>}
                          {headline && <p className="text-sm font-semibold text-foreground">{headline}</p>}
                          {description && <p className="text-sm text-foreground/85 whitespace-pre-wrap leading-relaxed">{description}</p>}
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
        <div className="px-4 py-3 mt-auto border-t border-border/60 flex flex-col gap-1.5">
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
  const isPortrait = isPortraitMedia(activeUrl) || (!activeUrl && isStory);
  // Default Meta feed creative is 4:5 portrait; use 9:16 voor portrait/story media met écht beeld.
  // Bij story-fallback zonder media gebruiken we een compactere 4:5 placeholder zodat
  // de kaart niet onnodig hoog wordt en geen lege ruimte heeft.
  const hasMedia = !!activeUrl;
  const aspectClass = hasMedia
    ? (isPortrait ? 'aspect-[9/16]' : 'aspect-[4/5]')
    : 'aspect-[4/5]';

  const goTo = (nextIndex: number) => {
    const total = urls.length;
    if (!total) return;
    setIndex((nextIndex + total) % total);
  };

  return (
    <div className={cn(
      'w-full bg-muted/40 overflow-hidden relative',
      mode === 'detail' ? 'h-full min-h-[360px] max-h-[76vh] rounded-lg' : aspectClass
    )}>
      {activeUrl ? (
        activeIsVideo ? (
          <video src={activeUrl} controls playsInline preload="metadata" className={cn('w-full h-full bg-muted', mode === 'detail' ? 'object-contain' : 'object-cover')} />
        ) : (
          <button onClick={onOpen} className="block w-full h-full">
            <img
              src={activeUrl}
              alt={label}
              className={cn(
                'w-full h-full transition-transform duration-300',
                mode === 'detail' ? 'object-contain' : 'object-cover group-hover:scale-[1.02]'
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
