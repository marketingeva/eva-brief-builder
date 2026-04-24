import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Check, Loader2, GripVertical } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import MultiSelectCombobox from './MultiSelectCombobox';
import InspirationImageUpload from './InspirationImageUpload';
import AIFieldTextarea from './AIFieldTextarea';
import { cn } from '@/lib/utils';

interface MetaBriefing {
  id: string;
  client_id: string;
  week_number: number;
  year: number;
  status: 'draft' | 'in_review' | 'approved';
}

interface Row {
  id: string;
  briefing_id: string | null;
  meta_briefing_id: string | null;
  client_id: string;
  functies: string[];
  locaties: string[];
  hook: string | null;
  usps: string | null;
  omschrijving: string | null;
  creative_image_paths: string[];
  sort_order: number | null;
  status?: string | null;
}

interface Props {
  briefing: MetaBriefing;
  clientName: string;
  onStatusChange: () => void;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Concept', cls: 'bg-muted text-muted-foreground border-border' },
  in_review: { label: 'In Review', cls: 'bg-warning/10 text-warning border-warning/30' },
  approved: { label: 'Goedgekeurd', cls: 'bg-success/10 text-success border-success/30' },
};

export default function BriefingTable({ briefing, clientName, onStatusChange }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleOptions, setRoleOptions] = useState<string[]>([]);
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: rs }, { data: roles }, { data: locs }] = await Promise.all([
      supabase.from('briefing_rows').select('*').eq('meta_briefing_id' as any, briefing.id).order('sort_order'),
      supabase.from('client_roles').select('role_title').eq('client_id', briefing.client_id),
      supabase.from('client_locations').select('name').eq('client_id', briefing.client_id),
    ]);
    setRows(((rs as any) || []).map((r: any) => ({
      ...r,
      functies: r.functies || (r.functie ? [r.functie] : []),
      locaties: r.locaties || (r.locatie ? [r.locatie] : []),
      creative_image_paths: r.creative_image_paths || (r.creative_image_path ? [r.creative_image_path] : []),
    })));
    setRoleOptions(Array.from(new Set((roles || []).map((r: any) => r.role_title))));
    setLocationOptions(Array.from(new Set((locs || []).map((l: any) => l.name))));
    setLoading(false);
  }, [briefing.id, briefing.client_id]);

  useEffect(() => { load(); }, [load]);

  const updateRow = (id: string, patch: Partial<Row>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const persistRow = async (row: Row, patch: Partial<Row>) => {
    setSavingId(row.id);
    const { error } = await supabase.from('briefing_rows').update(patch as any).eq('id', row.id);
    setSavingId(null);
    if (error) toast({ title: 'Opslaan mislukt', description: error.message, variant: 'destructive' });
  };

  const addRow = async () => {
    const { data, error } = await supabase.from('briefing_rows').insert({
      meta_briefing_id: briefing.id,
      client_id: briefing.client_id,
      sort_order: rows.length,
      functies: [],
      locaties: [],
      creative_image_paths: [],
    } as any).select().single();
    if (error) {
      toast({ title: 'Fout', description: error.message, variant: 'destructive' });
      return;
    }
    setRows(prev => [...prev, { ...(data as any), functies: [], locaties: [], creative_image_paths: [] }]);
  };

  const deleteRow = async (id: string) => {
    const { error } = await supabase.from('briefing_rows').delete().eq('id', id);
    if (error) {
      toast({ title: 'Fout', description: error.message, variant: 'destructive' });
      return;
    }
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const setStatus = async (status: 'draft' | 'in_review' | 'approved') => {
    const patch: any = { status };
    if (status === 'approved') {
      patch.approved_at = new Date().toISOString();
    }
    const { error } = await supabase.from('briefings_meta' as any).update(patch).eq('id', briefing.id);
    if (error) {
      toast({ title: 'Fout', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: status === 'approved' ? 'Briefing goedgekeurd ✓' : `Status: ${STATUS_LABEL[status].label}` });
    onStatusChange();
  };

  const cfg = STATUS_LABEL[briefing.status];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-card">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">{clientName}</h2>
          <Badge variant="outline" className={cn('text-[10px]', cfg.cls)}>{cfg.label}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {briefing.status !== 'in_review' && briefing.status !== 'approved' && (
            <Button size="sm" variant="outline" onClick={() => setStatus('in_review')}>Naar review</Button>
          )}
          {briefing.status === 'in_review' && (
            <Button size="sm" variant="outline" onClick={() => setStatus('draft')}>Terug naar concept</Button>
          )}
          {briefing.status !== 'approved' ? (
            <Button size="sm" onClick={() => setStatus('approved')} className="bg-success text-success-foreground hover:bg-success/90">
              <Check className="h-3.5 w-3.5 mr-1" /> Goedkeuren
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setStatus('in_review')}>Heropen</Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-12 text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Laden...</div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="bg-muted/40 sticky top-0 z-10">
              <tr className="border-b">
                <th className="w-8 px-2 py-2"></th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground w-[180px]">Functie</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground w-[180px]">Locatie</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground w-[220px]">Hook</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground w-[220px]">USP's</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground w-[220px]">Omschrijving</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground w-[180px]">Creatieve inspiratie</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-muted-foreground">
                    Nog geen rijen. Voeg een rij toe om te beginnen.
                  </td>
                </tr>
              ) : rows.map((row, idx) => (
                <tr key={row.id} className="border-b hover:bg-muted/20 align-top">
                  <td className="px-2 py-2 text-muted-foreground/50 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <GripVertical className="h-3 w-3" />
                      <span className="text-[9px]">{idx + 1}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <MultiSelectCombobox
                      options={roleOptions}
                      value={row.functies}
                      onChange={(next) => { updateRow(row.id, { functies: next }); persistRow(row, { functies: next } as any); }}
                      placeholder="Functie(s)..."
                    />
                  </td>
                  <td className="px-2 py-2">
                    <MultiSelectCombobox
                      options={locationOptions}
                      value={row.locaties}
                      onChange={(next) => { updateRow(row.id, { locaties: next }); persistRow(row, { locaties: next } as any); }}
                      placeholder="Locatie(s)..."
                    />
                  </td>
                  <td className="px-2 py-2">
                    <AIFieldTextarea
                      value={row.hook || ''}
                      onChange={(v) => updateRow(row.id, { hook: v })}
                      onBlur={() => persistRow(row, { hook: row.hook })}
                      placeholder="Pakkende openingszin..."
                      field="hook"
                      clientId={briefing.client_id}
                      functies={row.functies}
                      locaties={row.locaties}
                      rows={2}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <AIFieldTextarea
                      value={row.usps || ''}
                      onChange={(v) => updateRow(row.id, { usps: v })}
                      onBlur={() => persistRow(row, { usps: row.usps })}
                      placeholder="• USP 1&#10;• USP 2..."
                      field="usps"
                      clientId={briefing.client_id}
                      functies={row.functies}
                      locaties={row.locaties}
                      rows={3}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <AIFieldTextarea
                      value={row.omschrijving || ''}
                      onChange={(v) => updateRow(row.id, { omschrijving: v })}
                      onBlur={() => persistRow(row, { omschrijving: row.omschrijving })}
                      placeholder="Wat staat er op de advertentie..."
                      field="omschrijving"
                      clientId={briefing.client_id}
                      functies={row.functies}
                      locaties={row.locaties}
                      rows={3}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <InspirationImageUpload
                      paths={row.creative_image_paths}
                      onChange={(paths) => { updateRow(row.id, { creative_image_paths: paths }); persistRow(row, { creative_image_paths: paths } as any); }}
                      clientId={briefing.client_id}
                    />
                  </td>
                  <td className="px-1 py-2">
                    <button
                      onClick={() => deleteRow(row.id)}
                      className="text-muted-foreground/40 hover:text-destructive p-1"
                      title="Verwijder rij"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="p-3 border-t bg-card">
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Rij toevoegen
          </Button>
          {savingId && <span className="ml-3 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin inline mr-1" />Opslaan...</span>}
        </div>
      </div>
    </div>
  );
}
