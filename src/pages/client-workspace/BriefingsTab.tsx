import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Sparkles, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import NewBriefingDialog from '@/components/briefings/NewBriefingDialog';
import BriefingDetailView from '@/components/briefings/BriefingDetailView';
import type { Json } from '@/integrations/supabase/types';

interface Props {
  clientId: string;
  clientName: string;
}

interface BriefingRequest {
  id: string;
  functions: string[];
  location: string | null;
  status: string | null;
  week_number: number | null;
  created_at: string;
  care_type: string | null;
  creative_type: string | null;
  style: string | null;
}

interface GeneratedBriefing {
  id: string;
  campaign_request_id: string;
  content: Json;
  status: string | null;
  version: number;
  week_number: number | null;
  created_at: string;
}

interface BriefingRow {
  id: string;
  briefing_id: string;
  is_new: boolean | null;
  functie: string | null;
  locatie: string | null;
  hook: string | null;
  usps: string | null;
  omschrijving: string | null;
  creative_inspiratie: string | null;
  sort_order: number | null;
}

const statusColors: Record<string, string> = {
  concept: 'bg-muted text-muted-foreground',
  draft: 'bg-muted text-muted-foreground',
  generating: 'bg-primary/10 text-primary animate-pulse',
  generated: 'bg-primary/10 text-primary',
  in_review: 'bg-amber-500/10 text-amber-600',
  approved: 'bg-green-500/10 text-green-600',
  sent_to_designer: 'bg-warning/10 text-warning',
  delivered: 'bg-green-500/10 text-green-600',
  error: 'bg-destructive/10 text-destructive',
};

const statusLabels: Record<string, string> = {
  concept: 'Concept',
  draft: 'Concept',
  generating: 'Genereert...',
  generated: 'Gegenereerd',
  in_review: 'In Review',
  approved: 'Goedgekeurd',
  sent_to_designer: 'Naar designer',
  delivered: 'Opgeleverd',
  error: 'Fout',
};

