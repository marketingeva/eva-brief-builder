import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Radio, RefreshCw, TrendingUp, DollarSign, Users, AlertTriangle, Activity,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CPL_THRESHOLD = 50; // €50

interface Campaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget: number | null;
  lifetime_budget: number | null;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number;
  leads: number;
  cpl: number;
}

interface MetaAdsData {
  summary: {
    active_campaigns: number;
    total_campaigns: number;
    total_spend: number;
    total_leads: number;
    avg_cpl: number;
  };
  campaigns: Campaign[];
  date_range: { since: string; until: string };
  fetched_at: string;
}

export default function LiveAdsTab() {
  const [data, setData] = useState<MetaAdsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('last_7d');
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (showToast = false) => {
    try {
      setRefreshing(true);
      const { data: result, error } = await supabase.functions.invoke('fetch-meta-ads', {
        body: { dateRange },
      });

      if (error) throw error;
      setData(result as MetaAdsData);
      if (showToast) toast.success('Data vernieuwd');
    } catch (err: any) {
      console.error('Error fetching Meta ads:', err);
      toast.error('Kon Meta Ads data niet ophalen');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);

  const fmtNum = (n: number) => new Intl.NumberFormat('nl-NL').format(n);

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      ACTIVE: { label: 'Actief', cls: 'bg-green-100 text-green-800 border-green-200' },
      PAUSED: { label: 'Gepauzeerd', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
      ARCHIVED: { label: 'Gearchiveerd', cls: 'bg-muted text-muted-foreground' },
    };
    const s = map[status] || { label: status, cls: 'bg-muted text-muted-foreground' };
    return <Badge className={`text-[10px] font-medium ${s.cls}`}>{s.label}</Badge>;
  };

  const cplBadge = (cpl: number) => {
    if (cpl === 0) return <span className="text-xs text-muted-foreground">—</span>;
    if (cpl > CPL_THRESHOLD) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
          <AlertTriangle className="h-3 w-3" />
          {fmt(cpl)}
        </span>
      );
    }
    return <span className="text-xs font-medium text-green-700">{fmt(cpl)}</span>;
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            Live Ads
          </h2>
          <p className="text-xs text-muted-foreground">
            Real-time campagne prestaties via Meta Ads
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Vandaag</SelectItem>
              <SelectItem value="last_7d">Laatste 7 dagen</SelectItem>
              <SelectItem value="last_30d">Laatste 30 dagen</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Vernieuwen
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Actieve campagnes</p>
                <Activity className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-bold mt-1">{data.summary.active_campaigns}</p>
              <p className="text-[10px] text-muted-foreground">{data.summary.total_campaigns} totaal</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Totale spend</p>
                <DollarSign className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-bold mt-1">{fmt(data.summary.total_spend)}</p>
              <p className="text-[10px] text-muted-foreground">
                {data.date_range.since} — {data.date_range.until}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Gemiddelde CPL</p>
                <TrendingUp className={`h-4 w-4 ${data.summary.avg_cpl > CPL_THRESHOLD ? 'text-red-500' : 'text-green-600'}`} />
              </div>
              <p className={`text-2xl font-bold mt-1 ${data.summary.avg_cpl > CPL_THRESHOLD ? 'text-red-600' : ''}`}>
                {data.summary.avg_cpl > 0 ? fmt(data.summary.avg_cpl) : '—'}
              </p>
              {data.summary.avg_cpl > CPL_THRESHOLD && (
                <p className="text-[10px] text-red-500 flex items-center gap-1 mt-0.5">
                  <AlertTriangle className="h-3 w-3" /> Boven drempelwaarde (€{CPL_THRESHOLD})
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
              <p className="text-2xl font-bold mt-1">{fmtNum(data.summary.total_leads)}</p>
              <p className="text-[10px] text-muted-foreground">
                {data.summary.total_leads > 0
                  ? `${fmt(data.summary.total_spend / data.summary.total_leads)} per lead`
                  : 'Geen leads in periode'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Campaigns table */}
      {data && data.campaigns.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Campagnes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Campagne</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Budget</TableHead>
                  <TableHead className="text-xs text-right">Spend</TableHead>
                  <TableHead className="text-xs text-right">Impressies</TableHead>
                  <TableHead className="text-xs text-right">Clicks</TableHead>
                  <TableHead className="text-xs text-right">Leads</TableHead>
                  <TableHead className="text-xs text-right">CPL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.campaigns.map((c) => (
                  <TableRow key={c.id} className={c.cpl > CPL_THRESHOLD ? 'bg-red-50/50' : ''}>
                    <TableCell className="text-xs font-medium max-w-[200px] truncate">
                      {c.name}
                    </TableCell>
                    <TableCell>{statusBadge(c.status)}</TableCell>
                    <TableCell className="text-xs text-right text-muted-foreground">
                      {c.daily_budget ? `${fmt(c.daily_budget)}/dag` : c.lifetime_budget ? fmt(c.lifetime_budget) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">{fmt(c.spend)}</TableCell>
                    <TableCell className="text-xs text-right">{fmtNum(c.impressions)}</TableCell>
                    <TableCell className="text-xs text-right">{fmtNum(c.clicks)}</TableCell>
                    <TableCell className="text-xs text-right font-medium">{c.leads > 0 ? fmtNum(c.leads) : '—'}</TableCell>
                    <TableCell className="text-right">{cplBadge(c.cpl)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data && data.campaigns.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Radio className="mx-auto mb-3 h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm font-medium text-muted-foreground">Geen campagnes gevonden</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Er zijn geen campagnes gevonden in het gekoppelde Meta Ads account voor deze periode.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Footer info */}
      {data && (
        <p className="text-[10px] text-muted-foreground text-right">
          Laatst opgehaald: {new Date(data.fetched_at).toLocaleString('nl-NL')}
        </p>
      )}
    </div>
  );
}
