import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Check, Loader2, ExternalLink, Lock, ChevronDown, ChevronRight, Briefcase, MapPin, Sparkles as SparklesIcon, Image as ImageIcon } from 'lucide-react';
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const isApproved = briefing.status === 'approved';

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: rs }, { data: roles }, { data: locs }] = await Promise.all([
      (supabase.from('briefing_rows') as any).select('*').eq('meta_briefing_id', briefing.id).order('sort_order'),
      supabase.from('client_roles').select('role_title').eq('client_id', briefing.client_id),
      supabase.from('client_locations').select('name').eq('client_id', briefing.client_id),
    ]);
    const mapped = ((rs as any) || []).map((r: any) => ({
      ...r,
      functies: r.functies || (r.functie ? [r.functie] : []),
      locaties: r.locaties || (r.locatie ? [r.locatie] : []),
      creative_image_paths: r.creative_image_paths || (r.creative_image_path ? [r.creative_image_path] : []),
    }));
    setRows(mapped);
    // Auto-expand if there are no rows or only one
    if (mapped.length <= 1) setExpanded(new Set(mapped.map((r: Row) => r.id)));
    setRoleOptions(Array.from(new Set((roles || []).map((r: any) => r.role_title))));
    setLocationOptions(Array.from(new Set((locs || []).map((l: any) => l.name))));
    setLoading(false);
  }, [briefing.id, briefing.client_id]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(rows.map(r => r.id)));
  const collapseAll = () => setExpanded(new Set());

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
    const newRow = { ...(data as any), functies: [], locaties: [], creative_image_paths: [] };
    setRows(prev => [...prev, newRow]);
    setExpanded(prev => new Set([...prev, newRow.id]));
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
    <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-b from-muted/40 via-background to-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold tracking-tight">{clientName}</h2>
          <Badge variant="outline" className={cn('text-[10px] gap-1.5 pl-1.5 font-medium', cfg.cls)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
            {cfg.label}
          </Badge>
          <span className="text-xs text-muted-foreground">{rows.length} {rows.length === 1 ? 'rij' : 'rijen'}</span>
          {isApproved && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" />Alleen-lezen</span>}
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 1 && (
            <div className="flex items-center gap-1 mr-2">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={expandAll}>Alles uit</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={collapseAll}>Alles in</Button>
            </div>
          )}
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

      {/* Rows */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-12 text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Laden...</div>
        ) : rows.length === 0 ? (
          <div className="m-6 rounded-2xl border-2 border-dashed border-border/60 bg-card/50 py-16 text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Plus className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground mb-4">Nog geen briefing-rijen</p>
            {!isApproved && (
              <Button onClick={addRow} className="shadow-sm">
                <Plus className="h-4 w-4 mr-1.5" /> Eerste rij toevoegen
              </Button>
            )}
          </div>
        ) : (
          <div className="px-4 sm:px-6 py-5 space-y-3 max-w-[1400px] mx-auto">
            {rows.map((row, idx) => {
              const isOpen = expanded.has(row.id);
              return (
                <RowCard
                  key={row.id}
                  row={row}
                  index={idx}
                  isOpen={isOpen}
                  isApproved={isApproved}
                  toggleExpand={() => toggleExpand(row.id)}
                  updateRow={updateRow}
                  persistRow={persistRow}
                  deleteRow={deleteRow}
                  briefing={briefing}
                  roleOptions={roleOptions}
                  locationOptions={locationOptions}
                />
              );
            })}

            {!isApproved && (
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={addRow} className="shadow-sm">
                  <Plus className="h-4 w-4 mr-1.5" /> Rij toevoegen
                </Button>
                {savingId && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Opslaan...</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============== Row Card ==============
function RowCard({
  row, index, isOpen, isApproved, toggleExpand, updateRow, persistRow, deleteRow, briefing, roleOptions, locationOptions,
}: {
  row: Row;
  index: number;
  isOpen: boolean;
  isApproved: boolean;
  toggleExpand: () => void;
  updateRow: (id: string, patch: Partial<Row>) => void;
  persistRow: (row: Row, patch: Partial<Row>) => Promise<void>;
  deleteRow: (id: string) => Promise<void>;
  briefing: MetaBriefing;
  roleOptions: string[];
  locationOptions: string[];
}) {
  const summaryFunctie = row.functies?.[0] || 'Geen functie';
  const summaryLocatie = row.locaties?.[0] || 'Geen locatie';
  const moreFunctie = (row.functies?.length || 0) - 1;
  const moreLocatie = (row.locaties?.length || 0) - 1;
  const imgCount = row.creative_image_paths?.length || 0;

  return (
    <div className={cn(
      'rounded-2xl border bg-card shadow-sm transition-all overflow-hidden',
      isOpen ? 'shadow-md ring-1 ring-primary/10' : 'hover:shadow-md hover:border-primary/30'
    )}>
      {/* Summary header (always visible) */}
      <button
        type="button"
        onClick={toggleExpand}
        className="w-full flex items-center gap-3 px-4 py-3 text-left group"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr,1fr,auto] gap-2 sm:gap-4 items-center">
          <div className="flex items-center gap-1.5 min-w-0">
            <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">{summaryFunctie}</span>
            {moreFunctie > 0 && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">+{moreFunctie}</span>}
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground truncate">{summaryLocatie}</span>
            {moreLocatie > 0 && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">+{moreLocatie}</span>}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {row.hook && <span title="Hook ingevuld" className="h-1.5 w-1.5 rounded-full bg-success" />}
            {imgCount > 0 && (
              <span className="flex items-center gap-1"><ImageIcon className="h-3 w-3" />{imgCount}</span>
            )}
          </div>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform shrink-0', isOpen && 'rotate-180')} />
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="border-t bg-muted/20 px-4 sm:px-5 py-5 space-y-5">
          {/* Top row: Functie / Locatie / Vacaturelink */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Functie" icon={Briefcase}>
              {isApproved ? <ReadOnlyChips items={row.functies} variant="primary" /> : (
                <MultiSelectCombobox
                  options={roleOptions}
                  value={row.functies}
                  onChange={(next) => { updateRow(row.id, { functies: next }); persistRow(row, { functies: next } as any); }}
                  placeholder="Kies functie(s)..."
                />
              )}
            </Field>
            <Field label="Locatie" icon={MapPin}>
              {isApproved ? <ReadOnlyChips items={row.locaties} variant="accent" /> : (
                <MultiSelectCombobox
                  options={locationOptions}
                  value={row.locaties}
                  onChange={(next) => { updateRow(row.id, { locaties: next }); persistRow(row, { locaties: next } as any); }}
                  placeholder="Kies locatie(s)..."
                />
              )}
            </Field>
            <Field label="Vacaturelink" icon={ExternalLink}>
              {isApproved ? (
                row.vacature_url ? (
                  <a href={row.vacature_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 break-all py-1.5">
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
                    className="text-xs h-9 pr-8 bg-card"
                  />
                  {row.vacature_url && (
                    <a href={row.vacature_url} target="_blank" rel="noreferrer" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              )}
            </Field>
          </div>

          {/* Middle row: Hook / USPs / Omschrijving */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Field label="Hook" icon={SparklesIcon}>
              {isApproved ? <ReadOnlyText text={row.hook} /> : (
                <AIFieldTextarea
                  value={row.hook || ''}
                  onChange={(v) => updateRow(row.id, { hook: v })}
                  onBlur={() => persistRow(row, { hook: row.hook })}
                  placeholder="Pakkende openingszin..."
                  field="hook"
                  clientId={briefing.client_id}
                  functies={row.functies}
                  locaties={row.locaties}
                  rows={3}
                />
              )}
            </Field>
            <Field label="USP's" icon={SparklesIcon}>
              {isApproved ? <ReadOnlyText text={row.usps} /> : (
                <AIFieldTextarea
                  value={row.usps || ''}
                  onChange={(v) => updateRow(row.id, { usps: v })}
                  onBlur={() => persistRow(row, { usps: row.usps })}
                  placeholder="• USP 1&#10;• USP 2..."
                  field="usps"
                  clientId={briefing.client_id}
                  functies={row.functies}
                  locaties={row.locaties}
                  rows={4}
                />
              )}
            </Field>
            <Field label="Omschrijving" icon={SparklesIcon}>
              {isApproved ? <ReadOnlyText text={row.omschrijving} /> : (
                <AIFieldTextarea
                  value={row.omschrijving || ''}
                  onChange={(v) => updateRow(row.id, { omschrijving: v })}
                  onBlur={() => persistRow(row, { omschrijving: row.omschrijving })}
                  placeholder="Wat staat er op de advertentie..."
                  field="omschrijving"
                  clientId={briefing.client_id}
                  functies={row.functies}
                  locaties={row.locaties}
                  rows={4}
                />
              )}
            </Field>
          </div>

          {/* Bottom: Inspiration */}
          <Field label="Creatieve inspiratie" icon={ImageIcon}>
            <InspirationImageUpload
              paths={row.creative_image_paths}
              onChange={(paths) => { updateRow(row.id, { creative_image_paths: paths }); persistRow(row, { creative_image_paths: paths } as any); }}
              clientId={briefing.client_id}
              readOnly={isApproved}
            />
          </Field>

          {/* Row footer actions */}
          {!isApproved && (
            <div className="flex justify-end pt-2 border-t border-border/50">
              <button
                onClick={() => deleteRow(row.id)}
                className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1.5 px-2 py-1 rounded transition-colors"
                title="Verwijder rij"
              >
                <Trash2 className="h-3.5 w-3.5" /> Verwijder rij
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============== Helpers ==============
function Field({ label, icon: Icon, children }: { label: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </label>
      {children}
    </div>
  );
}

function ReadOnlyChips({ items, variant = 'primary' }: { items: string[]; variant?: 'primary' | 'accent' }) {
  if (!items?.length) return <span className="text-xs text-muted-foreground/40">—</span>;
  const cls = variant === 'accent' ? 'bg-accent/15 text-accent-foreground' : 'bg-primary/10 text-primary';
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {items.map(i => (
        <span key={i} className={cn('inline-flex text-xs px-2.5 py-0.5 rounded-full font-medium', cls)}>{i}</span>
      ))}
    </div>
  );
}

function ReadOnlyText({ text }: { text: string | null }) {
  if (!text) return <span className="text-xs text-muted-foreground/40">—</span>;
  return <p className="text-xs whitespace-pre-wrap leading-relaxed bg-card border rounded-md p-2.5">{text}</p>;
}
