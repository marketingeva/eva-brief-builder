import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  RefreshCw, ChevronRight, ArrowLeft, CalendarDays, Eye, ExternalLink,
  Image as ImageIcon, Search, BarChart3,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MetricRow {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  leads: number;
  cpl: number;
  meta_leads: number;
  cost_per_meta_lead: number;
  unique_link_clicks: number;
  daily_budget?: number | null;
  objective?: string;
}

interface AdDetail {
  id: string;
  name: string;
  status: string;
  image_url: string | null;
  primary_text: string | null;
  headline: string | null;
  description: string | null;
  cta_type: string | null;
  link_url: string | null;
  creative_id: string | null;
  lead_form: {
    id: string;
    name: string;
    status: string;
    questions: Array<{ key: string; label: string; type: string }>;
  } | null;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}
function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString().split('T')[0];
}

const CTA_LABELS: Record<string, string> = {
  LEARN_MORE: 'Meer informatie',
  SIGN_UP: 'Aanmelden',
  APPLY_NOW: 'Solliciteer nu',
  CONTACT_US: 'Neem contact op',
  SUBSCRIBE: 'Abonneren',
  GET_QUOTE: 'Offerte aanvragen',
  BOOK_NOW: 'Boek nu',
  SHOP_NOW: 'Shop nu',
  DOWNLOAD: 'Download',
  WATCH_MORE: 'Meer bekijken',
  SEND_MESSAGE: 'Stuur bericht',
  GET_OFFER: 'Ontvang aanbieding',
  NO_BUTTON: 'Geen knop',
};

