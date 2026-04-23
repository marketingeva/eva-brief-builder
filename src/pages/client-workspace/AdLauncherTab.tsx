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
  link_url: '',
});

export default function AdLauncherTab({ clientId, clientName }: Props) {
  const { toast } = useToast();
  const [nameFilter, setNameFilter] = useState<string | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [selection, setSelection] = useState<MetaSelection>({
    campaign_id: '', adset_id: '', lead_form_id: '', link_url: '',
  });
  const [creatives, setCreatives] = useState<CreativeRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

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
      status: 'PAUSED',
      creatives: creatives.map((r) => ({
        storage_path: r.storage_path!,
        file_name: r.file.name,
        file_type: r.file.type,
        texts: { ...r.texts, link_url: r.texts.link_url || selection.link_url || 'http://fb.me/' },
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
        {/* Selection */}
        <Card className="lg:col-span-3 p-5 space-y-4 h-fit">
          <h3 className="text-sm font-semibold">Selectie</h3>
          {!nameFilter && (
            <p className="text-xs text-warning">Geen Meta naam-filter ingesteld voor deze klant. Alle resources worden getoond.</p>
          )}
          {!pageId && (
            <p className="text-xs text-warning">Geen Meta Page ID ingesteld — lead formulieren kunnen niet geladen worden.</p>
          )}
          <MetaSelectors nameFilter={nameFilter} pageId={pageId} value={selection} onChange={setSelection} />
          <div className="flex items-center justify-between pt-2 border-t">
            <Label htmlFor="active-toggle" className="text-xs">Direct activeren</Label>
            <Switch id="active-toggle" checked={launchAsActive} onCheckedChange={setLaunchAsActive} />
          </div>
        </Card>

        {/* Upload */}
        <Card className="lg:col-span-4 p-5 space-y-3 h-fit">
          <h3 className="text-sm font-semibold">Upload creatives</h3>
          <CreativeUploadZone onFiles={handleFiles} />
          <p className="text-[11px] text-muted-foreground">Bestanden worden tijdelijk opgeslagen totdat de advertenties gelanceerd zijn.</p>
        </Card>

        {/* Preview / Launch */}
        <Card className="lg:col-span-5 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Preview & Launch ({creatives.length})</h3>
            <Button size="sm" onClick={launch} disabled={!canLaunch || launching}>
              {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Launch Ads
            </Button>
          </div>
          {creatives.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">Nog geen creatives — upload om te starten.</p>
          )}
          <div className="space-y-2">
            {creatives.map((row) => (
              <div key={row.id} className="flex items-center gap-3 p-2 border rounded-lg">
                {row.file.type.startsWith('video') ? (
                  <video src={row.preview_url} className="w-16 h-16 rounded object-cover bg-muted" />
                ) : (
                  <img src={row.preview_url} className="w-16 h-16 rounded object-cover bg-muted" alt="" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{row.file.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {row.uploading && <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Uploaden</span>}
                    {row.upload_error && <span className="text-[11px] text-destructive">{row.upload_error}</span>}
                    {!row.uploading && !row.upload_error && !row.launch_status && <span className="text-[11px] text-muted-foreground">Klaar</span>}
                    {row.launch_status === 'pending' && <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Lanceren</span>}
                    {row.launch_status === 'success' && <span className="text-[11px] text-success flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Live</span>}
                    {row.launch_status === 'failed' && <span className="text-[11px] text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {row.launch_error}</span>}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setEditingId(row.id)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => removeRow(row.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
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
    </div>
  );
}
