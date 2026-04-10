import { useState, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, Copy, Download, Save, Check, ChevronDown, MessageSquarePlus, ImagePlus, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import BriefingStatusStepper from './BriefingStatusStepper';
import type { Json } from '@/integrations/supabase/types';
import * as XLSX from 'xlsx';

interface BriefingRow {
  id: string;
  is_new: boolean | null;
  functie: string | null;
  locatie: string | null;
  hook: string | null;
  usps: string | null;
  omschrijving: string | null;
  creative_inspiratie: string | null;
  creative_image_path?: string | null;
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

const strategicFields = [
  { key: 'creative_direction', label: 'Creative richting' },
  { key: 'target_audience', label: 'Doelgroep' },
  { key: 'campaign_objective', label: 'Campagne doel' },
  { key: 'core_message', label: 'Kernboodschap' },
  { key: 'main_hook', label: 'Hoofdhook' },
  { key: 'audience_tension', label: 'Spanning / trigger' },
  { key: 'visual_concept', label: 'Visueel concept' },
  { key: 'cta_direction', label: 'CTA richting' },
  { key: 'notes_for_designer', label: 'Notities voor designer' },
  { key: 'notes_for_recruiter', label: 'Notities voor recruiter' },
];

function renderUsps(text: string | null) {
  if (!text) return <span className="text-muted-foreground">-</span>;
  const items = text.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  if (items.length <= 1) return <span>{text}</span>;
  return (
    <ul className="list-none space-y-0.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <span className="text-primary mt-0.5 shrink-0">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function BriefingDetailView({ briefing, rows, onBack, onRefresh }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();

  const [currentStatus, setCurrentStatus] = useState(briefing.status || 'draft');
  const isEditable = currentStatus !== 'approved';

  const originalContent = (briefing.content && typeof briefing.content === 'object' && !Array.isArray(briefing.content)) ? briefing.content as Record<string, any> : {};
  const [editedContent, setEditedContent] = useState<Record<string, any>>({ ...originalContent });
  const [editedRows, setEditedRows] = useState<BriefingRow[]>(rows.map(r => ({ ...r })));
  const [saving, setSaving] = useState(false);
  const [extraNotesOpen, setExtraNotesOpen] = useState(false);
  const [designerNotes, setDesignerNotes] = useState(originalContent.manual_designer_notes || '');
  const [extraContext, setExtraContext] = useState(originalContent.manual_extra_context || '');
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const updateContent = (key: string, value: any) => {
    setEditedContent(prev => ({ ...prev, [key]: value }));
  };

  const updateRow = (rowId: string, field: keyof BriefingRow, value: any) => {
    setEditedRows(prev => prev.map(r => r.id === rowId ? { ...r, [field]: value } : r));
  };

  const handleImageUpload = async (rowId: string, file: File) => {
    const path = `${briefing.id}/${rowId}-${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('briefing-assets').upload(path, file);
    if (error) {
      toast({ title: 'Upload mislukt', description: error.message, variant: 'destructive' });
      return;
    }
    const { data: urlData } = supabase.storage.from('briefing-assets').getPublicUrl(path);
    updateRow(rowId, 'creative_image_path', urlData.publicUrl);
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
            creative_image_path: row.creative_image_path,
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
      const updates: { status: string; approved_by?: string; approved_at?: string } = { status: newStatus };
      if (newStatus === 'approved') {
        updates.approved_by = user?.id;
        updates.approved_at = new Date().toISOString();
      }
      await supabase.from('generated_briefings').update(updates).eq('id', briefing.id);
      setCurrentStatus(newStatus);
      toast({ title: newStatus === 'in_review' ? 'Briefing in review' : 'Briefing goedgekeurd!' });
      onRefresh?.();
    } catch {
      toast({ title: 'Status update mislukt', variant: 'destructive' });
    }
  };

  const copyAllText = () => {
    const lines: string[] = [];
    strategicFields.forEach(f => {
      if (editedContent[f.key]) lines.push(`${f.label}: ${editedContent[f.key]}`);
    });
    lines.push('', '--- Functies ---');
    editedRows.forEach(r => {
      lines.push(`\n${r.functie || 'Functie'} (${r.locatie || '-'})`);
      lines.push(`Hook: ${r.hook || '-'}`);
      const uspItems = (r.usps || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
      lines.push(`USP's:\n${uspItems.map(u => `  • ${u}`).join('\n')}`);
      lines.push(`Omschrijving: ${r.omschrijving || '-'}`);
      lines.push(`Creative inspiratie: ${r.creative_inspiratie || '-'}`);
    });
    navigator.clipboard.writeText(lines.join('\n'));
    toast({ title: 'Gekopieerd naar klembord' });
  };

  const exportXLSX = () => {
    if (editedRows.length === 0) return;

    const wb = XLSX.utils.book_new();

    // --- Sheet 1: Briefing rows ---
    const headers = ['Nieuw/Remake', 'Functie', 'Locatie', 'Hook', "USP's", 'Omschrijving', 'Creative inspiratie', 'Inspiratie afbeelding'];
    const data = editedRows.map(r => {
      const uspItems = (r.usps || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
      const uspFormatted = uspItems.length > 1 ? uspItems.map(u => `• ${u}`).join('\n') : (r.usps || '');
      return [
        r.is_new ? 'Nieuw' : 'Remake',
        r.functie || '',
        r.locatie || '',
        r.hook || '',
        uspFormatted,
        r.omschrijving || '',
        r.creative_inspiratie || '',
        r.creative_image_path || '',
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

    // Column widths
    ws['!cols'] = [
      { wch: 14 }, // Nieuw/Remake
      { wch: 22 }, // Functie
      { wch: 18 }, // Locatie
      { wch: 35 }, // Hook
      { wch: 35 }, // USP's
      { wch: 35 }, // Omschrijving
      { wch: 35 }, // Creative inspiratie
      { wch: 40 }, // Inspiratie afbeelding
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Briefing');

    // --- Sheet 2: Strategische context ---
    const stratData: string[][] = [['Veld', 'Waarde']];
    strategicFields
      .filter(f => editedContent[f.key])
      .forEach(f => stratData.push([f.label, String(editedContent[f.key])]));
    if (designerNotes) stratData.push(['Notities designer', designerNotes]);
    if (extraContext) stratData.push(['Extra context', extraContext]);

    if (stratData.length > 1) {
      const ws2 = XLSX.utils.aoa_to_sheet(stratData);
      ws2['!cols'] = [{ wch: 25 }, { wch: 60 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Strategische Context');
    }

    const filename = `briefing-week${briefing.week_number || ''}-${new Date(briefing.created_at).toLocaleDateString('nl-NL')}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast({ title: 'Excel geëxporteerd' });
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
            <h3 className="text-sm font-semibold text-foreground">
              Weekbriefing {briefing.week_number || ''}
            </h3>
            <p className="text-[10px] text-muted-foreground">
              v{briefing.version} · {new Date(briefing.created_at).toLocaleDateString('nl-NL')}
              {' · '}{editedRows.length} functie{editedRows.length !== 1 ? 's' : ''}
              {originalContent.auto_generated && <Badge variant="outline" className="ml-2 text-[9px]">Auto</Badge>}
            </p>
          </div>
        </div>
        <BriefingStatusStepper status={currentStatus} />
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
        {currentStatus === 'draft' && (
          <Button size="sm" onClick={() => handleStatusChange('in_review')} className="h-8 text-xs">
            In review zetten
          </Button>
        )}
        {currentStatus === 'in_review' && (
          <Button size="sm" onClick={() => handleStatusChange('approved')} className="h-8 text-xs bg-green-600 hover:bg-green-700">
            <Check className="mr-1 h-3 w-3" /> Goedkeuren
          </Button>
        )}
        {currentStatus === 'approved' && editedRows.length > 0 && (
          <Button size="sm" onClick={exportXLSX} className="h-8 text-xs">
            <Download className="mr-1 h-3 w-3" /> Exporteer Excel
          </Button>
        )}
      </div>

      {/* Strategic context — compact collapsible */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground w-full justify-start">
            <ChevronDown className="mr-1.5 h-3.5 w-3.5" />
            Strategische context
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="grid gap-3 md:grid-cols-2 pt-2">
          {strategicFields.map(f => {
            const val = editedContent[f.key];
            if (!val && !isEditable) return null;
            return (
              <div key={f.key} className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">{f.label}</label>
                {isEditable ? (
                  <Textarea
                    value={val || ''}
                    onChange={e => updateContent(f.key, e.target.value)}
                    className="text-sm min-h-[50px] border-border/30"
                    placeholder={f.label}
                  />
                ) : (
                  <p className="text-sm text-foreground whitespace-pre-wrap">{val}</p>
                )}
              </div>
            );
          })}
        </CollapsibleContent>
      </Collapsible>

      {/* Manual input section */}
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
              <Textarea value={designerNotes} onChange={e => setDesignerNotes(e.target.value)} placeholder="Specifieke wensen voor het ontwerp..." className="text-sm min-h-[60px]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Extra campagne context</label>
              <Textarea value={extraContext} onChange={e => setExtraContext(e.target.value)} placeholder="Extra vacature-input, campagnewensen..." className="text-sm min-h-[60px]" />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Main table — primary view */}
      {editedRows.length > 0 ? (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold w-[80px]">Nieuw</TableHead>
                <TableHead className="text-xs font-semibold min-w-[140px]">Functie</TableHead>
                <TableHead className="text-xs font-semibold min-w-[120px]">Locatie</TableHead>
                <TableHead className="text-xs font-semibold min-w-[180px]">Hook</TableHead>
                <TableHead className="text-xs font-semibold min-w-[180px]">USP's</TableHead>
                <TableHead className="text-xs font-semibold min-w-[180px]">Omschrijving</TableHead>
                <TableHead className="text-xs font-semibold min-w-[180px]">Creative inspiratie</TableHead>
                <TableHead className="text-xs font-semibold min-w-[120px]">Afbeelding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {editedRows.map(row => (
                <TableRow key={row.id} className="hover:bg-muted/20 align-top">
                  {/* Nieuw/Remake */}
                  <TableCell className="text-xs">
                    {isEditable ? (
                      <button onClick={() => updateRow(row.id, 'is_new', !row.is_new)} className="cursor-pointer">
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

                  {/* Functie, Locatie, Hook */}
                  {(['functie', 'locatie', 'hook'] as const).map(field => (
                    <TableCell key={field} className="text-xs whitespace-pre-wrap break-words">
                      {isEditable ? (
                        <Textarea
                          value={row[field] || ''}
                          onChange={e => updateRow(row.id, field, e.target.value)}
                          className="text-xs border-border/30 min-h-[60px] min-w-[120px]"
                        />
                      ) : (
                        <span>{row[field] || '-'}</span>
                      )}
                    </TableCell>
                  ))}

                  {/* USP's */}
                  <TableCell className="text-xs whitespace-pre-wrap break-words">
                    {isEditable ? (
                      <Textarea
                        value={row.usps || ''}
                        onChange={e => updateRow(row.id, 'usps', e.target.value)}
                        className="text-xs border-border/30 min-h-[60px] min-w-[150px]"
                        placeholder="Eén USP per regel"
                      />
                    ) : (
                      renderUsps(row.usps)
                    )}
                  </TableCell>

                  {/* Omschrijving */}
                  <TableCell className="text-xs whitespace-pre-wrap break-words">
                    {isEditable ? (
                      <Textarea
                        value={row.omschrijving || ''}
                        onChange={e => updateRow(row.id, 'omschrijving', e.target.value)}
                        className="text-xs border-border/30 min-h-[60px] min-w-[150px]"
                      />
                    ) : (
                      <span>{row.omschrijving || '-'}</span>
                    )}
                  </TableCell>

                  {/* Creative inspiratie (tekst) */}
                  <TableCell className="text-xs whitespace-pre-wrap break-words">
                    {isEditable ? (
                      <Textarea
                        value={row.creative_inspiratie || ''}
                        onChange={e => updateRow(row.id, 'creative_inspiratie', e.target.value)}
                        className="text-xs border-border/30 min-h-[60px] min-w-[150px]"
                      />
                    ) : (
                      <span>{row.creative_inspiratie || '-'}</span>
                    )}
                  </TableCell>

                  {/* Afbeelding — aparte kolom */}
                  <TableCell className="text-xs">
                    {row.creative_image_path ? (
                      <div className="relative inline-block">
                        <img src={row.creative_image_path} alt="Inspiratie" className="max-h-20 rounded border" />
                        {isEditable && (
                          <button
                            onClick={() => updateRow(row.id, 'creative_image_path', null)}
                            className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ) : isEditable ? (
                      <>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          ref={el => { fileInputRefs.current[row.id] = el; }}
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleImageUpload(row.id, file);
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px]"
                          onClick={() => fileInputRefs.current[row.id]?.click()}
                        >
                          <ImagePlus className="mr-1 h-3 w-3" /> Upload
                        </Button>
                      </>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
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
    </div>
  );
}
