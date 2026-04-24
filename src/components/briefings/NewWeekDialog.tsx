import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Client { id: string; name: string; }

interface PreviousWeekInfo {
  week_number: number;
  year: number;
  metaIds: string[]; // one per client in that week
  rowCount: number;
}

interface ExistingWeekInfo {
  metaIds: string[];
  rowCount: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
  defaultWeek: number;
  defaultYear: number;
  onCreated: (info: { week: number; year: number; clientId: string }) => void;
}

export default function NewWeekDialog({ open, onOpenChange, clients, defaultWeek, defaultYear, onCreated }: Props) {
  const { user } = useAuth();
  const [week, setWeek] = useState<number>(defaultWeek);
  const [year, setYear] = useState<number>(defaultYear);
  const [startMode, setStartMode] = useState<'empty' | 'copy'>('empty');
  const [previous, setPrevious] = useState<PreviousWeekInfo | null>(null);
  const [checkingPrev, setCheckingPrev] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setWeek(defaultWeek);
      setYear(defaultYear);
      setStartMode('empty');
      setPrevious(null);
    }
  }, [open, defaultWeek, defaultYear]);

  // Find the most recent previous (year, week) across all clients (excluding the target week)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setCheckingPrev(true);
      setPrevious(null);
      const { data: metas } = await supabase
        .from('briefings_meta' as any)
        .select('id, client_id, week_number, year')
        .order('year', { ascending: false })
        .order('week_number', { ascending: false })
        .limit(50);
      if (cancelled) return;
      const list = (metas as any[]) || [];
      const candidate = list.find((m: any) => !(m.week_number === week && m.year === year));
      if (!candidate) {
        setCheckingPrev(false);
        return;
      }
      const sameWeek = list.filter((m: any) => m.week_number === candidate.week_number && m.year === candidate.year);
      const metaIds = sameWeek.map((m: any) => m.id);
      const { count } = await supabase
        .from('briefing_rows')
        .select('id', { count: 'exact', head: true })
        .in('meta_briefing_id', metaIds);
      if (cancelled) return;
      setPrevious({
        week_number: candidate.week_number,
        year: candidate.year,
        metaIds,
        rowCount: count || 0,
      });
      setCheckingPrev(false);
    })();
    return () => { cancelled = true; };
  }, [open, week, year]);

  const canCopy = useMemo(() => !!previous && previous.rowCount > 0, [previous]);

  const handleSubmit = async () => {
    if (clients.length === 0) {
      toast({ title: 'Geen klanten', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      // Create a meta row per client (skip if exists), collect (clientId -> metaId)
      const clientMetaMap = new Map<string, string>();
      for (const c of clients) {
        const { data: existing } = await supabase
          .from('briefings_meta' as any)
          .select('id')
          .eq('client_id', c.id)
          .eq('week_number', week)
          .eq('year', year)
          .maybeSingle();
        if (existing) {
          clientMetaMap.set(c.id, (existing as any).id);
        } else {
          const { data: created, error } = await supabase
            .from('briefings_meta' as any)
            .insert({
              client_id: c.id,
              week_number: week,
              year,
              status: 'draft',
              created_by: user?.id,
            })
            .select('id')
            .single();
          if (error) throw error;
          clientMetaMap.set(c.id, (created as any).id);
        }
      }

      // Copy rows from previous week if requested
      let copiedCount = 0;
      if (startMode === 'copy' && previous && canCopy) {
        const { data: prevRows, error: fetchErr } = await supabase
          .from('briefing_rows')
          .select('client_id, is_new, functie, locatie, hook, usps, omschrijving, creative_inspiratie, creative_image_path, creative_image_paths, functies, locaties, vacature_url, sort_order')
          .in('meta_briefing_id', previous.metaIds)
          .order('sort_order', { ascending: true });
        if (fetchErr) throw fetchErr;

        const newRows = (prevRows || [])
          .filter((r: any) => clientMetaMap.has(r.client_id))
          .map((r: any, idx: number) => ({
            client_id: r.client_id,
            meta_briefing_id: clientMetaMap.get(r.client_id)!,
            is_new: r.is_new,
            functie: r.functie,
            locatie: r.locatie,
            hook: r.hook,
            usps: r.usps,
            omschrijving: r.omschrijving,
            creative_inspiratie: r.creative_inspiratie,
            creative_image_path: r.creative_image_path,
            creative_image_paths: r.creative_image_paths,
            functies: r.functies,
            locaties: r.locaties,
            vacature_url: r.vacature_url,
            sort_order: r.sort_order ?? idx,
            status: 'draft',
          }));

        if (newRows.length > 0) {
          const { error: insErr } = await supabase.from('briefing_rows').insert(newRows);
          if (insErr) throw insErr;
          copiedCount = newRows.length;
        }
      }

      toast({
        title: 'Week aangemaakt',
        description: copiedCount > 0
          ? `Week ${week} aangemaakt met ${copiedCount} gekopieerde rij${copiedCount !== 1 ? 'en' : ''}.`
          : `Week ${week} aangemaakt.`,
      });
      onOpenChange(false);
      onCreated({ week, year, clientId: clients[0].id });
    } catch (e: any) {
      toast({ title: 'Kon week niet aanmaken', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nieuwe week aanmaken</DialogTitle>
          <DialogDescription>Kies week en hoe je wilt starten.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Week</Label>
              <Input type="number" min={1} max={53} value={week} onChange={e => setWeek(parseInt(e.target.value) || 1)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Jaar</Label>
              <Input type="number" min={2024} max={2100} value={year} onChange={e => setYear(parseInt(e.target.value) || defaultYear)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Startpunt</Label>
            <RadioGroup value={startMode} onValueChange={(v) => setStartMode(v as 'empty' | 'copy')} className="gap-2">
              <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/30 transition-colors">
                <RadioGroupItem value="empty" id="empty" className="mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Leeg beginnen</p>
                  <p className="text-xs text-muted-foreground">Nieuwe lege briefing — voeg zelf rijen toe.</p>
                </div>
              </label>
              <label
                className={`flex items-start gap-3 rounded-md border p-3 transition-colors ${
                  canCopy ? 'cursor-pointer hover:bg-muted/30' : 'opacity-50 cursor-not-allowed'
                }`}
              >
                <RadioGroupItem value="copy" id="copy" disabled={!canCopy} className="mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    Vorige week kopiëren
                    <Sparkles className="h-3 w-3 text-amber-500" />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {checkingPrev
                      ? 'Zoeken naar vorige week...'
                      : previous
                        ? canCopy
                          ? `Laatste week: W${previous.week_number} ${previous.year} · ${previous.rowCount} rij${previous.rowCount !== 1 ? 'en' : ''}`
                          : `Laatste week (W${previous.week_number}) heeft geen rijen.`
                        : 'Geen vorige week gevonden.'}
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Annuleren</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Aanmaken
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
