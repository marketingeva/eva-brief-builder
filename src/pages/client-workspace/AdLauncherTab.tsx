import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Rocket, Loader2, Sparkles, ImagePlus } from 'lucide-react';
import CreativeUploadZone from '@/components/ad-launcher/CreativeUploadZone';
import MetaSelectors, { MetaSelection } from '@/components/ad-launcher/MetaSelectors';
import CreativeTextsPanel, { CreativeText } from '@/components/ad-launcher/CreativeTextsPanel';
import NewAdsetDialog from '@/components/ad-launcher/NewAdsetDialog';
import BundlePreviewCard, { type BundleVariant } from '@/components/ad-launcher/BundlePreviewCard';
import { parseCreativeName, bundleKey, type AspectRatio } from '@/lib/ad-bundle';

interface Props {
  clientId: string;
  clientName?: string;
}

interface BundleRow {
  id: string;
  baseName: string;
  variants: BundleVariant[];
  texts: CreativeText;
  launch_status?: 'pending' | 'success' | 'failed';
  launch_error?: string;
  ad_id?: string;
}

const defaultText = (): CreativeText => ({
  primary_texts: [''],
  headlines: [''],
  descriptions: [''],
  cta: 'SIGN_UP',
  link_url: 'http://fb.me/',
});

export default function AdLauncherTab({ clientId, clientName }: Props) {
  const { toast } = useToast();
  const [nameFilter, setNameFilter] = useState<string | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [selection, setSelection] = useState<MetaSelection>({
    campaign_id: '', adset_id: '', lead_form_id: '',
  });
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [newAdsetOpen, setNewAdsetOpen] = useState(false);
  const [adsetRefreshKey, setAdsetRefreshKey] = useState(0);

  useEffect(() => {
    supabase.from('clients').select('meta_name_filter, meta_page_id').eq('id', clientId).single()
      .then(({ data }) => {
        setNameFilter(data?.meta_name_filter || null);
        setPageId(data?.meta_page_id || null);
      });
  }, [clientId]);

  // Reset bundles wanneer van klant gewisseld wordt.
  useEffect(() => { setBundles([]); }, [clientId]);

  const uploadVariant = async (
    bundleId: string,
    variantFile: File,
  ) => {
    const path = `${clientId}/${Date.now()}-${variantFile.name}`;
    const { error } = await supabase.storage
      .from('ad-launcher-uploads')
      .upload(path, variantFile);
    setBundles((cur) =>
      cur.map((b) => {
        if (b.id !== bundleId) return b;
        return {
          ...b,
          variants: b.variants.map((v) =>
            v.file === variantFile
              ? { ...v, uploading: false, storage_path: error ? undefined : path, upload_error: error?.message }
              : v,
          ),
        };
      }),
    );
  };

  const addFilesToBundles = (files: File[]) => {
    // Parse en groepeer in-place: voeg toe aan bestaande bundles of maak nieuwe.
    setBundles((prev) => {
      const next = [...prev];
      const filesToUpload: { bundleId: string; file: File }[] = [];

      for (const f of files) {
        const { baseName, ratio } = parseCreativeName(f.name);
        const key = bundleKey(baseName);
        const variant: BundleVariant = {
          ratio,
          file: f,
          preview_url: URL.createObjectURL(f),
          uploading: true,
        };
        const existing = next.find((b) => bundleKey(b.baseName) === key);
        if (existing) {
          // Dedupe: skip als deze ratio al bestaat
          if (ratio && existing.variants.some((v) => v.ratio === ratio)) {
            URL.revokeObjectURL(variant.preview_url);
            toast({
              title: 'Formaat al aanwezig',
              description: `${baseName} heeft al een ${ratio} variant.`,
            });
            continue;
          }
          existing.variants.push(variant);
          filesToUpload.push({ bundleId: existing.id, file: f });
        } else {
          const id = crypto.randomUUID();
          next.push({
            id,
            baseName,
            variants: [variant],
            texts: defaultText(),
          });
          filesToUpload.push({ bundleId: id, file: f });
        }
      }

      // Trigger uploads buiten setState
      queueMicrotask(() => {
        for (const { bundleId, file } of filesToUpload) {
          uploadVariant(bundleId, file);
        }
      });

      return next;
    });
  };

  const handleFiles = (files: File[]) => {
    addFilesToBundles(files);
  };

  const removeBundle = (id: string) => {
    setBundles((c) => {
      const b = c.find((x) => x.id === id);
      b?.variants.forEach((v) => URL.revokeObjectURL(v.preview_url));
      return c.filter((r) => r.id !== id);
    });
  };

  const unbundle = (id: string) => {
    setBundles((c) => {
      const idx = c.findIndex((b) => b.id === id);
      if (idx < 0) return c;
      const target = c[idx];
      const split: BundleRow[] = target.variants.map((v) => ({
        id: crypto.randomUUID(),
        baseName: v.file.name.replace(/\.[^.]+$/, ''),
        variants: [v],
        texts: { ...target.texts },
      }));
      return [...c.slice(0, idx), ...split, ...c.slice(idx + 1)];
    });
  };

  const editing = bundles.find((c) => c.id === editingId);

  const canLaunch =
    !!selection.campaign_id && !!selection.adset_id && !!selection.lead_form_id && !!pageId &&
    bundles.length > 0 &&
    bundles.every((b) => b.variants.every((v) => v.storage_path && !v.uploading));

  const launch = async () => {
    if (!canLaunch) return;
    setLaunching(true);
    setBundles((c) => c.map((r) => ({ ...r, launch_status: 'pending', launch_error: undefined })));

    const payload = {
      client_id: clientId,
      campaign_id: selection.campaign_id,
      adset_id: selection.adset_id,
      lead_form_id: selection.lead_form_id,
      page_id: pageId!,
      disable_enhancements: true,
      status: 'PAUSED',
      creatives: bundles.map((b) => ({
        base_name: b.baseName,
        texts: { ...b.texts, link_url: b.texts.link_url || 'http://fb.me/' },
        variants: b.variants.map((v) => ({
          ratio: v.ratio,
          storage_path: v.storage_path!,
          file_name: v.file.name,
          file_type: v.file.type,
        })),
      })),
    };

    const { data, error } = await supabase.functions.invoke('meta-upload-creative', { body: payload });
    setLaunching(false);

    if (error || data?.error) {
      toast({ title: 'Launch mislukt', description: error?.message || data?.error, variant: 'destructive' });
      setBundles((c) => c.map((r) => ({ ...r, launch_status: 'failed', launch_error: error?.message || data?.error })));
      return;
    }

    const results: any[] = data.results || [];
    setBundles((c) => c.map((r) => {
      const res = results.find((x) => x.base_name === r.baseName);
      if (!res) return r;
      return res.success
        ? { ...r, launch_status: 'success', ad_id: res.ad_id }
        : { ...r, launch_status: 'failed', launch_error: res.error };
    }));
    const ok = results.filter((r) => r.success).length;
    toast({ title: 'Launch voltooid', description: `${ok}/${results.length} advertenties aangemaakt (gepauzeerd in Meta).` });
  };

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Selection + Upload */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-semibold">Selectie</h3>
            {!nameFilter && (
              <p className="text-xs text-warning">Geen Meta naam-filter ingesteld voor deze klant. Alle resources worden getoond.</p>
            )}
            {!pageId && (
              <p className="text-xs text-warning">Geen Meta Page ID ingesteld — lead formulieren kunnen niet geladen worden.</p>
            )}
            <MetaSelectors nameFilter={nameFilter} pageId={pageId} value={selection} onChange={setSelection} adsetReloadKey={adsetRefreshKey} />
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="text-sm font-semibold">Upload creatives</h3>
            <CreativeUploadZone onFiles={handleFiles} />
            <p className="text-[11px] text-muted-foreground">
              Bestanden met dezelfde basisnaam en een verschillend aspect-ratio suffix (bv. <code>_1x1</code>, <code>_4x5</code>, <code>_9x16</code>) worden automatisch als <strong>één advertentie</strong> met meerdere formaten samengevoegd. Nieuwe ads zijn altijd <strong>gepauzeerd</strong> in Meta.
            </p>
          </Card>
        </div>

        {/* Right column: Preview / Launch */}
        <Card className="lg:col-span-7 p-6 space-y-4 min-h-[500px]">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap text-[11px] uppercase tracking-wide text-muted-foreground">
                <span>Uploading to</span>
                {clientName && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 normal-case">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {clientName}
                  </span>
                )}
                {selection.campaign_id && (
                  <>
                    <span>/</span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20 normal-case">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      Campaign
                    </span>
                  </>
                )}
              </div>
              <div>
                <h3 className="text-base font-semibold">Preview & Launch</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {bundles.length} advertentie{bundles.length === 1 ? '' : 's'} klaar
                  {bundles.some((b) => b.variants.length > 1) && ' (bundles)'}.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setNewAdsetOpen(true)}>
                + Nieuwe ad set
              </Button>
              <Button size="sm" onClick={launch} disabled={!canLaunch || launching} className="font-semibold">
                {launching ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Rocket className="h-4 w-4 mr-1.5" />}
                Launch Ads
              </Button>
            </div>
          </div>

          {bundles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="relative mb-6">
                <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: '2.5s' }} />
                <div className="absolute inset-2 rounded-full bg-primary/15 animate-pulse" />
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                  <ImagePlus className="h-10 w-10 text-primary animate-[fade-in_0.6s_ease-out]" />
                </div>
                <Sparkles className="absolute -top-1 -right-1 h-5 w-5 text-primary animate-pulse" />
                <Sparkles className="absolute -bottom-1 -left-2 h-4 w-4 text-primary/60 animate-pulse" style={{ animationDelay: '0.5s' }} />
              </div>
              <h4 className="text-base font-semibold text-foreground">Nog geen creatives</h4>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Sleep afbeeldingen of video's naar de upload-zone hiernaast. Bestanden met dezelfde naam en een formaat-suffix (1x1, 4x5, 9x16) worden automatisch gebundeld.
              </p>
            </div>
          ) : (
            <div className="space-y-3 animate-fade-in">
              {bundles.map((b) => {
                const pCount = b.texts.primary_texts.filter(Boolean).length;
                const hCount = b.texts.headlines.filter(Boolean).length;
                const dCount = b.texts.descriptions.filter(Boolean).length;
                return (
                  <BundlePreviewCard
                    key={b.id}
                    baseName={b.baseName}
                    variants={b.variants}
                    textCounts={{ p: pCount, h: hCount, d: dCount }}
                    launchStatus={b.launch_status}
                    launchError={b.launch_error}
                    onEditTexts={() => setEditingId(b.id)}
                    onRemove={() => removeBundle(b.id)}
                    onUnbundle={b.variants.length > 1 ? () => unbundle(b.id) : undefined}
                    onAddVariant={(files) => {
                      // Voeg toe als variant aan deze bundle (forceer dezelfde basenaam).
                      const fakeNamed = files.map((f) => {
                        const { ratio } = parseCreativeName(f.name);
                        return { f, ratio };
                      });
                      // Voeg direct toe aan deze bundle, geen rebundling.
                      setBundles((prev) => {
                        const target = prev.find((x) => x.id === b.id);
                        if (!target) return prev;
                        const uploads: File[] = [];
                        for (const { f, ratio } of fakeNamed) {
                          if (ratio && target.variants.some((v) => v.ratio === ratio)) {
                            toast({
                              title: 'Formaat al aanwezig',
                              description: `${b.baseName} heeft al een ${ratio} variant.`,
                            });
                            continue;
                          }
                          target.variants.push({
                            ratio,
                            file: f,
                            preview_url: URL.createObjectURL(f),
                            uploading: true,
                          });
                          uploads.push(f);
                        }
                        queueMicrotask(() => {
                          for (const file of uploads) uploadVariant(b.id, file);
                        });
                        return [...prev];
                      });
                    }}
                  />
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {editing && (
        <CreativeTextsPanel
          open={!!editingId}
          onOpenChange={(o) => !o && setEditingId(null)}
          initial={editing.texts}
          clientName={clientName}
          onSave={(texts) => setBundles((c) => c.map((r) => r.id === editingId ? { ...r, texts } : r))}
        />
      )}

      <NewAdsetDialog
        open={newAdsetOpen}
        onOpenChange={setNewAdsetOpen}
        clientId={clientId}
        clientName={clientName}
        pageId={pageId}
        nameFilter={nameFilter}
        initialCampaignId={selection.campaign_id}
        onCreated={(adsetId, _name, campaignId) => {
          setSelection((s) => ({ ...s, campaign_id: campaignId, adset_id: adsetId }));
          setAdsetRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}

// Suppress unused warnings for utility-only types if needed
export type { AspectRatio };
