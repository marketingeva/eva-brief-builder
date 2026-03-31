import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, LayoutGrid, Sheet, Copy, Download, Save, Check, ChevronDown, MessageSquarePlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import BriefingStatusStepper from './BriefingStatusStepper';
import type { Json } from '@/integrations/supabase/types';

interface BriefingRow {
  id: string;
  is_new: boolean | null;
  functie: string | null;
  locatie: string | null;
  hook: string | null;
  usps: string | null;
  omschrijving: string | null;
  creative_inspiratie: string | null;
  sort_order: number | null;
}

interface GeneratedBriefing {
  id: string;
  content: Json;
  status: string | null;
  version: number;
  week_number: number | null;
  created_at: string;
}

interface Props {
  briefing: GeneratedBriefing;
  rows: BriefingRow[];
  onBack: () => void;
  onRefresh?: () => void;
}

const contentFields = [
  { key: 'role', label: 'Functie' },
  { key: 'region', label: 'Regio' },
  { key: 'target_audience', label: 'Doelgroep' },
  { key: 'campaign_objective', label: 'Campagne doel' },
  { key: 'key_recruitment_challenge', label: 'Recruitment uitdaging' },
  { key: 'main_hook', label: 'Hoofdhook' },
  { key: 'audience_tension', label: 'Spanning / trigger' },
  { key: 'core_message', label: 'Kernboodschap' },
  { key: 'creative_direction', label: 'Creative richting' },
  { key: 'visual_concept', label: 'Visueel concept' },
  { key: 'suggested_scenes', label: 'Scènes / statics' },
  { key: 'ad_copy_starter', label: 'Ad copy concept' },
  { key: 'cta_direction', label: 'CTA richting' },
  { key: 'notes_for_designer', label: 'Notities voor designer' },
  { key: 'notes_for_recruiter', label: 'Notities voor recruiter' },
  { key: 'internal_comments', label: 'Interne opmerkingen' },
];

const arrayFields = [
  { key: 'proof_points_usps', label: "USP's" },
  { key: 'onscreen_copy_ideas', label: 'On-screen copy' },
  { key: 'hook_variants', label: 'Hook varianten' },
  { key: 'what_to_avoid', label: 'Te vermijden' },
];

