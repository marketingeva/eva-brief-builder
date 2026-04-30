import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RefreshCw, CalendarDays, ArrowLeft, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';

interface DailyPoint {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  reach: number;
  leads: number;
  cpl: number;
  meta_leads: number;
  cost_per_meta_lead: number;
  unique_link_clicks: number;
}

interface CampaignAgg {
  id: string;
  name: string;
  spend: number;
  meta_leads: number;
  cost_per_meta_lead: number;
  ctr: number;
  unique_link_clicks: number;
  impressions: number;
  clicks: number;
}

interface CampaignDailyPoint {
  campaign_id: string;
  campaign_name: string;
  date: string;
  spend: number;
  meta_leads: number;
  cost_per_meta_lead: number;
}

// Distinct, accessible palette for multi-line charts (works in light + dark)
const SERIES_COLORS = [
  'hsl(265 85% 65%)', // primary purple
  'hsl(45 95% 55%)',  // accent yellow
  'hsl(190 85% 55%)', // cyan
  'hsl(340 80% 65%)', // pink
  'hsl(150 65% 50%)', // green
  'hsl(20 90% 60%)',  // orange
  'hsl(220 80% 65%)', // blue
  'hsl(285 60% 70%)', // lavender
];

function todayStr() { return new Date().toISOString().split('T')[0]; }
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000).toISOString().split('T')[0]; }

const fmtEUR = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const fmtEUR2 = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);
const fmtNum = (n: number) => new Intl.NumberFormat('nl-NL').format(Math.round(n));
const fmtDate = (s: string) => {
  const d = new Date(s);
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
};

