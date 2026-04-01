import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Sparkles, ChevronRight, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import NewBriefingDialog from '@/components/briefings/NewBriefingDialog';
import BriefingDetailView from '@/components/briefings/BriefingDetailView';
import type { Json } from '@/integrations/supabase/types';

interface Props {
  clientId: string;
  clientName: string;
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
  creative_image_path: string | null;
  sort_order: number | null;
}

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  generating: 'bg-primary/10 text-primary animate-pulse',
  in_review: 'bg-amber-500/10 text-amber-600',
  approved: 'bg-green-500/10 text-green-600',
};

const statusLabels: Record<string, string> = {
  draft: 'Concept',
  generating: 'Genereert...',
  in_review: 'In Review',
  approved: 'Goedgekeurd',
};

export default function BriefingsTab({ clientId, clientName }: Props) {
  const [briefings, setBriefings] = useState<GeneratedBriefing[]>([]);
  const [briefingRows, setBriefingRows] = useState<BriefingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekFilter, setWeekFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBriefingId, setSelectedBriefingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [briefRes, rowRes] = await Promise.all([
      supabase
        .from('generated_briefings')
        .select('id, campaign_request_id, content, status, version, week_number, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false }),
      supabase
        .from('briefing_rows')
        .select('id, briefing_id, is_new, functie, locatie, hook, usps, omschrijving, creative_inspiratie, creative_image_path, sort_order')
        .eq('client_id', clientId)
        .order('sort_order', { ascending: true }),
    ]);
    setBriefings(briefRes.data || []);
    setBriefingRows(rowRes.data || []);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Group briefings by week — one card per week
  const weekGroups = briefings.reduce<Record<number, GeneratedBriefing[]>>((acc, b) => {
    const wk = b.week_number || 0;
    if (!acc[wk]) acc[wk] = [];
    acc[wk].push(b);
    return acc;
  }, {});

  const weeks = Object.keys(weekGroups).map(Number).sort((a, b) => b - a);

  const filteredWeeks = weeks.filter(wk => {
    if (weekFilter !== 'all' && String(wk) !== weekFilter) return false;
    if (statusFilter !== 'all') {
      const hasMatchingStatus = weekGroups[wk].some(b => b.status === statusFilter);
      if (!hasMatchingStatus) return false;
    }
    return true;
  });

  // Detail view
  if (selectedBriefingId) {
    const briefing = briefings.find(b => b.id === selectedBriefingId);
    if (briefing) {
      const rows = briefingRows.filter(r => r.briefing_id === briefing.id);
      return (
        <div className="p-6 max-w-7xl mx-auto">
          <BriefingDetailView briefing={briefing} rows={rows} onBack={() => setSelectedBriefingId(null)} onRefresh={loadData} />
        </div>
      );
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-foreground">Briefings</h2>
          <p className="text-xs text-muted-foreground">{briefings.length} briefing{briefings.length !== 1 ? 's' : ''} voor {clientName}</p>
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
              <SelectItem key={w} value={String(w)}>Week {w || '?'}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            <SelectItem value="draft">Concept</SelectItem>
            <SelectItem value="in_review">In Review</SelectItem>
            <SelectItem value="approved">Goedgekeurd</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Laden...</p>
      ) : briefings.length === 0 ? (
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
        <div className="space-y-2">
          {filteredWeeks.map(wk => {
            const weekBriefings = weekGroups[wk];
            // Pick the latest briefing as representative
            const latest = weekBriefings[0];
            const content = (latest.content && typeof latest.content === 'object' && !Array.isArray(latest.content)) ? latest.content as Record<string, any> : {};
            const rowCount = briefingRows.filter(r => weekBriefings.some(b => b.id === r.briefing_id)).length;
            const isAuto = !!content.auto_generated;

            return (
              <div
                key={wk}
                onClick={() => setSelectedBriefingId(latest.id)}
                className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/30 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Weekbriefing {wk || '?'}
                      {isAuto && <Sparkles className="inline ml-1.5 h-3.5 w-3.5 text-amber-500" />}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {rowCount} functie{rowCount !== 1 ? 's' : ''} · {new Date(latest.created_at).toLocaleDateString('nl-NL')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn('text-[10px]', statusColors[latest.status || 'draft'])}>
                    {statusLabels[latest.status || 'draft'] || latest.status}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            );
          })}
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
