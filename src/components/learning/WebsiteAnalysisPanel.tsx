import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Globe, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AnalysisData {
  description?: string;
  mission?: string;
  vision?: string;
  tone_of_voice?: string;
  employer_branding?: string;
  why_work_here?: string;
  locations?: { name: string; city?: string; region?: string }[];
  care_types?: string[];
  roles?: { role_title: string; care_domain?: string; description?: string }[];
  usps?: string[];
  confidence_notes?: string;
}

interface Props {
  clientId: string;
  websiteUrl: string;
  analysisData: AnalysisData | null;
  analyzedAt: string | null;
  onAnalysisComplete: () => void;
  onApplyField: (field: string, value: any) => void;
}

export default function WebsiteAnalysisPanel({ clientId, websiteUrl, analysisData, analyzedAt, onAnalysisComplete, onApplyField }: Props) {
  const [analyzing, setAnalyzing] = useState(false);
  const { toast } = useToast();

  const runAnalysis = useCallback(async () => {
    if (!websiteUrl) {
      toast({ title: 'Vul eerst een website URL in', variant: 'destructive' });
      return;
    }
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-website', {
        body: { client_id: clientId, website_url: websiteUrl },
      });
      if (error) throw error;
      toast({ title: 'Website geanalyseerd', description: 'AI-suggesties zijn beschikbaar. Controleer en bevestig de informatie.' });
      onAnalysisComplete();
    } catch (e: any) {
      toast({ title: 'Analyse mislukt', description: e.message, variant: 'destructive' });
    } finally {
      setAnalyzing(false);
    }
  }, [clientId, websiteUrl, toast, onAnalysisComplete]);

  if (!analysisData && !analyzing) {
    return (
      <Card className="border-dashed border-accent/40 bg-accent/5">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe className="h-5 w-5 text-accent" />
            <div>
              <p className="text-sm font-medium text-foreground">Website analyse</p>
              <p className="text-xs text-muted-foreground">Laat AI de website scannen voor een eerste draft van klantinformatie</p>
            </div>
          </div>
          <Button onClick={runAnalysis} disabled={!websiteUrl} size="sm" variant="outline" className="border-accent/40 text-accent hover:bg-accent/10">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Analyseer website
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (analyzing) {
    return (
      <Card className="border-accent/40 bg-accent/5">
        <CardContent className="p-6 text-center">
          <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-accent" />
          <p className="text-sm font-medium text-foreground">Website wordt geanalyseerd...</p>
          <p className="text-xs text-muted-foreground mt-1">Dit kan 10-30 seconden duren</p>
        </CardContent>
      </Card>
    );
  }

  if (!analysisData) return null;

  const suggestionItems: { label: string; field: string; value: any; type: 'text' | 'array' | 'locations' | 'roles' }[] = [];

  if (analysisData.description) suggestionItems.push({ label: 'Organisatiebeschrijving', field: 'description', value: analysisData.description, type: 'text' });
  if (analysisData.mission) suggestionItems.push({ label: 'Missie', field: 'mission', value: analysisData.mission, type: 'text' });
  if (analysisData.vision) suggestionItems.push({ label: 'Visie', field: 'vision', value: analysisData.vision, type: 'text' });
  if (analysisData.tone_of_voice) suggestionItems.push({ label: 'Tone of Voice', field: 'tone_of_voice', value: analysisData.tone_of_voice, type: 'text' });
  if (analysisData.employer_branding) suggestionItems.push({ label: 'Employer Branding', field: 'employer_branding', value: analysisData.employer_branding, type: 'text' });
  if (analysisData.why_work_here) suggestionItems.push({ label: 'Waarom hier werken', field: 'why_work_here', value: analysisData.why_work_here, type: 'text' });
  if (analysisData.care_types?.length) suggestionItems.push({ label: 'Zorgtypen', field: 'care_types', value: analysisData.care_types, type: 'array' });
  if (analysisData.usps?.length) suggestionItems.push({ label: "USP's", field: 'usps', value: analysisData.usps, type: 'array' });
  if (analysisData.locations?.length) suggestionItems.push({ label: 'Locaties', field: 'locations', value: analysisData.locations, type: 'locations' });
  if (analysisData.roles?.length) suggestionItems.push({ label: 'Functies', field: 'roles', value: analysisData.roles, type: 'roles' });

  return (
    <Card className="border-accent/30 bg-accent/5">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <CardTitle className="text-sm">AI Website Suggesties</CardTitle>
            <Badge variant="outline" className="text-[10px] bg-accent/10 text-accent border-accent/30">
              {suggestionItems.length} suggesties
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {analyzedAt && (
              <span className="text-[10px] text-muted-foreground">
                Geanalyseerd: {new Date(analyzedAt).toLocaleDateString('nl-NL')}
              </span>
            )}
            <Button onClick={runAnalysis} disabled={analyzing} size="sm" variant="ghost" className="h-7 text-xs">
              <Sparkles className="mr-1 h-3 w-3" />
              Opnieuw
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {analysisData.confidence_notes && (
          <div className="flex items-start gap-2 mb-3 p-2 rounded bg-background/60 border border-border/50">
            <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted-foreground">{analysisData.confidence_notes}</p>
          </div>
        )}
        <div className="space-y-2">
          {suggestionItems.map(item => (
            <div key={item.field} className="flex items-start justify-between gap-3 p-2 rounded hover:bg-background/60 transition-colors group">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground">{item.label}</p>
                {item.type === 'text' && (
                  <p className="text-xs text-foreground mt-0.5 line-clamp-2">{item.value}</p>
                )}
                {item.type === 'array' && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(item.value as string[]).map((v, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{v}</Badge>
                    ))}
                  </div>
                )}
                {item.type === 'locations' && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(item.value as any[]).map((l, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{l.name}{l.city ? ` (${l.city})` : ''}</Badge>
                    ))}
                  </div>
                )}
                {item.type === 'roles' && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(item.value as any[]).map((r, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{r.role_title}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={() => onApplyField(item.field, item.value)}
              >
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Overnemen
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
