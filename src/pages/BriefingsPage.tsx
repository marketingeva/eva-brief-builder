import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, ChevronLeft, Calendar, Loader2, FileDown } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import BriefingTable from '@/components/briefings/BriefingTable';
import NewWeekDialog from '@/components/briefings/NewWeekDialog';
import { cn } from '@/lib/utils';
import { exportWeekToPDF } from '@/lib/briefing-week-pdf';

interface Client { id: string; name: string; }
interface MetaBriefing {
  id: string;
  client_id: string;
  week_number: number;
  year: number;
  status: 'draft' | 'in_review' | 'approved';
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Concept', cls: 'bg-muted text-muted-foreground border-border' },
  in_review: { label: 'In Review', cls: 'bg-warning/10 text-warning border-warning/30' },
  approved: { label: 'Goedgekeurd', cls: 'bg-success/10 text-success border-success/30' },
};

function getCurrentWeek(): { week: number; year: number } {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  return { week, year: d.getFullYear() };
}

export default function BriefingsPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [briefings, setBriefings] = useState<MetaBriefing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState<{ week: number; year: number } | null>(null);
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newWeekOpen, setNewWeekOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExportWeek = async () => {
    if (!selectedWeek) return;
    const { week, year } = selectedWeek;
    const weekBriefings = briefings.filter(b => b.week_number === week && b.year === year);
    if (weekBriefings.length === 0) {
      toast({ title: 'Geen briefings', description: 'Deze week bevat geen klanten.', variant: 'destructive' });
      return;
    }
    setExporting(true);
    try {
      const ids = weekBriefings.map(b => b.id);
      const { data: rowsData, error } = await supabase
        .from('briefing_rows')
        .select('*')
        .in('meta_briefing_id', ids)
        .order('sort_order');
      if (error) throw error;
      const rows = (rowsData as any[]) || [];
      const blocks = weekBriefings
        .map(b => ({
          clientName: clients.find(c => c.id === b.client_id)?.name || 'Onbekende klant',
          status: b.status,
          rows: rows
            .filter(r => r.meta_briefing_id === b.id)
            .map(r => ({
              ...r,
              functies: r.functies || (r.functie ? [r.functie] : []),
              locaties: r.locaties || (r.locatie ? [r.locatie] : []),
              creative_image_paths: r.creative_image_paths || (r.creative_image_path ? [r.creative_image_path] : []),
            })),
        }))
        .sort((a, b) => a.clientName.localeCompare(b.clientName));
      await exportWeekToPDF({ week, year, clientBlocks: blocks });
      toast({ title: 'PDF geëxporteerd ✓', description: `Week ${week} · ${year}` });
    } catch (e: any) {
      toast({ title: 'Export mislukt', description: e?.message || 'Onbekende fout', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    const [{ data: cs }, { data: bs }] = await Promise.all([
      supabase.from('clients').select('id, name').order('name'),
      supabase.from('briefings_meta' as any).select('*').order('year', { ascending: false }).order('week_number', { ascending: false }),
    ]);
    setClients(cs || []);
    setBriefings((bs as any) || []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  // Group briefings per (year, week)
  const weeks = useMemo(() => {
    const map = new Map<string, MetaBriefing[]>();
    briefings.forEach(b => {
      const key = `${b.year}-W${b.week_number}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    });
    return Array.from(map.entries())
      .map(([key, items]) => ({ key, year: items[0].year, week: items[0].week_number, items }))
      .sort((a, b) => b.year - a.year || b.week - a.week);
  }, [briefings]);

  const openNewWeekDialog = () => {
    if (clients.length === 0) {
      toast({ title: 'Geen klanten', description: 'Voeg eerst een klant toe.', variant: 'destructive' });
      return;
    }
    setNewWeekOpen(true);
  };

  const handleWeekCreated = async ({ week, year, clientId }: { week: number; year: number; clientId: string }) => {
    await loadAll();
    setSelectedWeek({ week, year });
    setActiveClientId(clientId);
  };

  const addClientToWeek = async (clientId: string) => {
    if (!selectedWeek) return;
    const { week, year } = selectedWeek;
    const { data: existing } = await supabase
      .from('briefings_meta' as any)
      .select('id')
      .eq('client_id', clientId).eq('week_number', week).eq('year', year)
      .maybeSingle();
    if (existing) {
      setActiveClientId(clientId);
      return;
    }
    const { error } = await supabase.from('briefings_meta' as any).insert({
      client_id: clientId, week_number: week, year, status: 'draft', created_by: user?.id,
    });
    if (error) {
      toast({ title: 'Fout', description: error.message, variant: 'destructive' });
      return;
    }
    await loadAll();
    setActiveClientId(clientId);
  };

  // ===== Detail view =====
  if (selectedWeek) {
    const weekBriefings = briefings.filter(b => b.week_number === selectedWeek.week && b.year === selectedWeek.year);
    const activeBriefing = weekBriefings.find(b => b.client_id === activeClientId) || weekBriefings[0];
    const clientsInWeek = weekBriefings.map(b => clients.find(c => c.id === b.client_id)).filter(Boolean) as Client[];
    const clientsNotInWeek = clients.filter(c => !weekBriefings.some(b => b.client_id === c.id));

    return (
      <div className="flex flex-col h-full">
        <div className="border-b bg-card px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => { setSelectedWeek(null); setActiveClientId(null); }}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Terug
            </Button>
            <div>
              <h1 className="text-lg font-semibold">Week {selectedWeek.week} · {selectedWeek.year}</h1>
              <p className="text-xs text-muted-foreground">Briefing voor de grafisch vormgever</p>
            </div>
          </div>
        </div>

        {activeBriefing && (
          <BriefingTable
            briefing={activeBriefing}
            clientName={clients.find(c => c.id === activeBriefing.client_id)?.name || ''}
            onStatusChange={loadAll}
          />
        )}

        {/* Client tabs at bottom (Sheets-stijl) */}
        <div className="border-t bg-muted/30 px-4 py-2 flex items-center gap-1 overflow-x-auto">
          {clientsInWeek.map(c => {
            const b = weekBriefings.find(x => x.client_id === c.id)!;
            const active = activeBriefing?.id === b.id;
            const cfg = STATUS_LABEL[b.status];
            return (
              <button
                key={c.id}
                onClick={() => setActiveClientId(c.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 text-xs rounded-t-md border border-b-0 transition-colors',
                  active ? 'bg-background border-border font-medium' : 'bg-muted/50 border-transparent hover:bg-muted text-muted-foreground'
                )}
              >
                <span>{c.name}</span>
                <Badge variant="outline" className={cn('text-[9px] px-1 py-0 h-4', cfg.cls)}>{cfg.label}</Badge>
              </button>
            );
          })}
          {clientsNotInWeek.length > 0 && (
            <select
              onChange={(e) => { if (e.target.value) addClientToWeek(e.target.value); e.target.value = ''; }}
              className="ml-2 text-xs h-7 px-2 rounded border bg-background text-muted-foreground"
              defaultValue=""
            >
              <option value="" disabled>+ Klant toevoegen</option>
              {clientsNotInWeek.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
      </div>
    );
  }

  // ===== Overview =====
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Briefings</h1>
          <p className="text-sm text-muted-foreground">Wekelijkse briefings voor de grafisch vormgever</p>
        </div>
        <Button onClick={openNewWeekDialog} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          Nieuwe week
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Laden...</div>
      ) : weeks.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
          <Calendar className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground mb-4">Nog geen briefings</p>
          <Button onClick={openNewWeekDialog} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" /> Maak eerste briefing
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {weeks.map(w => (
            <button
              key={w.key}
              onClick={() => { setSelectedWeek({ week: w.week, year: w.year }); setActiveClientId(w.items[0].client_id); }}
              className="text-left rounded-lg border bg-card hover:border-primary hover:shadow-sm transition-all p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-sm">Week {w.week}</h3>
                  <p className="text-[10px] text-muted-foreground">{w.year}</p>
                </div>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                {w.items.map(b => {
                  const c = clients.find(cl => cl.id === b.client_id);
                  const cfg = STATUS_LABEL[b.status];
                  return (
                    <div key={b.id} className="flex items-center justify-between text-xs">
                      <span className="truncate">{c?.name || 'Onbekend'}</span>
                      <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', cfg.cls)}>{cfg.label}</Badge>
                    </div>
                  );
                })}
              </div>
            </button>
          ))}
        </div>
      )}

      <NewWeekDialog
        open={newWeekOpen}
        onOpenChange={setNewWeekOpen}
        clients={clients}
        defaultWeek={getCurrentWeek().week}
        defaultYear={getCurrentWeek().year}
        onCreated={handleWeekCreated}
      />
    </div>
  );
}
