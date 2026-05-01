import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Search, RefreshCw, Heart, ExternalLink,
  Image as ImageIcon, Sparkles, Loader2, X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ViewMode = 'images' | 'images_hooks';

interface InspirationItem {
  id: string;
  search_id: string;
  advertiser_name: string | null;
  advertiser_page_url: string | null;
  ad_library_url: string | null;
  image_url: string | null;
  primary_text: string | null;
  external_id: string | null;
}

interface SearchRow {
  id: string;
  query: string;
  ai_summary: string | null;
  result_count: number;
  created_at: string;
}

interface ClientOption {
  id: string;
  name: string;
}

export default function AdsInspirationPage() {
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('images_hooks');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState<SearchRow | null>(null);
  const [items, setItems] = useState<InspirationItem[]>([]);
  const [favorites, setFavorites] = useState<Record<string, string>>({}); // item_id -> favorite_id
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [activeClient, setActiveClient] = useState<string>('global');
  const [previewItem, setPreviewItem] = useState<InspirationItem | null>(null);
  const [recentSearches, setRecentSearches] = useState<SearchRow[]>([]);

  // Load clients + recent searches once
  useEffect(() => {
    (async () => {
      const { data: cs } = await supabase.from('clients').select('id,name').order('name');
      setClients(cs || []);
      const { data: rs } = await supabase
        .from('inspiration_searches')
        .select('id, query, ai_summary, result_count, created_at')
        .order('created_at', { ascending: false })
        .limit(8);
      setRecentSearches(rs || []);
    })();
  }, []);

  // Refresh favorites whenever client or items change
  const loadFavorites = useCallback(async () => {
    const clientFilter = activeClient === 'global' ? null : activeClient;
    let q = supabase.from('inspiration_favorites').select('id, item_id, client_id');
    q = clientFilter ? q.eq('client_id', clientFilter) : q.is('client_id', null);
    const { data } = await q;
    const map: Record<string, string> = {};
    (data || []).forEach((f: any) => { map[f.item_id] = f.id; });
    setFavorites(map);
  }, [activeClient]);

  useEffect(() => { loadFavorites(); }, [loadFavorites, items.length]);

  const runSearch = async (forceRefresh = false) => {
    const q = query.trim();
    if (!q) {
      toast.error('Voer een zoekterm in');
      return;
    }
    setLoading(true);
    setSearch(null);
    setItems([]);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-ads-inspiration', {
        body: {
          query: q,
          mediaType: 'image',
          forceRefresh,
          wantSummary: viewMode === 'images_hooks',
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSearch(data.search);
      setItems(data.items || []);
      if (data.cached) toast.info('Resultaten uit cache (laatste 6 uur)');
      else toast.success(`${data.items?.length || 0} advertenties gevonden`);
      // refresh recents
      const { data: rs } = await supabase
        .from('inspiration_searches')
        .select('id, query, ai_summary, result_count, created_at')
        .order('created_at', { ascending: false }).limit(8);
      setRecentSearches(rs || []);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Scrapen mislukt');
    } finally {
      setLoading(false);
    }
  };

  const loadHistoricalSearch = async (s: SearchRow) => {
    setLoading(true);
    setSearch(s);
    setQuery(s.query);
    const { data: its } = await supabase
      .from('inspiration_items')
      .select('*')
      .eq('search_id', s.id)
      .order('created_at');
    setItems(its || []);
    setLoading(false);
  };

  const toggleFavorite = async (item: InspirationItem) => {
    const existing = favorites[item.id];
    const clientFilter = activeClient === 'global' ? null : activeClient;
    if (existing) {
      const { error } = await supabase.from('inspiration_favorites').delete().eq('id', existing);
      if (error) { toast.error('Verwijderen mislukt'); return; }
      setFavorites(f => { const c = { ...f }; delete c[item.id]; return c; });
    } else {
      const { data, error } = await supabase
        .from('inspiration_favorites')
        .insert({ item_id: item.id, client_id: clientFilter })
        .select('id').single();
      if (error) { toast.error('Opslaan mislukt'); return; }
      setFavorites(f => ({ ...f, [item.id]: data.id }));
      toast.success(activeClient === 'global' ? 'Bewaard' : `Bewaard voor ${clients.find(c => c.id === activeClient)?.name}`);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link to="/ads-manager">
            <button className="h-9 w-9 rounded-full glass glass-hover flex items-center justify-center">
              <ArrowLeft className="h-4 w-4" />
            </button>
          </Link>
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Inspiration Hub
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Statische advertentie-inspiratie uit de Facebook Ads Library
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Select value={viewMode} onValueChange={(v: ViewMode) => setViewMode(v)}>
            <SelectTrigger className="w-[200px] h-9 text-xs rounded-full border-0 glass">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="images">Alleen afbeeldingen</SelectItem>
              <SelectItem value="images_hooks">Afbeeldingen + hooks</SelectItem>
            </SelectContent>
          </Select>
          <Select value={activeClient} onValueChange={setActiveClient}>
            <SelectTrigger className="w-[180px] h-9 text-xs rounded-full border-0 glass">
              <SelectValue placeholder="Favorieten voor..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Algemeen</SelectItem>
              {clients.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Search bar */}
      <div className="glass rounded-2xl p-4 flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground ml-2" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && runSearch(false)}
          placeholder='Bijv. "verpleegkundige", "thuiszorg", "Buurtzorg", IG-handle...'
          className="border-0 bg-transparent focus-visible:ring-0 text-sm"
          disabled={loading}
        />
        <Button
          onClick={() => runSearch(false)}
          disabled={loading || !query.trim()}
          className="rounded-full h-9 text-xs"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Zoeken'}
        </Button>
        {search && (
          <Button
            onClick={() => runSearch(true)}
            disabled={loading}
            variant="ghost"
            className="rounded-full h-9 text-xs"
            title="Cache negeren en opnieuw scrapen"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Recent searches (when no active search) */}
      {!search && !loading && recentSearches.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 px-1">Recente zoekopdrachten</p>
          <div className="flex flex-wrap gap-1.5">
            {recentSearches.map(s => (
              <button
                key={s.id}
                onClick={() => loadHistoricalSearch(s)}
                className="px-3 h-8 rounded-full glass glass-hover text-xs text-foreground flex items-center gap-1.5"
              >
                {s.query}
                <span className="text-muted-foreground">· {s.result_count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AI summary */}
      {viewMode === 'images_hooks' && search?.ai_summary && (
        <div className="glass rounded-2xl p-5 border border-primary/15">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-semibold text-foreground">AI patroon-analyse voor "{search.query}"</p>
          </div>
          <p className="text-sm text-foreground/85 whitespace-pre-wrap leading-relaxed">{search.ai_summary}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
          ))}
        </div>
      )}

      {/* Results grid */}
      {!loading && items.length > 0 && (
        <div className={cn(
          'grid gap-4',
          viewMode === 'images'
            ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
        )}>
          {items.map(item => (
            <InspirationCard
              key={item.id}
              item={item}
              viewMode={viewMode}
              isFavorite={!!favorites[item.id]}
              onToggleFavorite={() => toggleFavorite(item)}
              onPreview={() => setPreviewItem(item)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && search && items.length === 0 && (
        <div className="glass rounded-2xl p-12 text-center">
          <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-foreground font-medium">Geen advertenties gevonden voor "{search.query}"</p>
          <p className="text-xs text-muted-foreground mt-1">
            Probeer een bredere of andere zoekterm.
          </p>
        </div>
      )}

      {/* Preview dialog */}
      <Dialog open={!!previewItem} onOpenChange={(o) => !o && setPreviewItem(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden bg-background/95 backdrop-blur-xl">
          {previewItem && (
            <div className="grid md:grid-cols-2 gap-0">
              <div className="bg-muted/30 flex items-center justify-center p-4 max-h-[80vh] overflow-auto">
                {previewItem.image_url ? (
                  <img src={previewItem.image_url} alt="" className="w-full h-auto object-contain rounded" />
                ) : (
                  <ImageIcon className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <div className="p-6 space-y-3 max-h-[80vh] overflow-auto">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Adverteerder</p>
                  <p className="text-sm font-semibold">{previewItem.advertiser_name || 'Onbekend'}</p>
                </div>
                {previewItem.primary_text && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Advertentietekst</p>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">{previewItem.primary_text}</p>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
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
                    size="sm" className="rounded-full text-xs"
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

function InspirationCard({
  item, viewMode, isFavorite, onToggleFavorite, onPreview,
}: {
  item: InspirationItem;
  viewMode: ViewMode;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onPreview: () => void;
}) {
  return (
    <div className="group glass rounded-2xl overflow-hidden hover:shadow-lg transition-all">
      <button onClick={onPreview} className="block w-full aspect-square bg-muted/30 relative overflow-hidden">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.advertiser_name || ''}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className={cn(
            'absolute top-2 right-2 h-8 w-8 rounded-full backdrop-blur-md flex items-center justify-center transition',
            isFavorite ? 'bg-primary text-primary-foreground' : 'bg-background/70 text-foreground hover:bg-background'
          )}
        >
          <Heart className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
        </button>
      </button>
      <div className="p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-foreground truncate">
            {item.advertiser_name || 'Onbekend'}
          </p>
          {item.ad_library_url && (
            <a href={item.ad_library_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </a>
          )}
        </div>
        {viewMode === 'images_hooks' && item.primary_text && (
          <p className="text-xs text-muted-foreground line-clamp-4 leading-relaxed">
            {item.primary_text}
          </p>
        )}
      </div>
    </div>
  );
}
