import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, LayoutGrid, Sheet, Copy, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
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

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  generated: 'bg-primary/10 text-primary',
  approved: 'bg-success/10 text-success',
  sent_to_designer: 'bg-warning/10 text-warning',
  delivered: 'bg-success/10 text-success',
};

export default function BriefingDetailView({ briefing, rows, onBack }: Props) {
  const [viewMode, setViewMode] = useState<'card' | 'sheet'>('card');
  const { toast } = useToast();
  const content = (briefing.content && typeof briefing.content === 'object' && !Array.isArray(briefing.content)) ? briefing.content as Record<string, any> : {};

  const copyAllText = () => {
    const lines: string[] = [];
    contentFields.forEach(f => {
      if (content[f.key]) lines.push(`${f.label}: ${content[f.key]}`);
    });
    arrayFields.forEach(f => {
      const arr = content[f.key];
      if (Array.isArray(arr) && arr.length) lines.push(`${f.label}:\n${arr.map((x: string) => `  • ${x}`).join('\n')}`);
    });
    navigator.clipboard.writeText(lines.join('\n\n'));
    toast({ title: 'Gekopieerd naar klembord' });
  };

  const exportCSV = () => {
    if (rows.length === 0) return;
    const headers = ['Nieuw/Remake', 'Functie', 'Locatie', 'Hook', "USP's", 'Omschrijving', 'Creative inspiratie'];
    const csvRows = rows.map(r => [
      r.is_new ? 'Nieuw' : 'Remake',
      r.functie || '',
      r.locatie || '',
      r.hook || '',
      r.usps || '',
      r.omschrijving || '',
      r.creative_inspiratie || '',
    ].map(v => `"${(v || '').replace(/"/g, '""')}"`).join(','));

    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `briefing-week${briefing.week_number || ''}-${new Date(briefing.created_at).toLocaleDateString('nl-NL')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'CSV gedownload' });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-8">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Terug
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{content.role || 'Briefing'}</h3>
              <Badge variant="outline" className={cn('text-[10px]', statusColors[briefing.status || ''])}>
                {briefing.status || 'draft'}
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Week {briefing.week_number} · v{briefing.version} · {new Date(briefing.created_at).toLocaleDateString('nl-NL')}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyAllText} className="h-8 text-xs">
            <Copy className="mr-1 h-3 w-3" /> Kopieer
          </Button>
          {rows.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportCSV} className="h-8 text-xs">
              <Download className="mr-1 h-3 w-3" /> CSV
            </Button>
          )}
        </div>
      </div>

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

        {/* Card view */}
        <TabsContent value="card" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {contentFields.map(f => {
              const val = content[f.key];
              if (!val) return null;
              return (
                <Card key={f.key} className="border-border/50">
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground">{f.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{val}</p>
                  </CardContent>
                </Card>
              );
            })}
            {arrayFields.map(f => {
              const arr = content[f.key];
              if (!Array.isArray(arr) || !arr.length) return null;
              return (
                <Card key={f.key} className="border-border/50">
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground">{f.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <ul className="space-y-1">
                      {arr.map((item: string, i: number) => (
                        <li key={i} className="text-sm text-foreground flex items-start gap-1.5">
                          <span className="text-primary mt-1">•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Sheet view */}
        <TabsContent value="sheet" className="mt-4">
          {rows.length > 0 ? (
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
                  {rows.map(row => (
                    <TableRow key={row.id} className="hover:bg-muted/20">
                      <TableCell className="text-xs">
                        <Badge variant={row.is_new ? 'default' : 'secondary'} className="text-[10px]">
                          {row.is_new ? 'Nieuw' : 'Remake'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium">{row.functie || '-'}</TableCell>
                      <TableCell className="text-xs">{row.locatie || '-'}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{row.hook || '-'}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{row.usps || '-'}</TableCell>
                      <TableCell className="text-xs max-w-[250px] truncate">{row.omschrijving || '-'}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{row.creative_inspiratie || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-sm text-muted-foreground">Geen briefing rijen beschikbaar.</p>
                <p className="text-xs text-muted-foreground/70 mt-1">De tabelweergave toont briefing rijen wanneer deze gegenereerd zijn.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
