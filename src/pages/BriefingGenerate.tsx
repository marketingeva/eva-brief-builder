import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, RefreshCw, Check, Copy } from 'lucide-react';

interface BriefingContent {
  client: string;
  role: string;
  region: string;
  target_audience: string;
  campaign_objective: string;
  key_recruitment_challenge: string;
  main_hook: string;
  audience_tension: string;
  core_message: string;
  proof_points_usps: string[];
  creative_direction: string;
  visual_concept: string;
  suggested_scenes: string;
  onscreen_copy_ideas: string[];
  ad_copy_starter: string;
  hook_variants: string[];
  cta_direction: string;
  what_to_avoid: string[];
  notes_for_designer: string;
  notes_for_recruiter: string;
  internal_comments: string;
}

const sectionLabels: Record<keyof BriefingContent, string> = {
  client: 'Client',
  role: 'Role',
  region: 'Region',
  target_audience: 'Target Audience',
  campaign_objective: 'Campaign Objective',
  key_recruitment_challenge: 'Key Recruitment Challenge',
  main_hook: 'Main Hook',
  audience_tension: 'Audience Tension / Trigger',
  core_message: 'Core Message',
  proof_points_usps: 'Proof Points & USPs',
  creative_direction: 'Creative Direction',
  visual_concept: 'Visual Concept',
  suggested_scenes: 'Suggested Scenes / Static Concept',
  onscreen_copy_ideas: 'On-Screen Copy Ideas',
  ad_copy_starter: 'Ad Copy Starter',
  hook_variants: 'Hook Variants',
  cta_direction: 'CTA Direction',
  what_to_avoid: 'What To Avoid',
  notes_for_designer: 'Notes for Designer',
  notes_for_recruiter: 'Notes for Recruiter',
  internal_comments: 'Internal Comments',
};

export default function BriefingGenerate() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [briefing, setBriefing] = useState<BriefingContent | null>(null);
  const [briefingId, setBriefingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const generatedRef = useRef(false);

  const generate = async () => {
    if (!requestId) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-briefing', {
        body: { campaign_request_id: requestId },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setBriefing(data.briefing);
      setBriefingId(data.briefing_id);
    } catch (e: any) {
      const msg = e?.message || 'Failed to generate briefing';
      setError(msg);
      toast({ title: 'Generation failed', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!generatedRef.current) {
      generatedRef.current = true;
      generate();
    }
  }, [requestId]);

  const handleCopy = () => {
    if (!briefing) return;
    const text = Object.entries(briefing)
      .map(([key, val]) => {
        const label = sectionLabels[key as keyof BriefingContent] || key;
        const value = Array.isArray(val) ? val.map(v => `  • ${v}`).join('\n') : val;
        return `## ${label}\n${value}`;
      })
      .join('\n\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Copied to clipboard' });
  };

  const renderValue = (key: string, value: any) => {
    if (Array.isArray(value)) {
      return (
        <ul className="space-y-1">
          {value.map((v, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
              {v}
            </li>
          ))}
        </ul>
      );
    }
    return <p className="text-sm text-foreground whitespace-pre-wrap">{value}</p>;
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/briefings')}>
        <ArrowLeft className="mr-2 h-4 w-4" />Briefings
      </Button>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Generated Briefing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI-generated creative briefing based on client knowledge
          </p>
        </div>
        {briefing && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="outline" size="sm" onClick={generate} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Regenerate
            </Button>
          </div>
        )}
      </div>

      {loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-16">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">Generating briefing...</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The AI is analyzing client knowledge and crafting your briefing
            </p>
          </CardContent>
        </Card>
      )}

      {error && !loading && (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-sm font-medium text-destructive mb-4">{error}</p>
            <Button onClick={generate}>Try again</Button>
          </CardContent>
        </Card>
      )}

      {briefing && !loading && (
        <div className="space-y-4">
          {/* Header fields */}
          <Card>
            <CardContent className="p-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Client</p>
                  <p className="text-sm font-semibold text-foreground">{briefing.client}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Role</p>
                  <p className="text-sm font-semibold text-foreground">{briefing.role}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Region</p>
                  <p className="text-sm font-semibold text-foreground">{briefing.region || '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Strategy */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Strategy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {(['target_audience', 'campaign_objective', 'key_recruitment_challenge', 'main_hook', 'audience_tension', 'core_message'] as const).map(key => (
                <div key={key}>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{sectionLabels[key]}</p>
                  {renderValue(key, briefing[key])}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Proof & USPs */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Proof Points & USPs</CardTitle>
            </CardHeader>
            <CardContent>{renderValue('proof_points_usps', briefing.proof_points_usps)}</CardContent>
          </Card>

          {/* Creative */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Creative Direction</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {(['creative_direction', 'visual_concept', 'suggested_scenes'] as const).map(key => (
                <div key={key}>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{sectionLabels[key]}</p>
                  {renderValue(key, briefing[key])}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Copy */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Copy & Hooks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">On-Screen Copy Ideas</p>
                {renderValue('onscreen_copy_ideas', briefing.onscreen_copy_ideas)}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Ad Copy Starter</p>
                {renderValue('ad_copy_starter', briefing.ad_copy_starter)}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Hook Variants</p>
                {renderValue('hook_variants', briefing.hook_variants)}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">CTA Direction</p>
                {renderValue('cta_direction', briefing.cta_direction)}
              </div>
            </CardContent>
          </Card>

          {/* Avoid & Notes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Guidelines & Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">What To Avoid</p>
                {renderValue('what_to_avoid', briefing.what_to_avoid)}
              </div>
              {(['notes_for_designer', 'notes_for_recruiter', 'internal_comments'] as const).map(key => (
                <div key={key}>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{sectionLabels[key]}</p>
                  {renderValue(key, briefing[key])}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
