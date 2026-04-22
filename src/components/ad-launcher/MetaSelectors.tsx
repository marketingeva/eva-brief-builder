import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

export interface MetaSelection {
  campaign_id: string;
  adset_id: string;
  lead_form_id: string;
  link_url: string;
}

interface Props {
  nameFilter?: string | null;
  pageId?: string | null;
  value: MetaSelection;
  onChange: (v: MetaSelection) => void;
}

interface Item { id: string; name: string }

export default function MetaSelectors({ nameFilter, pageId, value, onChange }: Props) {
  const [campaigns, setCampaigns] = useState<Item[]>([]);
  const [adsets, setAdsets] = useState<Item[]>([]);
  const [leadForms, setLeadForms] = useState<Item[]>([]);
  const [loadingC, setLoadingC] = useState(false);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingL, setLoadingL] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingC(true);
    setError(null);
    supabase.functions.invoke('meta-list-resources', {
      body: { resource: 'campaigns', name_filter: nameFilter || '' },
    }).then(({ data, error }) => {
      setLoadingC(false);
      if (error || data?.error) { setError(error?.message || data.error); return; }
      setCampaigns(data?.data || []);
    });
  }, [nameFilter]);

  useEffect(() => {
    if (!value.campaign_id) { setAdsets([]); return; }
    setLoadingA(true);
    supabase.functions.invoke('meta-list-resources', {
      body: { resource: 'adsets', campaign_id: value.campaign_id },
    }).then(({ data, error }) => {
      setLoadingA(false);
      if (error || data?.error) { setError(error?.message || data.error); return; }
      setAdsets(data?.data || []);
    });
  }, [value.campaign_id]);

  useEffect(() => {
    if (!pageId) { setLeadForms([]); return; }
    setLoadingL(true);
    supabase.functions.invoke('meta-list-resources', {
      body: { resource: 'leadforms', page_id: pageId, name_filter: nameFilter || '' },
    }).then(({ data, error }) => {
      setLoadingL(false);
      if (error || data?.error) { setError(error?.message || data.error); return; }
      setLeadForms(data?.data || []);
    });
  }, [pageId, nameFilter]);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="flex items-center gap-2">Campagne {loadingC && <Loader2 className="h-3 w-3 animate-spin" />}</Label>
        <Select value={value.campaign_id} onValueChange={(v) => onChange({ ...value, campaign_id: v, adset_id: '' })}>
          <SelectTrigger><SelectValue placeholder="Kies campagne" /></SelectTrigger>
          <SelectContent>
            {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            {!loadingC && !campaigns.length && <div className="px-2 py-2 text-xs text-muted-foreground">Geen resultaten</div>}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-2">Ad set {loadingA && <Loader2 className="h-3 w-3 animate-spin" />}</Label>
        <Select value={value.adset_id} onValueChange={(v) => onChange({ ...value, adset_id: v })} disabled={!value.campaign_id}>
          <SelectTrigger><SelectValue placeholder={value.campaign_id ? 'Kies ad set' : 'Eerst campagne'} /></SelectTrigger>
          <SelectContent>
            {adsets.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-2">Lead formulier {loadingL && <Loader2 className="h-3 w-3 animate-spin" />}</Label>
        <Select value={value.lead_form_id} onValueChange={(v) => onChange({ ...value, lead_form_id: v })} disabled={!pageId}>
          <SelectTrigger><SelectValue placeholder={pageId ? 'Kies formulier' : 'Geen Page ID ingesteld'} /></SelectTrigger>
          <SelectContent>
            {leadForms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Website URL</Label>
        <Input value={value.link_url} onChange={(e) => onChange({ ...value, link_url: e.target.value })} placeholder="http://fb.me/" />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
