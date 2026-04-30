import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Rocket, Pencil, Trash2, CheckCircle2, AlertCircle, Loader2, Sparkles, ImagePlus } from 'lucide-react';
import CreativeUploadZone from '@/components/ad-launcher/CreativeUploadZone';
import MetaSelectors, { MetaSelection } from '@/components/ad-launcher/MetaSelectors';
import CreativeTextsPanel, { CreativeText } from '@/components/ad-launcher/CreativeTextsPanel';
import NewAdsetDialog from '@/components/ad-launcher/NewAdsetDialog';

interface Props {
  clientId: string;
  clientName?: string;
}

interface CreativeRow {
  id: string;
  file: File;
  storage_path?: string;
  preview_url: string;
  uploading: boolean;
  upload_error?: string;
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
  const [creatives, setCreatives] = useState<CreativeRow[]>([]);
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

  const handleFiles = async (files: File[]) => {
    const newRows: CreativeRow[] = files.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      preview_url: URL.createObjectURL(f),
      uploading: true,
      texts: defaultText(),
    }));
    setCreatives((c) => [...c, ...newRows]);

    for (const row of newRows) {
      const path = `${clientId}/${Date.now()}-${row.file.name}`;
      const { error } = await supabase.storage.from('ad-launcher-uploads').upload(path, row.file);
      setCreatives((cur) => cur.map((r) => r.id === row.id
        ? { ...r, uploading: false, storage_path: error ? undefined : path, upload_error: error?.message }
        : r));
    }
  };

  const removeRow = (id: string) => {
    setCreatives((c) => c.filter((r) => r.id !== id));
  };

  const editing = creatives.find((c) => c.id === editingId);

  const canLaunch =
    selection.campaign_id && selection.adset_id && selection.lead_form_id && pageId &&
    creatives.length > 0 && creatives.every((c) => c.storage_path && !c.uploading);

  const launch = async () => {
    if (!canLaunch) return;
    setLaunching(true);
    setCreatives((c) => c.map((r) => ({ ...r, launch_status: 'pending', launch_error: undefined })));

    const payload = {
      client_id: clientId,
      campaign_id: selection.campaign_id,
      adset_id: selection.adset_id,
      lead_form_id: selection.lead_form_id,
      page_id: pageId!,
      disable_enhancements: true,
      status: 'PAUSED',
      creatives: creatives.map((r) => ({
        storage_path: r.storage_path!,
        file_name: r.file.name,
        file_type: r.file.type,
        texts: { ...r.texts, link_url: r.texts.link_url || 'http://fb.me/' },
      })),
    };

    const { data, error } = await supabase.functions.invoke('meta-upload-creative', { body: payload });
    setLaunching(false);

    if (error || data?.error) {
      toast({ title: 'Launch mislukt', description: error?.message || data?.error, variant: 'destructive' });
      setCreatives((c) => c.map((r) => ({ ...r, launch_status: 'failed', launch_error: error?.message || data?.error })));
      return;
    }

    const results: any[] = data.results || [];
    setCreatives((c) => c.map((r) => {
      const res = results.find((x) => x.file_name === r.file.name);
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
              Bestanden worden tijdelijk opgeslagen totdat de advertenties gelanceerd zijn. Nieuwe ads worden altijd <strong>gepauzeerd</strong> aangemaakt in Meta — je activeert ze daar handmatig.
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
                  Preview {creatives.length} creative{creatives.length === 1 ? '' : 's'} ready to launch.
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

          {creatives.length === 0 ? (
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
                Sleep afbeeldingen of video's naar de upload-zone hiernaast. Zodra ze geladen zijn, verschijnt hier een preview.
              </p>
              <div className="mt-6 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <span>Wachten op upload...</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2 animate-fade-in">
              {creatives.map((row) => {
                const sizeMb = (row.file.size / (1024 * 1024)).toFixed(2);
                const ext = row.file.name.split('.').pop()?.toUpperCase() || (row.file.type.split('/')[1] || '').toUpperCase();
                const ready = !row.uploading && !row.upload_error && !row.launch_status;
                const pCount = row.texts.primary_texts.filter(Boolean).length;
                const hCount = row.texts.headlines.filter(Boolean).length;
                const dCount = row.texts.descriptions.filter(Boolean).length;
                return (
                  <div key={row.id} className="flex items-center gap-4 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                    {row.file.type.startsWith('video') ? (
                      <video src={row.preview_url} className="w-24 h-24 rounded-md object-cover bg-muted shrink-0" />
                    ) : (
                      <img src={row.preview_url} className="w-24 h-24 rounded-md object-cover bg-muted shrink-0" alt="" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{row.file.name}</p>
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                        <span>{sizeMb} MB</span>
                        <span>·</span>
                        <span>{ext}</span>
                        <span>·</span>
                        {row.uploading && (
                          <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Uploaden</span>
                        )}
                        {row.upload_error && <span className="text-destructive">{row.upload_error}</span>}
                        {ready && (
                          <span className="flex items-center gap-1 text-success">
                            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Ready
                          </span>
                        )}
                        {row.launch_status === 'pending' && (
                          <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Lanceren</span>
                        )}
                        {row.launch_status === 'success' && (
                          <span className="flex items-center gap-1 text-success"><CheckCircle2 className="h-3 w-3" /> Aangemaakt (gepauzeerd)</span>
                        )}
                        {row.launch_status === 'failed' && (
                          <span className="flex items-center gap-1 text-destructive"><AlertCircle className="h-3 w-3" /> {row.launch_error}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {([
                        ['P', pCount, 'Primary texts'],
                        ['H', hCount, 'Headlines'],
                        ['D', dCount, 'Descriptions'],
                      ] as const).map(([label, count, title]) => (
                        <span
                          key={label}
                          title={`${title}: ${count}`}
                          className={`inline-flex items-center justify-center h-7 w-7 rounded-full text-[11px] font-semibold border ${
                            count > 0
                              ? 'bg-success/15 text-success border-success/30'
                              : 'bg-muted text-muted-foreground border-transparent'
                          }`}
                        >
                          {label}
                        </span>
                      ))}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingId(row.id)} title="Teksten bewerken">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeRow(row.id)} title="Verwijderen">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
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
          onSave={(texts) => setCreatives((c) => c.map((r) => r.id === editingId ? { ...r, texts } : r))}
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
