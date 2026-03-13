import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Plus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

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
}

const statusColors: Record<string, string> = {
  concept: 'bg-muted text-muted-foreground',
  generated: 'bg-primary/10 text-primary',
  approved: 'bg-success/10 text-success',
  sent_to_designer: 'bg-warning/10 text-warning',
  delivered: 'bg-success/10 text-success',
};

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export default function BriefingsTab({ clientId, clientName }: Props) {
  const [requests, setRequests] = useState<BriefingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekFilter, setWeekFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    supabase
      .from('briefing_requests')
      .select('id, functions, location, status, week_number, created_at, care_type, creative_type')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setRequests(data || []);
        setLoading(false);
      });
  }, [clientId]);

  const weeks = [...new Set(requests.map(r => r.week_number).filter(Boolean))].sort((a, b) => (b || 0) - (a || 0));

  const filtered = requests.filter(r => {
    if (weekFilter !== 'all' && String(r.week_number) !== weekFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    return true;
  });

  // Group by week
  const grouped = filtered.reduce<Record<string, BriefingRequest[]>>((acc, r) => {
    const key = r.week_number ? `Week ${r.week_number}` : 'Geen week';
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-foreground">Briefings</h2>
          <p className="text-xs text-muted-foreground">{requests.length} briefing{requests.length !== 1 ? 's' : ''} voor {clientName}</p>
        </div>
        <Button>
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
            <SelectItem value="generated">Generated</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="sent_to_designer">Naar designer</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Laden...</p>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm font-medium text-muted-foreground">Nog geen briefings</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Maak je eerste content briefing aan</p>
            <Button className="mt-4" size="sm">
              <Sparkles className="mr-2 h-3.5 w-3.5" />
              Eerste briefing genereren
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([week, items]) => (
            <div key={week}>
              <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">{week}</h3>
              <div className="space-y-1.5">
                {items.map(r => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-primary/60" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {r.functions?.join(', ') || 'Geen functie'} {r.location ? `— ${r.location}` : ''}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString('nl-NL')} · {r.care_type || ''} · {r.creative_type || 'static'}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={cn('text-[10px]', statusColors[r.status || ''])}>
                      {r.status || 'concept'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
