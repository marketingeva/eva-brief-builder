import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Radio, RefreshCw, TrendingUp, DollarSign, Users, AlertTriangle, Activity,
  ChevronRight, ArrowLeft, CalendarDays,
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

interface Props {
  clientName: string;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}
function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString().split('T')[0];
}

export default function LiveAdsTab({ clientName }: Props) {
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
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            Live Ads — {clientName}
          </h2>
          <p className="text-xs text-muted-foreground">
            Actieve campagnes (on/off = on) met "{clientName}" in de naam
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range controls */}
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
            <SelectTrigger className="w-[160px] h-8 text-xs">
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
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {customSince} — {customUntil}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-4 space-y-3" align="end">
                <div className="space-y-1.5">
                  <Label className="text-xs">Van</Label>
                  <Input
                    type="date"
                    value={customSince}
                    onChange={(e) => setCustomSince(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tot</Label>
                  <Input
                    type="date"
                    value={customUntil}
                    onChange={(e) => setCustomUntil(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={() => fetchCampaigns(true)}
                >
                  Toepassen
                </Button>
              </PopoverContent>
            </Popover>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchCampaigns(true)}
            disabled={refreshing}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Vernieuwen
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Actief ({levelLabel})</p>
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold mt-1">{currentData.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Totale spend</p>
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold mt-1">{fmt(totalSpend)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Gemiddelde CPL</p>
              <TrendingUp className={`h-4 w-4 ${avgCpl > CPL_THRESHOLD ? 'text-destructive' : 'text-success'}`} />
            </div>
            <p className={`text-2xl font-bold mt-1 ${avgCpl > CPL_THRESHOLD ? 'text-destructive' : ''}`}>
              {avgCpl > 0 ? fmt(avgCpl) : '—'}
            </p>
            {avgCpl > CPL_THRESHOLD && (
              <p className="text-[10px] text-destructive flex items-center gap-1 mt-0.5">
                <AlertTriangle className="h-3 w-3" /> Boven €{CPL_THRESHOLD}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Totale leads</p>
              <Users className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold mt-1">{fmtNum(totalLeads)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Breadcrumb */}
      {drillLevel !== 'campaigns' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Button variant="ghost" size="sm" onClick={goBack} className="h-7 text-xs gap-1 px-2">
            <ArrowLeft className="h-3 w-3" /> Terug
          </Button>
          <span className="text-muted-foreground/50">|</span>
          <span
            className="cursor-pointer hover:text-foreground transition-colors"
            onClick={() => { setDrillLevel('campaigns'); setSelectedCampaign(null); setSelectedAdset(null); }}
          >
            Campagnes
          </span>
          {selectedCampaign && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span
                className={drillLevel === 'ads' ? 'cursor-pointer hover:text-foreground transition-colors' : 'text-foreground font-medium'}
                onClick={() => { if (drillLevel === 'ads') { setDrillLevel('adsets'); setSelectedAdset(null); } }}
              >
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
        <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
      ) : currentData.length > 0 ? (
        <Card>
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
                  {drillLevel !== 'ads' && <TableHead className="text-xs w-10"></TableHead>}
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
                    {drillLevel !== 'ads' && (
                      <TableCell className="text-right">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
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
    </div>
  );
}
