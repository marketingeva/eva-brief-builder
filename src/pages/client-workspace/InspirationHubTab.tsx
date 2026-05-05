import { useCallback, useEffect, useState } from 'react';
import { Sparkles, Heart, MapPin, Trash2, Bookmark } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SavedHook {
  id: string;
  location_label: string | null;
  role_query: string;
  hook_text: string;
  hook_category: string | null;
  rationale: string | null;
  created_at: string;
}

interface SavedAdItem {
  favorite_id: string;
  advertiser_name: string | null;
  advertiser_logo_url: string | null;
  primary_text: string | null;
  headline: string | null;
  description: string | null;
  cta: string | null;
  ad_library_url: string | null;
  image_url: string | null;
  video_url: string | null;
}

export default function InspirationHubTab({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [hooks, setHooks] = useState<SavedHook[]>([]);
  const [ads, setAds] = useState<SavedAdItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: hookRows }, { data: favs }] = await Promise.all([
      supabase
        .from('saved_inspiration_hooks')
        .select('id, location_label, role_query, hook_text, hook_category, rationale, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false }),
      supabase
        .from('inspiration_favorites')
        .select('id, advertiser_name, advertiser_logo_url, primary_text, headline, description, cta, ad_library_url, image_url, video_url')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false }),
    ]);

    setHooks((hookRows || []) as SavedHook[]);

    setAds(
      (favs || []).map((f: any) => ({
        favorite_id: f.id,
        id: f.id,
        advertiser_name: f.advertiser_name,
        advertiser_logo_url: f.advertiser_logo_url,
        primary_text: f.primary_text,
        headline: f.headline,
        description: f.description,
        cta: f.cta,
        ad_library_url: f.ad_library_url,
        image_url: f.image_url,
        video_url: f.video_url,
      })) as SavedAdItem[]
    );

    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const deleteHook = async (id: string) => {
    const { error } = await supabase.from('saved_inspiration_hooks').delete().eq('id', id);
    if (error) { toast.error('Verwijderen mislukt'); return; }
    toast.success('Verwijderd');
    load();
  };

  const deleteFav = async (id: string) => {
    const { error } = await supabase.from('inspiration_favorites').delete().eq('id', id);
    if (error) { toast.error('Verwijderen mislukt'); return; }
    toast.success('Verwijderd');
    load();
  };

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-[1440px] mx-auto">
      <div>
        <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Inspiration Hub
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Hooks en advertenties die je voor deze klant hebt opgeslagen.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Bookmark className="h-3.5 w-3.5 text-primary" /> Opgeslagen hooks
          <span className="text-xs font-normal text-muted-foreground">({hooks.length})</span>
        </h2>
        {hooks.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
            Nog geen hooks bewaard voor deze klant. Ga naar Inspiration Hub om hooks te genereren en op te slaan.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {hooks.map((h) => (
              <div key={h.id} className="rounded-2xl border border-border/60 bg-card p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="secondary" className="rounded-full text-[11px]">{h.hook_category || 'Algemeen'}</Badge>
                    <Badge variant="outline" className="rounded-full text-[10px]">
                      <MapPin className="h-2.5 w-2.5 mr-1" /> {h.location_label || 'Alle locaties'}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteHook(h.id)} className="h-7 w-7 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-base font-medium text-foreground leading-snug">{h.hook_text}</p>
                {h.rationale && (
                  <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/60 pt-2">{h.rationale}</p>
                )}
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Functie: {h.role_query}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Heart className="h-3.5 w-3.5 text-primary" /> Opgeslagen advertenties
          <span className="text-xs font-normal text-muted-foreground">({ads.length})</span>
        </h2>
        {ads.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
            Nog geen advertenties bewaard voor deze klant.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ads.map((a) => (
              <div key={a.favorite_id} className="rounded-2xl border border-border/60 bg-card p-4 flex flex-col gap-3">
                {/* Header: delete action */}
                <div className="flex items-start justify-end">
                  <Button variant="ghost" size="icon" onClick={() => deleteFav(a.favorite_id)} className="h-7 w-7 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {/* 1. Page (advertiser) */}
                <div className="flex items-center gap-2">
                  {a.advertiser_logo_url ? (
                    <img src={a.advertiser_logo_url} alt="" className="h-7 w-7 rounded-full object-cover bg-muted" />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                      {(a.advertiser_name || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <p className="text-sm font-semibold text-foreground truncate">{a.advertiser_name || 'Onbekend'}</p>
                </div>
                {/* 2. Primary text */}
                {a.primary_text && (
                  <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{a.primary_text}</p>
                )}
                {/* 3. Content (image preview) */}
                {a.image_url && (
                  <img src={a.image_url} alt="" className="w-full aspect-[4/5] object-cover rounded-lg bg-muted" />
                )}
                {/* 4. Destination — niet expliciet beschikbaar voor saved items */}
                {/* 5. Headline */}
                {a.headline && (
                  <p className="text-xs font-semibold text-foreground line-clamp-2">{a.headline}</p>
                )}
                {/* 6. Description */}
                {a.description && (
                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{a.description}</p>
                )}
                {a.cta && (
                  <div className="flex justify-end">
                    <span className="text-[10px] uppercase tracking-wide text-primary font-semibold rounded-full bg-primary/10 px-2.5 py-1">
                      {a.cta}
                    </span>
                  </div>
                )}
                {a.ad_library_url && (
                  <a href={a.ad_library_url} target="_blank" rel="noreferrer" className="text-[11px] text-primary hover:underline mt-auto">
                    Open in Meta Ad Library →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