export default function BriefingDetailView({ briefing, rows, onBack, onRefresh }: Props) {
  const [viewMode, setViewMode] = useState<'card' | 'sheet'>('card');
  const { toast } = useToast();
  const { user } = useAuth();

  const [currentStatus, setCurrentStatus] = useState(briefing.status || 'draft');
  const isEditable = currentStatus !== 'approved';

  // Editable content state
  const originalContent = (briefing.content && typeof briefing.content === 'object' && !Array.isArray(briefing.content)) ? briefing.content as Record<string, any> : {};
  const [editedContent, setEditedContent] = useState<Record<string, any>>({ ...originalContent });
  const [editedRows, setEditedRows] = useState<BriefingRow[]>(rows.map(r => ({ ...r })));
  const [saving, setSaving] = useState(false);
  const [extraNotesOpen, setExtraNotesOpen] = useState(false);
  const [designerNotes, setDesignerNotes] = useState(originalContent.manual_designer_notes || '');
  const [extraContext, setExtraContext] = useState(originalContent.manual_extra_context || '');

  const updateContent = (key: string, value: any) => {
    setEditedContent(prev => ({ ...prev, [key]: value }));
  };

  const updateRow = (rowId: string, field: keyof BriefingRow, value: any) => {
    setEditedRows(prev => prev.map(r => r.id === rowId ? { ...r, [field]: value } : r));
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const contentToSave = {
        ...editedContent,
        manual_designer_notes: designerNotes,
        manual_extra_context: extraContext,
      };

      await supabase
        .from('generated_briefings')
        .update({ content: contentToSave as unknown as Json })
        .eq('id', briefing.id);

      // Update rows
      for (const row of editedRows) {
        await supabase
          .from('briefing_rows')
          .update({
            functie: row.functie,
            locatie: row.locatie,
            hook: row.hook,
            usps: row.usps,
            omschrijving: row.omschrijving,
            creative_inspiratie: row.creative_inspiratie,
            is_new: row.is_new,
          })
          .eq('id', row.id);
      }

      toast({ title: 'Wijzigingen opgeslagen' });
      onRefresh?.();
    } catch (e: any) {
      toast({ title: 'Opslaan mislukt', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [editedContent, editedRows, designerNotes, extraContext, briefing.id, toast, onRefresh]);

  const handleStatusChange = async (newStatus: string) => {
    try {
      const updates: Record<string, any> = { status: newStatus };
      if (newStatus === 'approved') {
        updates.approved_by = user?.id;
        updates.approved_at = new Date().toISOString();
      }
      await supabase.from('generated_briefings').update(updates).eq('id', briefing.id);
      setCurrentStatus(newStatus);
      toast({ title: newStatus === 'in_review' ? 'Briefing in review' : 'Briefing goedgekeurd!' });
      onRefresh?.();
    } catch (e: any) {
      toast({ title: 'Status update mislukt', variant: 'destructive' });
    }
  };

  const copyAllText = () => {
    const lines: string[] = [];
    contentFields.forEach(f => {
      if (editedContent[f.key]) lines.push(`${f.label}: ${editedContent[f.key]}`);
    });
    arrayFields.forEach(f => {
      const arr = editedContent[f.key];
      if (Array.isArray(arr) && arr.length) lines.push(`${f.label}:\n${arr.map((x: string) => `  • ${x}`).join('\n')}`);
    });
    navigator.clipboard.writeText(lines.join('\n\n'));
    toast({ title: 'Gekopieerd naar klembord' });
  };

  const exportCSV = () => {
    if (editedRows.length === 0) return;
    const headers = ['Nieuw/Remake', 'Functie', 'Locatie', 'Hook', "USP's", 'Omschrijving', 'Creative inspiratie'];
    const csvRows = editedRows.map(r => [
      r.is_new ? 'Nieuw' : 'Remake',
      r.functie || '',
      r.locatie || '',
      r.hook || '',
      r.usps || '',
      r.omschrijving || '',
      r.creative_inspiratie || '',
    ].map(v => `"${(v || '').replace(/"/g, '""')}"`).join(','));

    // Also add strategic content as extra rows
    const stratLines = contentFields
      .filter(f => editedContent[f.key])
      .map(f => `"${f.label}","${String(editedContent[f.key]).replace(/"/g, '""')}","","","","",""`);

    const csv = [headers.join(','), ...csvRows, '', '"--- Strategische Context ---","","","","","",""', ...stratLines].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `briefing-week${briefing.week_number || ''}-${new Date(briefing.created_at).toLocaleDateString('nl-NL')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'CSV geëxporteerd' });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-8">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Terug
          </Button>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{editedContent.role || 'Briefing'}</h3>
            <p className="text-[10px] text-muted-foreground">
              Week {briefing.week_number} · v{briefing.version} · {new Date(briefing.created_at).toLocaleDateString('nl-NL')}
              {originalContent.auto_generated && <Badge variant="outline" className="ml-2 text-[9px]">Auto</Badge>}
            </p>
          </div>
        </div>
        <BriefingStatusStepper status={status} />
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {isEditable && (
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving} className="h-8 text-xs">
            <Save className="mr-1 h-3 w-3" /> {saving ? 'Opslaan...' : 'Opslaan'}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={copyAllText} className="h-8 text-xs">
          <Copy className="mr-1 h-3 w-3" /> Kopieer
        </Button>

        {status === 'draft' && (
          <Button size="sm" onClick={() => handleStatusChange('in_review')} className="h-8 text-xs">
            In review zetten
          </Button>
        )}
        {status === 'in_review' && (
          <Button size="sm" onClick={() => handleStatusChange('approved')} className="h-8 text-xs bg-green-600 hover:bg-green-700">
            <Check className="mr-1 h-3 w-3" /> Goedkeuren
          </Button>
        )}
        {status === 'approved' && editedRows.length > 0 && (
          <Button size="sm" onClick={exportCSV} className="h-8 text-xs">
            <Download className="mr-1 h-3 w-3" /> Exporteer als CSV
          </Button>
        )}
      </div>

      {/* Manual input section — collapsible */}
      {isEditable && (
        <Collapsible open={extraNotesOpen} onOpenChange={setExtraNotesOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground w-full justify-start">
              <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" />
              Extra input toevoegen
              <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform', extraNotesOpen && 'rotate-180')} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Context voor designer</label>
              <Textarea
                value={designerNotes}
                onChange={e => setDesignerNotes(e.target.value)}
                placeholder="Specifieke wensen voor het ontwerp, referenties, kleuren..."
                className="text-sm min-h-[60px]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Extra campagne context</label>
              <Textarea
                value={extraContext}
                onChange={e => setExtraContext(e.target.value)}
                placeholder="Extra vacature-input, campagnewensen, opmerkingen..."
                className="text-sm min-h-[60px]"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* View toggle */}
      <Tabs value={viewMode} onValueChange={v => setViewMode(v as 'card' | 'sheet')}>
        <TabsList className="h-8">
          <TabsTrigger value="card" className="text-xs h-7 px-3">
            <LayoutGrid className="mr-1 h-3 w-3" /> Detailweergave
          </TabsTrigger>
          <TabsTrigger value="sheet" className="text-xs h-7 px-3">
            <Sheet className="mr-1 h-3 w-3" /> Tabelweergave
          </TabsTrigger>
        </TabsList>

        {/* Card view — editable */}
        <TabsContent value="card" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {contentFields.map(f => {
              const val = editedContent[f.key];
              if (!val && !isEditable) return null;
              return (
                <Card key={f.key} className="border-border/50">
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground">{f.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    {isEditable ? (
                      <Textarea
                        value={val || ''}
                        onChange={e => updateContent(f.key, e.target.value)}
                        className="text-sm min-h-[60px] border-border/30"
                        placeholder={f.label}
                      />
                    ) : (
                      <p className="text-sm text-foreground whitespace-pre-wrap">{val}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {arrayFields.map(f => {
              const arr = editedContent[f.key];
              if ((!Array.isArray(arr) || !arr.length) && !isEditable) return null;
              return (
                <Card key={f.key} className="border-border/50">
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground">{f.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    {isEditable ? (
                      <Textarea
                        value={Array.isArray(arr) ? arr.join('\n') : ''}
                        onChange={e => updateContent(f.key, e.target.value.split('\n').filter(Boolean))}
                        className="text-sm min-h-[60px] border-border/30"
                        placeholder="Eén item per regel"
                      />
                    ) : (
                      <ul className="space-y-1">
                        {(arr || []).map((item: string, i: number) => (
                          <li key={i} className="text-sm text-foreground flex items-start gap-1.5">
                            <span className="text-primary mt-1">•</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Sheet view — editable */}
        <TabsContent value="sheet" className="mt-4">
          {editedRows.length > 0 ? (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs font-semibold w-[80px]">Nieuw</TableHead>
                    <TableHead className="text-xs font-semibold">Functie</TableHead>
                    <TableHead className="text-xs font-semibold">Locatie</TableHead>
                    <TableHead className="text-xs font-semibold">Hook</TableHead>
                    <TableHead className="text-xs font-semibold">USP's</TableHead>
                    <TableHead className="text-xs font-semibold">Omschrijving</TableHead>
                    <TableHead className="text-xs font-semibold">Creative inspiratie</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editedRows.map(row => (
                    <TableRow key={row.id} className="hover:bg-muted/20">
                      <TableCell className="text-xs">
                        {isEditable ? (
                          <button
                            onClick={() => updateRow(row.id, 'is_new', !row.is_new)}
                            className="cursor-pointer"
                          >
                            <Badge variant={row.is_new ? 'default' : 'secondary'} className="text-[10px]">
                              {row.is_new ? 'Nieuw' : 'Remake'}
                            </Badge>
                          </button>
                        ) : (
                          <Badge variant={row.is_new ? 'default' : 'secondary'} className="text-[10px]">
                            {row.is_new ? 'Nieuw' : 'Remake'}
                          </Badge>
                        )}
                      </TableCell>
                      {(['functie', 'locatie', 'hook', 'usps', 'omschrijving', 'creative_inspiratie'] as const).map(field => (
                        <TableCell key={field} className="text-xs">
                          {isEditable ? (
                            <Input
                              value={row[field] || ''}
                              onChange={e => updateRow(row.id, field, e.target.value)}
                              className="h-7 text-xs border-border/30 min-w-[120px]"
                            />
                          ) : (
                            <span className="max-w-[200px] truncate block">{row[field] || '-'}</span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-sm text-muted-foreground">Geen briefing rijen beschikbaar.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