export default function BriefingsTab({ clientId, clientName }: Props) {
  const [requests, setRequests] = useState<BriefingRequest[]>([]);
  const [briefings, setBriefings] = useState<GeneratedBriefing[]>([]);
  const [briefingRows, setBriefingRows] = useState<BriefingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekFilter, setWeekFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [reqRes, briefRes, rowRes] = await Promise.all([
      supabase
        .from('briefing_requests')
        .select('id, functions, location, status, week_number, created_at, care_type, creative_type, style')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false }),
      supabase
        .from('generated_briefings')
        .select('id, campaign_request_id, content, status, version, week_number, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false }),
      supabase
        .from('briefing_rows')
        .select('id, briefing_id, is_new, functie, locatie, hook, usps, omschrijving, creative_inspiratie, sort_order')
        .eq('client_id', clientId)
        .order('sort_order', { ascending: true }),
    ]);
    setRequests(reqRes.data || []);
    setBriefings(briefRes.data || []);
    setBriefingRows(rowRes.data || []);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  const weeks = [...new Set([
    ...requests.map(r => r.week_number).filter(Boolean),
    ...briefings.map(b => b.week_number).filter(Boolean),
  ])].sort((a, b) => (b || 0) - (a || 0));

  // Auto-generated briefings (no matching request)
  const requestIds = new Set(requests.map(r => r.id));
  const autoBriefings = briefings.filter(b => !requestIds.has(b.campaign_request_id));

  const filtered = requests.filter(r => {
    if (weekFilter !== 'all' && String(r.week_number) !== weekFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    return true;
  });

  const filteredAuto = autoBriefings.filter(b => {
    if (weekFilter !== 'all' && String(b.week_number) !== weekFilter) return false;
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    return true;
  });

  const grouped = filtered.reduce<Record<string, BriefingRequest[]>>((acc, r) => {
    const key = r.week_number ? `Week ${r.week_number}` : 'Geen week';
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  // Group auto-briefings by week too
  const autoGrouped = filteredAuto.reduce<Record<string, GeneratedBriefing[]>>((acc, b) => {
    const key = b.week_number ? `Week ${b.week_number}` : 'Geen week';
    if (!acc[key]) acc[key] = [];
    acc[key].push(b);
    return acc;
  }, {});

  const allWeekKeys = [...new Set([...Object.keys(grouped), ...Object.keys(autoGrouped)])].sort((a, b) => {
    const numA = parseInt(a.replace('Week ', '')) || 0;
    const numB = parseInt(b.replace('Week ', '')) || 0;
    return numB - numA;
  });

  // Detail view — support both request-based and direct briefing selection
  if (selectedRequestId) {
    const briefing = briefings.find(b => b.campaign_request_id === selectedRequestId) || briefings.find(b => b.id === selectedRequestId);
    if (briefing) {
      const rows = briefingRows.filter(r => r.briefing_id === briefing.id);
      return (
        <div className="p-6 max-w-6xl mx-auto">
          <BriefingDetailView briefing={briefing} rows={rows} onBack={() => setSelectedRequestId(null)} onRefresh={loadData} />
        </div>
      );
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-foreground">Briefings</h2>
          <p className="text-xs text-muted-foreground">{requests.length} briefing{requests.length !== 1 ? 's' : ''} voor {clientName}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Sparkles className="mr-2 h-4 w-4" />
          Nieuw briefing
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <Select value={weekFilter} onValueChange={setWeekFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Week" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle weken</SelectItem>
            {weeks.map(w => (
              <SelectItem key={w} value={String(w)}>Week {w}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            <SelectItem value="concept">Concept</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="generating">Genereert</SelectItem>
            <SelectItem value="generated">Gegenereerd</SelectItem>
            <SelectItem value="in_review">In Review</SelectItem>
            <SelectItem value="approved">Goedgekeurd</SelectItem>
            <SelectItem value="sent_to_designer">Naar designer</SelectItem>
            <SelectItem value="delivered">Opgeleverd</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Laden...</p>
      ) : requests.length === 0 && autoBriefings.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm font-medium text-muted-foreground">Nog geen briefings</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Maak je eerste content briefing aan of wacht op de wekelijkse auto-briefing</p>
            <Button className="mt-4" size="sm" onClick={() => setDialogOpen(true)}>
              <Sparkles className="mr-2 h-3.5 w-3.5" />
              Eerste briefing genereren
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {allWeekKeys.map(week => (
            <div key={week}>
              <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">{week}</h3>
              <div className="space-y-1.5">
                {/* Auto-generated briefings */}
                {(autoGrouped[week] || []).map(b => {
                  const content = (b.content && typeof b.content === 'object' && !Array.isArray(b.content)) ? b.content as Record<string, any> : {};
                  return (
                    <div
                      key={b.id}
                      onClick={() => setSelectedRequestId(b.id)}
                      className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/30 cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <Sparkles className="h-4 w-4 text-amber-500/60" />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {content.role || 'Auto-briefing'} {content.region ? `— ${content.region}` : ''}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(b.created_at).toLocaleDateString('nl-NL')} · Auto-gegenereerd
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn('text-[10px]', statusColors[b.status || 'draft'])}>
                          {statusLabels[b.status || 'draft'] || b.status}
                        </Badge>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </div>
                  );
                })}
                {/* Request-based briefings */}
                {(grouped[week] || []).map(r => {
                  const hasBriefing = briefings.some(b => b.campaign_request_id === r.id);
                  return (
                    <div
                      key={r.id}
                      onClick={() => hasBriefing && setSelectedRequestId(r.id)}
                      className={cn(
                        'flex items-center justify-between rounded-lg border p-3 transition-colors',
                        hasBriefing ? 'hover:bg-muted/30 cursor-pointer' : 'opacity-70'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-primary/60" />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {r.functions?.join(', ') || 'Geen functie'} {r.location ? `— ${r.location}` : ''}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(r.created_at).toLocaleDateString('nl-NL')} · {r.care_type || ''} · {r.creative_type || 'static'} {r.style ? `· ${r.style}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn('text-[10px]', statusColors[r.status || 'concept'])}>
                          {statusLabels[r.status || 'concept'] || r.status}
                        </Badge>
                        {hasBriefing && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <NewBriefingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        clientId={clientId}
        clientName={clientName}
        onGenerated={loadData}
      />
    </div>
  );
}
