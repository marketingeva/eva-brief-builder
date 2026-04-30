import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
  Radio, RefreshCw, TrendingUp, DollarSign, Users, AlertTriangle, Activity,
  ChevronRight, ArrowLeft, CalendarDays, Eye, Sparkles, ExternalLink, FileText,
  Image as ImageIcon, Type, MousePointerClick, ClipboardList,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CPL_THRESHOLD = 50;

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

interface Props {
  clientName: string;
  clientId: string;
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

export default function LiveAdsTab({ clientName, clientId }: Props) {
  const [campaigns, setCampaigns] = useState<MetricRow[]>([]);
  const [filteredCampaigns, setFilteredCampaigns] = useState<MetricRow[]>([]);
  const [adsets, setAdsets] = useState<MetricRow[]>([]);
  const [ads, setAds] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState('');
  const [drillLevel, setDrillLevel] = useState<'campaigns' | 'adsets' | 'ads'>('campaigns');
  const [selectedCampaign, setSelectedCampaign] = useState<MetricRow | null>(null);
  const [selectedAdset, setSelectedAdset] = useState<MetricRow | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  // Ad detail state
  const [adDetail, setAdDetail] = useState<AdDetail | null>(null);
  const [adDetailLoading, setAdDetailLoading] = useState(false);
  const [showAdDetail, setShowAdDetail] = useState(false);
  const [creatingBriefing, setCreatingBriefing] = useState(false);

  // Date range state
  const [dateMode, setDateMode] = useState<'preset' | 'custom'>('preset');
  const [preset, setPreset] = useState('last_7d');
  const [customSince, setCustomSince] = useState(daysAgo(7));
  const [customUntil, setCustomUntil] = useState(todayStr());

  const filterByClient = useCallback((allCampaigns: MetricRow[]) => {
    const needle = clientName.toLowerCase().replace(/\s+/g, '');
    return allCampaigns.filter((c) => {
      const haystack = c.name.toLowerCase().replace(/\s+/g, '');
      return haystack.includes(needle);
    });
  }, [clientName]);

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
      const all = (result as any).campaigns || [];
      setCampaigns(all);
      setFilteredCampaigns(filterByClient(all));
      setFetchedAt((result as any).fetched_at || '');
      setDrillLevel('campaigns');
      setSelectedCampaign(null);
      setSelectedAdset(null);
      if (showToast) toast.success('Data vernieuwd');
    } catch (err) {
      console.error('Error fetching Meta ads:', err);
      toast.error('Kon Meta Ads data niet ophalen');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildBody, filterByClient]);

  useEffect(() => {
    setLoading(true);
    fetchCampaigns();
  }, [fetchCampaigns]);

  const drillIntoAdsets = async (campaign: MetricRow) => {
    setDrillLoading(true);
    setSelectedCampaign(campaign);
    try {
      const { data: result, error } = await supabase.functions.invoke('fetch-meta-ads', {
        body: buildBody({ campaignId: campaign.id }),
      });
      if (error) throw error;
      setAdsets((result as any).data || []);
      setDrillLevel('adsets');
    } catch (err) {
      console.error('Error fetching adsets:', err);
      toast.error('Kon advertentiesets niet ophalen');
    } finally {
      setDrillLoading(false);
    }
  };

  const drillIntoAds = async (adset: MetricRow) => {
    setDrillLoading(true);
    setSelectedAdset(adset);
    try {
      const { data: result, error } = await supabase.functions.invoke('fetch-meta-ads', {
        body: buildBody({ adsetId: adset.id }),
      });
      if (error) throw error;
      setAds((result as any).data || []);
      setDrillLevel('ads');
    } catch (err) {
      console.error('Error fetching ads:', err);
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
      console.error('Error fetching ad detail:', err);
      toast.error('Kon advertentie details niet ophalen');
      setShowAdDetail(false);
    } finally {
      setAdDetailLoading(false);
    }
  };

  const createSimilarBriefing = async () => {
    if (!adDetail) return;
    setCreatingBriefing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Niet ingelogd');

      // Create a campaign request based on the ad
      const { data: campaignReq, error: crErr } = await supabase
        .from('campaign_requests')
        .insert({
          client_id: clientId,
          created_by: user.id,
          role_title: adDetail.name,
          objective: 'lead_generation',
          creative_type: 'static',
          campaign_focus: 'variant',
          angle_preference: 'anders_dan_huidig',
          internal_notes: [
            `📋 Gebaseerd op live ad: ${adDetail.name}`,
            '',
            adDetail.primary_text ? `📝 Originele tekst:\n${adDetail.primary_text}` : '',
            adDetail.headline ? `🔤 Originele headline: ${adDetail.headline}` : '',
            adDetail.cta_type ? `🔘 CTA: ${CTA_LABELS[adDetail.cta_type] || adDetail.cta_type}` : '',
            adDetail.image_url ? `🖼️ Originele afbeelding: ${adDetail.image_url}` : '',
            adDetail.lead_form ? `📄 Formulier: ${adDetail.lead_form.name}` : '',
            '',
            '💡 Opdracht: Maak een vergelijkbare advertentie met variaties:',
            '  - Andere kleuren / visuele stijl',
            '  - Andere headline / hook',
            '  - Andere foto / beeldkeuze',
            '  - Behoud dezelfde doelgroep en boodschap',
          ].filter(Boolean).join('\n'),
          status: 'draft',
        })
        .select()
        .single();

      if (crErr) throw crErr;

      toast.success('Briefing-verzoek aangemaakt! Ga naar Briefings om te genereren.');
      setShowAdDetail(false);
    } catch (err) {
      console.error('Error creating briefing:', err);
      toast.error('Kon briefing niet aanmaken');
    } finally {
      setCreatingBriefing(false);
    }
  };

  const goBack = () => {
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

  const currentData = drillLevel === 'campaigns' ? filteredCampaigns : drillLevel === 'adsets' ? adsets : ads;
  const totalSpend = currentData.reduce((s, c) => s + c.spend, 0);
  const totalLeads = currentData.reduce((s, c) => s + c.leads, 0);
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;

  const cplBadge = (cpl: number) => {
    if (cpl === 0) return <span className="text-xs text-muted-foreground">—</span>;
    if (cpl > CPL_THRESHOLD) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
          <AlertTriangle className="h-3 w-3" />
          {fmt(cpl)}
        </span>
      );
    }
    return <span className="text-xs font-medium text-success">{fmt(cpl)}</span>;
  };

  const levelLabel = drillLevel === 'campaigns' ? 'Campagnes' : drillLevel === 'adsets' ? 'Advertentiesets' : 'Advertenties';

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="glass border-0 rounded-2xl shadow-none"><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card className="glass border-0 rounded-2xl shadow-none"><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* Header — minimal */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Live Ads</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Actieve campagnes met "{clientName}" in de naam
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Select
            value={dateMode === 'preset' ? preset : 'custom'}
            onValueChange={(v) => {
              if (v === 'custom') {
                setDateMode('custom');
              } else {
                setDateMode('preset');
                setPreset(v);
              }
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

      {/* Summary stats — clean numeric row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl glass border-0 overflow-hidden">
        <div className="p-5 bg-transparent">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Actief</p>
          <p className="text-2xl font-semibold mt-1.5 tabular-nums">{currentData.length}</p>
        </div>
        <div className="p-5 bg-transparent">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Spend</p>
          <p className="text-2xl font-semibold mt-1.5 tabular-nums">{fmt(totalSpend)}</p>
        </div>
        <div className="p-5 bg-transparent">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Gem. CPL</p>
          <p className={cn(
            'text-2xl font-semibold mt-1.5 tabular-nums',
            avgCpl > CPL_THRESHOLD && 'text-destructive'
          )}>
            {avgCpl > 0 ? fmt(avgCpl) : '—'}
          </p>
        </div>
        <div className="p-5 bg-transparent">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Leads</p>
          <p className="text-2xl font-semibold mt-1.5 tabular-nums">{fmtNum(totalLeads)}</p>
        </div>
      </div>

      {/* Breadcrumb */}
      {drillLevel !== 'campaigns' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Button variant="ghost" size="sm" onClick={goBack} className="h-7 text-xs gap-1 px-2">
            <ArrowLeft className="h-3 w-3" /> Terug
          </Button>
          <span className="text-muted-foreground/50">|</span>
          <span className="cursor-pointer hover:text-foreground transition-colors"
            onClick={() => { setDrillLevel('campaigns'); setSelectedCampaign(null); setSelectedAdset(null); }}>
            Campagnes
          </span>
          {selectedCampaign && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span
                className={drillLevel === 'ads' ? 'cursor-pointer hover:text-foreground transition-colors' : 'text-foreground font-medium'}
                onClick={() => { if (drillLevel === 'ads') { setDrillLevel('adsets'); setSelectedAdset(null); } }}>
                {selectedCampaign.name}
              </span>
            </>
          )}
          {selectedAdset && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground font-medium">{selectedAdset.name}</span>
            </>
          )}
        </div>
      )}

      {/* Table */}
      {drillLoading ? (
        <Card className="glass border-0 rounded-2xl shadow-none"><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
      ) : currentData.length > 0 ? (
        <Card className="glass border-0 rounded-2xl shadow-none overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">{levelLabel}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Naam</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Spend</TableHead>
                  <TableHead className="text-xs text-right">Leads</TableHead>
                  <TableHead className="text-xs text-right">Gem. CPL</TableHead>
                  <TableHead className="text-xs text-right">CTR</TableHead>
                  <TableHead className="text-xs text-right">Impressies</TableHead>
                  <TableHead className="text-xs w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentData.map((row) => (
                  <TableRow
                    key={row.id}
                    className={`${row.cpl > CPL_THRESHOLD ? 'bg-destructive/5' : ''} ${drillLevel !== 'ads' ? 'cursor-pointer hover:bg-muted/70' : ''}`}
                    onClick={() => {
                      if (drillLevel === 'campaigns') drillIntoAdsets(row);
                      else if (drillLevel === 'adsets') drillIntoAds(row);
                    }}
                  >
                    <TableCell className="text-xs font-medium max-w-[220px] truncate">{row.name}</TableCell>
                    <TableCell>
                      <Badge className="text-[10px] font-medium bg-success/15 text-success border-success/20">Actief</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">{fmt(row.spend)}</TableCell>
                    <TableCell className="text-xs text-right font-medium">{row.leads > 0 ? fmtNum(row.leads) : '—'}</TableCell>
                    <TableCell className="text-right">{cplBadge(row.cpl)}</TableCell>
                    <TableCell className="text-xs text-right">{fmtPct(row.ctr)}</TableCell>
                    <TableCell className="text-xs text-right">{fmtNum(row.impressions)}</TableCell>
                    <TableCell className="text-right">
                      {drillLevel === 'ads' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={(e) => { e.stopPropagation(); fetchAdDetail(row.id); }}
                          title="Bekijk preview"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass border-0 rounded-2xl shadow-none">
          <CardContent className="p-12 text-center">
            <Radio className="mx-auto mb-3 h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm font-medium text-muted-foreground">
              Geen {drillLevel === 'campaigns' ? `actieve campagnes met "${clientName}"` : drillLevel === 'adsets' ? 'actieve advertentiesets' : 'actieve advertenties'} gevonden
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Alleen items waarvan de on/off-schakelaar op "on" staat worden getoond.
            </p>
          </CardContent>
        </Card>
      )}

      {fetchedAt && (
        <p className="text-[10px] text-muted-foreground text-right">
          Laatst opgehaald: {new Date(fetchedAt).toLocaleString('nl-NL')}
        </p>
      )}

      {/* ── Ad Detail Dialog ── */}
      <Dialog open={showAdDetail} onOpenChange={setShowAdDetail}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              Advertentie Preview
            </DialogTitle>
            <DialogDescription className="sr-only">
              Bekijk de details van deze advertentie
            </DialogDescription>
          </DialogHeader>

          {adDetailLoading ? (
            <div className="space-y-4 py-4">
              <Skeleton className="h-48 w-full rounded-lg" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-1/2" />
            </div>
          ) : adDetail ? (
            <div className="space-y-5 py-2">
              {/* Ad name */}
              <div>
                <p className="text-sm font-semibold text-foreground">{adDetail.name}</p>
                <Badge className="mt-1 text-[10px] bg-success/15 text-success border-success/20">
                  {adDetail.status === 'ACTIVE' ? 'Actief' : adDetail.status}
                </Badge>
              </div>

              {/* Image preview */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Afbeelding</span>
                </div>
                {adDetail.image_url ? (
                  <div className="relative rounded-lg overflow-hidden border bg-muted">
                    <img
                      src={adDetail.image_url}
                      alt={adDetail.name}
                      className="w-full max-h-[300px] object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        const fallback = (e.target as HTMLImageElement).nextElementSibling;
                        if (fallback) (fallback as HTMLElement).style.display = 'flex';
                      }}
                    />
                    <div className="hidden items-center justify-center h-48 text-muted-foreground">
                      <div className="text-center">
                        <ImageIcon className="mx-auto h-8 w-8 mb-2 opacity-30" />
                        <p className="text-xs">Afbeelding kan niet worden geladen</p>
                        {adDetail.image_url && (
                          <a href={adDetail.image_url} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-primary flex items-center gap-1 mt-1 justify-center">
                            Bekijk origineel <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 rounded-lg border border-dashed bg-muted/50">
                    <p className="text-xs text-muted-foreground">Geen afbeelding beschikbaar</p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Primary text */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Type className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Advertentietekst</span>
                </div>
                {adDetail.primary_text ? (
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-muted/30 rounded-lg p-3 border">
                    {adDetail.primary_text}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Geen tekst beschikbaar</p>
                )}
              </div>

              {/* Headline */}
              {adDetail.headline && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Headline</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{adDetail.headline}</p>
                </div>
              )}

              {/* Description */}
              {adDetail.description && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Beschrijving</span>
                  <p className="text-sm text-muted-foreground mt-0.5">{adDetail.description}</p>
                </div>
              )}

              <Separator />

              {/* CTA */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <MousePointerClick className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Call-to-Action</span>
                </div>
                {adDetail.cta_type ? (
                  <Badge variant="outline" className="text-xs">
                    {CTA_LABELS[adDetail.cta_type] || adDetail.cta_type}
                  </Badge>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Geen CTA ingesteld</p>
                )}
              </div>

              {/* Destination */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Destination</span>
                </div>
                {adDetail.link_url && !/^https?:\/\/(www\.)?fb\.me\/?$/i.test(adDetail.link_url) ? (
                  <a href={adDetail.link_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-primary hover:underline break-all">
                    {adDetail.link_url}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Geen bestemming beschikbaar</p>
                )}
              </div>

              {/* Lead form */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Lead formulier</span>
                </div>
                {adDetail.lead_form ? (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <p className="text-sm font-medium">{adDetail.lead_form.name}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {adDetail.lead_form.status === 'ACTIVE' ? 'Actief' : adDetail.lead_form.status}
                    </Badge>
                    {adDetail.lead_form.questions.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[10px] font-medium text-muted-foreground mb-1">Vragen:</p>
                        <ul className="space-y-0.5">
                          {adDetail.lead_form.questions.map((q, i) => (
                            <li key={i} className="text-xs text-foreground flex items-center gap-1.5">
                              <span className="h-1 w-1 rounded-full bg-primary/50 shrink-0" />
                              {q.label || q.key}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Geen formulier gekoppeld</p>
                )}
              </div>

              <Separator />

              {/* Create similar briefing button */}
              <Button
                onClick={createSimilarBriefing}
                disabled={creatingBriefing}
                className="w-full gap-2"
                size="lg"
              >
                <Sparkles className="h-4 w-4" />
                {creatingBriefing ? 'Briefing aanmaken...' : 'Maak vergelijkbare advertentie (briefing)'}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center -mt-2">
                Maakt een briefing-verzoek aan met variaties op deze ad: andere kleuren, header, foto, etc.
              </p>
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Kon advertentie details niet laden</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
