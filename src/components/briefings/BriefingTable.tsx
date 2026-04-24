import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Check, Loader2, GripVertical, ExternalLink, Lock } from 'lucide-react';
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
  vacature_url: string | null;
  creative_image_paths: string[];
  sort_order: number | null;
}

interface Props {
  briefing: MetaBriefing;
  clientName: string;
  onStatusChange: () => void;
}

const STATUS_LABEL: Record<string, { label: string; cls: string; dot: string }> = {
  draft: { label: 'Concept', cls: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground/50' },
  in_review: { label: 'In Review', cls: 'bg-warning/10 text-warning border-warning/30', dot: 'bg-warning' },
  approved: { label: 'Goedgekeurd', cls: 'bg-success/10 text-success border-success/30', dot: 'bg-success' },
};

export default function BriefingTable({ briefing, clientName, onStatusChange }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleOptions, setRoleOptions] = useState<string[]>([]);
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const isApproved = briefing.status === 'approved';

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: rs }, { data: roles }, { data: locs }] = await Promise.all([
      (supabase.from('briefing_rows') as any).select('*').eq('meta_briefing_id', briefing.id).order('sort_order'),
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
    if (status === 'approved') patch.approved_at = new Date().toISOString();
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
    <div className="flex-1 flex flex-col overflow-hidden bg-muted/20">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b bg-card/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold tracking-tight">{clientName}</h2>
          <Badge variant="outline" className={cn('text-[10px] gap-1.5 pl-1.5 font-medium', cfg.cls)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
            {cfg.label}
          </Badge>
          {isApproved && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" />Alleen-lezen</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {briefing.status === 'draft' && (
            <Button size="sm" variant="outline" onClick={() => setStatus('in_review')}>Naar review</Button>
          )}
          {briefing.status === 'in_review' && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setStatus('draft')}>Terug naar concept</Button>
              <Button size="sm" onClick={() => setStatus('approved')} className="bg-success text-success-foreground hover:bg-success/90 shadow-sm">
                <Check className="h-3.5 w-3.5 mr-1" /> Goedkeuren
              </Button>
            </>
          )}
          {briefing.status === 'approved' && (
            <Button size="sm" variant="outline" onClick={() => setStatus('in_review')}>Heropen voor bewerking</Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-12 text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Laden...</div>
        ) : (
          <div className="m-4 rounded-lg border bg-card shadow-sm overflow-hidden">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="w-10 px-2 py-3"></th>
                  <th className="text-left px-3 py-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-[170px]">Functie</th>
                  <th className="text-left px-3 py-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-[170px]">Locatie</th>
                  <th className="text-left px-3 py-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-[200px]">Hook</th>
                  <th className="text-left px-3 py-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-[200px]">USP's</th>
                  <th className="text-left px-3 py-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-[200px]">Omschrijving</th>
                  <th className="text-left px-3 py-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-[160px]">Vacaturelink</th>
                  <th className="text-left px-3 py-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-[200px]">Creatieve inspiratie</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-16 text-muted-foreground">
                      <p className="text-sm mb-3">Nog geen rijen in deze briefing</p>
                      {!isApproved && (
                        <Button variant="outline" size="sm" onClick={addRow}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Eerste rij toevoegen
                        </Button>
                      )}
                    </td>
                  </tr>
                ) : rows.map((row, idx) => (
                  <tr key={row.id} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors align-top">
                    <td className="px-2 py-3 text-muted-foreground/40 text-center">
                      <div className="flex flex-col items-center gap-0.5 pt-1">
                        {!isApproved && <GripVertical className="h-3 w-3" />}
                        <span className="text-[9px] font-mono">{idx + 1}</span>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      {isApproved ? (
                        <ReadOnlyChips items={row.functies} />
                      ) : (
                        <MultiSelectCombobox
                          options={roleOptions}
                          value={row.functies}
                          onChange={(next) => { updateRow(row.id, { functies: next }); persistRow(row, { functies: next } as any); }}
                          placeholder="Functie(s)..."
                        />
                      )}
                    </td>
                    <td className="px-2 py-3">
                      {isApproved ? (
                        <ReadOnlyChips items={row.locaties} />
                      ) : (
                        <MultiSelectCombobox
                          options={locationOptions}
                          value={row.locaties}
                          onChange={(next) => { updateRow(row.id, { locaties: next }); persistRow(row, { locaties: next } as any); }}
                          placeholder="Locatie(s)..."
                        />
                      )}
                    </td>
                    <td className="px-2 py-3">
                      {isApproved ? (
                        <ReadOnlyText text={row.hook} />
                      ) : (
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
                      )}
                    </td>
                    <td className="px-2 py-3">
                      {isApproved ? (
                        <ReadOnlyText text={row.usps} />
                      ) : (
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
                      )}
                    </td>
                    <td className="px-2 py-3">
                      {isApproved ? (
                        <ReadOnlyText text={row.omschrijving} />
                      ) : (
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
                      )}
                    </td>
                    <td className="px-2 py-3">
                      {isApproved ? (
                        row.vacature_url ? (
                          <a href={row.vacature_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 break-all">
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            <span className="truncate">{row.vacature_url}</span>
                          </a>
                        ) : <span className="text-xs text-muted-foreground/40">—</span>
                      ) : (
                        <div className="relative">
                          <Input
                            type="url"
                            value={row.vacature_url || ''}
                            onChange={(e) => updateRow(row.id, { vacature_url: e.target.value })}
                            onBlur={() => persistRow(row, { vacature_url: row.vacature_url })}
                            placeholder="https://..."
                            className="text-xs h-8 pr-7"
                          />
                          {row.vacature_url && (
                            <a
                              href={row.vacature_url}
                              target="_blank"
                              rel="noreferrer"
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                              title="Open in nieuw tabblad"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <InspirationImageUpload
                        paths={row.creative_image_paths}
                        onChange={(paths) => { updateRow(row.id, { creative_image_paths: paths }); persistRow(row, { creative_image_paths: paths } as any); }}
                        clientId={briefing.client_id}
                        readOnly={isApproved}
                      />
                    </td>
                    <td className="px-1 py-3">
                      {!isApproved && (
                        <button
                          onClick={() => deleteRow(row.id)}
                          className="text-muted-foreground/40 hover:text-destructive p-1 rounded transition-colors"
                          title="Verwijder rij"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!isApproved && rows.length > 0 && (
          <div className="px-4 pb-4 flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={addRow} className="shadow-sm">
              <Plus className="h-3.5 w-3.5 mr-1" /> Rij toevoegen
            </Button>
            {savingId && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Opslaan...</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function ReadOnlyChips({ items }: { items: string[] }) {
  if (!items?.length) return <span className="text-xs text-muted-foreground/40">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map(i => (
        <span key={i} className="inline-flex text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{i}</span>
      ))}
    </div>
  );
}

function ReadOnlyText({ text }: { text: string | null }) {
  if (!text) return <span className="text-xs text-muted-foreground/40">—</span>;
  return <p className="text-xs whitespace-pre-wrap leading-relaxed">{text}</p>;
}