export default function AdsManagerPage() {
  const [campaigns, setCampaigns] = useState<MetricRow[]>([]);
  const [adsets, setAdsets] = useState<MetricRow[]>([]);
  const [ads, setAds] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState('');
  const [drillLevel, setDrillLevel] = useState<'campaigns' | 'adsets' | 'ads'>('campaigns');
  const [selectedCampaign, setSelectedCampaign] = useState<MetricRow | null>(null);
  const [selectedAdset, setSelectedAdset] = useState<MetricRow | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Ad detail
  const [adDetail, setAdDetail] = useState<AdDetail | null>(null);
  const [adDetailLoading, setAdDetailLoading] = useState(false);
  const [showAdDetail, setShowAdDetail] = useState(false);

  // Date range
  const [dateMode, setDateMode] = useState<'preset' | 'custom'>('preset');
  const [preset, setPreset] = useState('last_7d');
  const [customSince, setCustomSince] = useState(daysAgo(7));
  const [customUntil, setCustomUntil] = useState(todayStr());

  const buildBody = useCallback((extra: Record<string, any> = {}) => {
    if (dateMode === 'custom') {
      return { since: customSince, until: customUntil, ...extra };
    }
    return { dateRange: preset, ...extra };
  }, [dateMode, preset, customSince, customUntil]);

  const fetchCampaigns = useCallback(async (showToast = false) => {
    try {
      setRefreshing(true);
      const { data: result, error } = await supabase.functions.invoke('fetch-meta-ads', {
        body: buildBody(),
      });
      if (error) throw error;
      setCampaigns((result as any).campaigns || []);
      setFetchedAt((result as any).fetched_at || '');
      setDrillLevel('campaigns');
      setSelectedCampaign(null);
      setSelectedAdset(null);
      if (showToast) toast.success('Data vernieuwd');
    } catch (err) {
      console.error(err);
      toast.error('Kon Meta Ads data niet ophalen');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildBody]);

  useEffect(() => {
    setLoading(true);
    fetchCampaigns();
  }, [fetchCampaigns]);

  const drillIntoAdsets = async (campaign: MetricRow) => {
    setDrillLoading(true);
    setSelectedCampaign(campaign);
    setSearch('');
    try {
      const { data: result, error } = await supabase.functions.invoke('fetch-meta-ads', {
        body: buildBody({ campaignId: campaign.id }),
      });
      if (error) throw error;
      setAdsets((result as any).data || []);
      setDrillLevel('adsets');
    } catch (err) {
      console.error(err);
      toast.error('Kon advertentiesets niet ophalen');
    } finally {
      setDrillLoading(false);
    }
  };

  const drillIntoAds = async (adset: MetricRow) => {
    setDrillLoading(true);
    setSelectedAdset(adset);
    setSearch('');
    try {
      const { data: result, error } = await supabase.functions.invoke('fetch-meta-ads', {
        body: buildBody({ adsetId: adset.id }),
      });
      if (error) throw error;
      setAds((result as any).data || []);
      setDrillLevel('ads');
    } catch (err) {
      console.error(err);
      toast.error('Kon advertenties niet ophalen');
    } finally {
      setDrillLoading(false);
    }
  };

  const fetchAdDetail = async (adId: string) => {
    setAdDetail(null);
    setAdDetailLoading(true);
    setShowAdDetail(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('fetch-meta-ads', {
        body: { adDetailId: adId },
      });
      if (error) throw error;
      setAdDetail((result as any).data || null);
    } catch (err) {
      console.error(err);
      toast.error('Kon advertentie details niet ophalen');
      setShowAdDetail(false);
    } finally {
      setAdDetailLoading(false);
    }
  };

  const toggleStatus = async (row: MetricRow, level: 'campaign' | 'adset' | 'ad', nextActive: boolean) => {
    const newStatus = nextActive ? 'ACTIVE' : 'PAUSED';
    const prevStatus = row.status;
    setTogglingId(row.id);

    const updateRow = (list: MetricRow[]) =>
      list.map((r) => (r.id === row.id ? { ...r, status: newStatus } : r));
    if (level === 'campaign') setCampaigns(updateRow);
    else if (level === 'adset') setAdsets(updateRow);
    else setAds(updateRow);

    try {
      const { data, error } = await supabase.functions.invoke('toggle-meta-status', {
        body: { id: row.id, level, status: newStatus },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(newStatus === 'ACTIVE' ? 'Geactiveerd in Meta' : 'Gepauzeerd in Meta');
    } catch (err: any) {
      console.error(err);
      toast.error(`Kon status niet wijzigen: ${err?.message || 'onbekende fout'}`);
      // revert
      const revert = (list: MetricRow[]) =>
        list.map((r) => (r.id === row.id ? { ...r, status: prevStatus } : r));
      if (level === 'campaign') setCampaigns(revert);
      else if (level === 'adset') setAdsets(revert);
      else setAds(revert);
    } finally {
      setTogglingId(null);
    }
  };

  const goBack = () => {
    setSearch('');
    if (drillLevel === 'ads') {
      setDrillLevel('adsets');
      setSelectedAdset(null);
    } else if (drillLevel === 'adsets') {
      setDrillLevel('campaigns');
      setSelectedCampaign(null);
    }
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);
  const fmtNum = (n: number) => new Intl.NumberFormat('nl-NL').format(n);
  const fmtPct = (n: number) => `${n.toFixed(2)}%`;

  const baseData = drillLevel === 'campaigns' ? campaigns : drillLevel === 'adsets' ? adsets : ads;
  const currentData = search.trim()
    ? baseData.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
    : baseData;

  const totalSpend = currentData.reduce((s, c) => s + c.spend, 0);
  const totalMetaLeads = currentData.reduce((s, c) => s + c.meta_leads, 0);
  const totalUniqueClicks = currentData.reduce((s, c) => s + c.unique_link_clicks, 0);
  const avgCostPerMetaLead = totalMetaLeads > 0 ? totalSpend / totalMetaLeads : 0;
  const totalImpressions = currentData.reduce((s, c) => s + c.impressions, 0);
  const totalClicks = currentData.reduce((s, c) => s + c.clicks, 0);
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  const levelLabel = drillLevel === 'campaigns' ? 'Campagnes' : drillLevel === 'adsets' ? 'Advertentiesets' : 'Advertenties';

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-px rounded-2xl glass border-0 overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-5"><Skeleton className="h-12 w-full" /></div>
          ))}
        </div>
        <Card className="glass border-0 rounded-2xl shadow-none">
          <CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Ads Manager</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Alle actieve campagnes over alle clients heen
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Link to="/ads-manager/dashboards">
            <button
              className="flex items-center gap-1.5 h-9 px-3 rounded-full glass glass-hover text-xs text-foreground"
              title="Open dashboards"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Dashboards
            </button>
          </Link>
          <Link to="/ads-manager/inspiration">
            <button
              className="flex items-center gap-1.5 h-9 px-3 rounded-full glass glass-hover text-xs text-foreground"
              title="Open Inspiration Hub"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Inspiration Hub
            </button>
          </Link>
          <Select
            value={dateMode === 'preset' ? preset : 'custom'}
            onValueChange={(v) => {
              if (v === 'custom') setDateMode('custom');
              else { setDateMode('preset'); setPreset(v); }
            }}
          >
            <SelectTrigger className="w-[150px] h-9 text-xs rounded-full border-0 glass">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Vandaag</SelectItem>
              <SelectItem value="last_7d">Laatste 7 dagen</SelectItem>
              <SelectItem value="last_30d">Laatste 30 dagen</SelectItem>
              <SelectItem value="custom">Aangepaste periode</SelectItem>
            </SelectContent>
          </Select>

          {dateMode === 'custom' && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1.5 h-9 px-3 rounded-full glass glass-hover text-xs text-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {customSince} — {customUntil}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-4 space-y-3" align="end">
                <div className="space-y-1.5">
                  <Label className="text-xs">Van</Label>
                  <Input type="date" value={customSince} onChange={(e) => setCustomSince(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tot</Label>
                  <Input type="date" value={customUntil} onChange={(e) => setCustomUntil(e.target.value)} className="h-8 text-xs" />
                </div>
                <Button size="sm" className="w-full h-8 text-xs" onClick={() => fetchCampaigns(true)}>Toepassen</Button>
              </PopoverContent>
            </Popover>
          )}

          <button
            onClick={() => fetchCampaigns(true)}
            disabled={refreshing}
            className="flex items-center justify-center h-9 w-9 rounded-full glass glass-hover text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            title="Vernieuwen"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-px rounded-2xl glass border-0 overflow-hidden">
        <div className="p-5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Spend</p>
          <p className="text-2xl font-semibold mt-1.5 tabular-nums">{fmt(totalSpend)}</p>
        </div>
        <div className="p-5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Leads</p>
          <p className="text-2xl font-semibold mt-1.5 tabular-nums">{fmtNum(totalMetaLeads)}</p>
        </div>
        <div className="p-5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Kost per lead</p>
          <p className="text-2xl font-semibold mt-1.5 tabular-nums">
            {avgCostPerMetaLead > 0 ? fmt(avgCostPerMetaLead) : '—'}
          </p>
        </div>
        <div className="p-5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Gem. CTR</p>
          <p className="text-2xl font-semibold mt-1.5 tabular-nums">{fmtPct(avgCtr)}</p>
        </div>
        <div className="p-5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Unique clicks</p>
          <p className="text-2xl font-semibold mt-1.5 tabular-nums">{fmtNum(totalUniqueClicks)}</p>
        </div>
      </div>

      {/* Breadcrumb + search */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-h-[28px]">
          {drillLevel !== 'campaigns' && (
            <>
              <Button variant="ghost" size="sm" onClick={goBack} className="h-7 text-xs gap-1 px-2">
                <ArrowLeft className="h-3 w-3" /> Terug
              </Button>
              <span className="text-muted-foreground/50">|</span>
            </>
          )}
          <span
            className={cn(
              'transition-colors',
              drillLevel === 'campaigns' ? 'text-foreground font-medium' : 'cursor-pointer hover:text-foreground'
            )}
            onClick={() => { setDrillLevel('campaigns'); setSelectedCampaign(null); setSelectedAdset(null); setSearch(''); }}
          >
            Alle campagnes
          </span>
          {selectedCampaign && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span
                className={drillLevel === 'ads' ? 'cursor-pointer hover:text-foreground transition-colors max-w-[260px] truncate' : 'text-foreground font-medium max-w-[260px] truncate'}
                onClick={() => { if (drillLevel === 'ads') { setDrillLevel('adsets'); setSelectedAdset(null); setSearch(''); } }}
                title={selectedCampaign.name}
              >
                {selectedCampaign.name}
              </span>
            </>
          )}
          {selectedAdset && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground font-medium max-w-[260px] truncate" title={selectedAdset.name}>{selectedAdset.name}</span>
            </>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Zoek in ${levelLabel.toLowerCase()}...`}
            className="h-9 pl-9 w-64 text-xs rounded-full border-0 glass"
          />
        </div>
      </div>

      {/* Table */}
      {drillLoading ? (
        <Card className="glass border-0 rounded-2xl shadow-none"><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
      ) : currentData.length > 0 ? (
        <Card className="glass border-0 rounded-2xl shadow-none overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/40 hover:bg-transparent">
                  <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide h-10 w-[68px]">Status</TableHead>
                  <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide h-10">Naam</TableHead>
                  <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide text-right h-10">Spend</TableHead>
                  <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide text-right h-10">Leads</TableHead>
                  <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide text-right h-10">Kost per lead</TableHead>
                  <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide text-right h-10">CTR</TableHead>
                  <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide text-right h-10">Unique clicks</TableHead>
                  <TableHead className="w-10 h-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentData.map((row) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      'border-b border-border/30 last:border-0',
                      drillLevel !== 'ads' && 'cursor-pointer hover:bg-muted/40 transition-colors'
                    )}
                    onClick={() => {
                      if (drillLevel === 'campaigns') drillIntoAdsets(row);
                      else if (drillLevel === 'adsets') drillIntoAds(row);
                    }}
                  >
                    <TableCell className="py-3" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={row.status === 'ACTIVE'}
                        disabled={togglingId === row.id}
                        onCheckedChange={(checked) => {
                          const lvl = drillLevel === 'campaigns' ? 'campaign' : drillLevel === 'adsets' ? 'adset' : 'ad';
                          toggleStatus(row, lvl, checked);
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-sm font-medium max-w-[320px] truncate py-3">{row.name}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums py-3">{fmt(row.spend)}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums py-3">{row.meta_leads > 0 ? fmtNum(row.meta_leads) : '—'}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums py-3">{row.cost_per_meta_lead > 0 ? fmt(row.cost_per_meta_lead) : '—'}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums text-muted-foreground py-3">{fmtPct(row.ctr)}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums text-muted-foreground py-3">{row.unique_link_clicks > 0 ? fmtNum(row.unique_link_clicks) : '—'}</TableCell>
                    <TableCell className="text-right py-3 pr-4">
                      {drillLevel === 'ads' ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); fetchAdDetail(row.id); }}
                          title="Bekijk preview"
                          className="inline-flex items-center justify-center h-7 w-7 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 inline" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Geen {levelLabel.toLowerCase()} gevonden{search ? ' voor je zoekopdracht' : ''}.
          </p>
        </div>
      )}

      {fetchedAt && (
        <p className="text-[10px] text-muted-foreground text-right">
          Laatst opgehaald: {new Date(fetchedAt).toLocaleString('nl-NL')}
        </p>
      )}

      {/* Ad Detail Dialog */}
      <Dialog open={showAdDetail} onOpenChange={setShowAdDetail}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
            <DialogTitle className="text-sm font-medium text-muted-foreground">Advertentie preview</DialogTitle>
            <DialogDescription className="sr-only">Bekijk de details van deze advertentie</DialogDescription>
          </DialogHeader>

          {adDetailLoading ? (
            <div className="space-y-4 p-6">
              <Skeleton className="h-48 w-full rounded-lg" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : adDetail ? (
            <div className="px-6 py-5 space-y-6">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground leading-snug">{adDetail.name}</h3>
                <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  {adDetail.status === 'ACTIVE' ? 'Actief' : adDetail.status}
                </span>
              </div>

              {adDetail.image_url ? (
                <div className="flex justify-center">
                  <div className="rounded-xl overflow-hidden bg-muted/40 max-w-[280px]">
                    <img
                      src={adDetail.image_url}
                      alt={adDetail.name}
                      className="w-full max-h-[260px] object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                </div>
              ) : null}

              {adDetail.primary_text && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Tekst</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{adDetail.primary_text}</p>
                </div>
              )}

              {adDetail.headline && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Headline</p>
                  <p className="text-sm font-semibold text-foreground">{adDetail.headline}</p>
                </div>
              )}

              <div className="space-y-1 pt-2 border-t border-border/40">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Call-to-action</p>
                <p className="text-sm text-foreground">
                  {adDetail.cta_type ? (CTA_LABELS[adDetail.cta_type] || adDetail.cta_type) : <span className="text-muted-foreground">—</span>}
                </p>
              </div>

              {adDetail.lead_form && (
                <div className="space-y-3 pt-4 border-t border-border/40">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Lead formulier</p>
                      <p className="text-sm font-semibold text-foreground mt-1 truncate">{adDetail.lead_form.name}</p>
                    </div>
                    {adDetail.lead_form.questions.length > 0 && (
                      <span className="shrink-0 inline-flex items-center justify-center h-6 min-w-[24px] px-2 rounded-full bg-muted text-[11px] font-medium text-muted-foreground tabular-nums">
                        {adDetail.lead_form.questions.length}
                      </span>
                    )}
                  </div>
                  {adDetail.lead_form.questions.length > 0 && (
                    <div className="rounded-xl bg-muted/40 divide-y divide-border/40 overflow-hidden">
                      {adDetail.lead_form.questions.map((q, i) => (
                        <div key={i} className="flex items-center gap-3 px-3.5 py-2.5">
                          <span className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full bg-background text-[10px] font-medium text-muted-foreground tabular-nums">
                            {i + 1}
                          </span>
                          <span className="text-sm text-foreground leading-snug">{q.label || q.key}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">Kon advertentie details niet laden</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