export default function AdsDashboardsPage() {
  const [days, setDays] = useState<DailyPoint[]>([]);
  const [perCampaign, setPerCampaign] = useState<CampaignAgg[]>([]);
  const [perCampaignDaily, setPerCampaignDaily] = useState<CampaignDailyPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [dateMode, setDateMode] = useState<'preset' | 'custom'>('preset');
  const [preset, setPreset] = useState('last_7d');
  const [customSince, setCustomSince] = useState(daysAgo(7));
  const [customUntil, setCustomUntil] = useState(todayStr());

  const buildBody = useCallback(() => {
    const base: Record<string, any> = { daily: true };
    if (dateMode === 'custom') return { ...base, since: customSince, until: customUntil };
    return { ...base, dateRange: preset };
  }, [dateMode, preset, customSince, customUntil]);

  const fetchData = useCallback(async (showToast = false) => {
    try {
      setRefreshing(true);
      const { data, error } = await supabase.functions.invoke('fetch-meta-ads', {
        body: buildBody(),
      });
      if (error) throw error;
      const sorted = ((data as any).days || []).sort((a: DailyPoint, b: DailyPoint) =>
        a.date.localeCompare(b.date)
      );
      setDays(sorted);
      setPerCampaign(((data as any).per_campaign || []).sort(
        (a: CampaignAgg, b: CampaignAgg) => b.spend - a.spend
      ));
      setPerCampaignDaily(((data as any).per_campaign_daily || []) as CampaignDailyPoint[]);
      if (showToast) toast.success('Dashboards vernieuwd');
    } catch (err) {
      console.error(err);
      toast.error('Kon dashboards niet laden');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildBody]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const totals = useMemo(() => {
    const spend = days.reduce((s, d) => s + d.spend, 0);
    const leads = days.reduce((s, d) => s + d.meta_leads, 0);
    const clicks = days.reduce((s, d) => s + d.unique_link_clicks, 0);
    const impressions = days.reduce((s, d) => s + d.impressions, 0);
    const allClicks = days.reduce((s, d) => s + d.clicks, 0);
    return {
      spend,
      leads,
      clicks,
      cpl: leads > 0 ? spend / leads : 0,
      ctr: impressions > 0 ? (allClicks / impressions) * 100 : 0,
    };
  }, [days]);

  // Add nice chart values
  const chartDays = useMemo(
    () => days.map((d) => ({
      ...d,
      label: fmtDate(d.date),
      cpl_round: d.cost_per_meta_lead || 0,
    })),
    [days]
  );

  const topCampaigns = useMemo(() => perCampaign.slice(0, 8).map((c) => ({
    ...c,
    short: c.name.length > 22 ? c.name.slice(0, 22) + '…' : c.name,
  })), [perCampaign]);

  // Top campaigns by leads, used as the series for multi-line charts
  const leadSeriesCampaigns = useMemo(() => {
    return [...perCampaign]
      .sort((a, b) => b.meta_leads - a.meta_leads)
      .slice(0, 6)
      .filter((c) => c.meta_leads > 0 || c.spend > 0);
  }, [perCampaign]);

  // Wide-format daily data: one row per date, one column per campaign
  const leadsPerCampaignDaily = useMemo(() => {
    if (days.length === 0 || leadSeriesCampaigns.length === 0) return [];
    const dateOrder = days.map((d) => d.date);
    const idToName = new Map(leadSeriesCampaigns.map((c) => [c.id, c.name]));

    const byDate = new Map<string, Record<string, any>>();
    for (const d of dateOrder) {
      byDate.set(d, { date: d, label: fmtDate(d) });
    }
    for (const row of perCampaignDaily) {
      if (!idToName.has(row.campaign_id)) continue;
      const bucket = byDate.get(row.date);
      if (!bucket) continue;
      bucket[`leads_${row.campaign_id}`] = row.meta_leads;
      bucket[`cpl_${row.campaign_id}`] = row.cost_per_meta_lead || null;
    }
    return dateOrder.map((d) => byDate.get(d)!);
  }, [days, perCampaignDaily, leadSeriesCampaigns]);

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
        <div className="grid lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  const tooltipStyle = {
    background: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 12,
    fontSize: 12,
    color: 'hsl(var(--popover-foreground))',
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/ads-manager">
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground">
                <ArrowLeft className="h-3 w-3" /> Ads Manager
              </Button>
            </Link>
          </div>
          <h2 className="text-base font-semibold text-foreground mt-1 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Dashboards
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Inzichten en trends over alle actieve campagnes
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
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
                <Button size="sm" className="w-full h-8 text-xs" onClick={() => fetchData(true)}>Toepassen</Button>
              </PopoverContent>
            </Popover>
          )}

          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center justify-center h-9 w-9 rounded-full glass glass-hover text-foreground disabled:opacity-50"
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
          <p className="text-2xl font-semibold mt-1.5 tabular-nums">{fmtEUR2(totals.spend)}</p>
        </div>
        <div className="p-5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Leads</p>
          <p className="text-2xl font-semibold mt-1.5 tabular-nums">{fmtNum(totals.leads)}</p>
        </div>
        <div className="p-5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Kost per lead</p>
          <p className="text-2xl font-semibold mt-1.5 tabular-nums">
            {totals.cpl > 0 ? fmtEUR2(totals.cpl) : '—'}
          </p>
        </div>
        <div className="p-5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Gem. CTR</p>
          <p className="text-2xl font-semibold mt-1.5 tabular-nums">{totals.ctr.toFixed(2)}%</p>
        </div>
        <div className="p-5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Unique clicks</p>
          <p className="text-2xl font-semibold mt-1.5 tabular-nums">{fmtNum(totals.clicks)}</p>
        </div>
      </div>

      {/* Leads per dag — per campagne */}
      <Card className="glass border-0 rounded-2xl shadow-none">
        <CardContent className="p-6">
          <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-semibold">Leads per dag — per campagne</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Meta leads per dag, opgesplitst per campagne (top {leadSeriesCampaigns.length})
              </p>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">{fmtNum(totals.leads)} totaal</span>
          </div>
          <div className="h-72">
            {leadSeriesCampaigns.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Geen leaddata in deze periode
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={leadsPerCampaignDaily} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number, name: string) => [fmtNum(v), name]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    iconType="circle"
                  />
                  {leadSeriesCampaigns.map((c, i) => (
                    <Line
                      key={c.id}
                      type="monotone"
                      dataKey={`leads_${c.id}`}
                      name={c.name}
                      stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Kost per Meta lead per dag — per campagne + Spend per dag */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="glass border-0 rounded-2xl shadow-none">
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold">Kost per Meta lead per dag — per campagne</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 mb-4">Lager is beter • top {leadSeriesCampaigns.length} campagnes</p>
            <div className="h-64">
              {leadSeriesCampaigns.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  Geen leaddata in deze periode
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={leadsPerCampaignDaily} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                      tickFormatter={(v) => `€${v}`} />
                    <Tooltip contentStyle={tooltipStyle}
                      formatter={(v: number, name: string) => [fmtEUR2(v), name]} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
                    {leadSeriesCampaigns.map((c, i) => (
                      <Line
                        key={c.id}
                        type="monotone"
                        dataKey={`cpl_${c.id}`}
                        name={c.name}
                        stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 2.5 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-0 rounded-2xl shadow-none">
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold">Spend per dag</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 mb-4">Dagelijkse advertentie-uitgaven</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartDays} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `€${v}`} />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={(v: number) => [fmtEUR2(v), 'Spend']} />
                  <Bar dataKey="spend" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CTR per dag + Unique clicks */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="glass border-0 rounded-2xl shadow-none">
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold">Click-through rate (CTR)</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 mb-4">Aandeel klikkers per impressie, per dag</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartDays} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `${v.toFixed(1)}%`} />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={(v: number) => [`${v.toFixed(2)}%`, 'CTR']} />
                  <Line type="monotone" dataKey="ctr" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-0 rounded-2xl shadow-none">
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold">Unique clicks per dag</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 mb-4">Unieke linkkliks per dag</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartDays} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="clicksFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={(v: number) => [fmtNum(v), 'Unique clicks']} />
                  <Area type="monotone" dataKey="unique_link_clicks" stroke="hsl(var(--accent))" strokeWidth={2} fill="url(#clicksFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per campaign breakdown */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="glass border-0 rounded-2xl shadow-none">
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold">Spend per campagne</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 mb-4">Top 8 campagnes op uitgaven</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCampaigns} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `€${v}`} />
                  <YAxis type="category" dataKey="short" stroke="hsl(var(--muted-foreground))" fontSize={11}
                    tickLine={false} axisLine={false} width={140} />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={(v: number) => [fmtEUR2(v), 'Spend']}
                    labelFormatter={(l, p) => p?.[0]?.payload?.name || l} />
                  <Bar dataKey="spend" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-0 rounded-2xl shadow-none">
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold">Kost per lead per campagne</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 mb-4">Vergelijk efficiëntie per campagne</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCampaigns.filter((c) => c.cost_per_meta_lead > 0)}
                  layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `€${v}`} />
                  <YAxis type="category" dataKey="short" stroke="hsl(var(--muted-foreground))" fontSize={11}
                    tickLine={false} axisLine={false} width={140} />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={(v: number) => [fmtEUR2(v), 'Kost per lead']}
                    labelFormatter={(l, p) => p?.[0]?.payload?.name || l} />
                  <Bar dataKey="cost_per_meta_lead" fill="hsl(var(--accent))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leads per campaign */}
      <Card className="glass border-0 rounded-2xl shadow-none">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold">Leads per campagne</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 mb-4">Top 8 campagnes op aantal leads</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...topCampaigns].sort((a, b) => b.meta_leads - a.meta_leads)}
                margin={{ top: 5, right: 10, left: -10, bottom: 40 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="short" stroke="hsl(var(--muted-foreground))" fontSize={11}
                  tickLine={false} axisLine={false}
                  angle={-20} textAnchor="end" height={50} interval={0} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={(v: number) => [fmtNum(v), 'Leads']}
                  labelFormatter={(l, p) => p?.[0]?.payload?.name || l} />
                <Bar dataKey="meta_leads" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
