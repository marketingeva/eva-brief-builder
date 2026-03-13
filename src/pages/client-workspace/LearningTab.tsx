import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Check, Save, BookOpen, Upload, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  clientId: string;
  onScoreChange: (score: number) => void;
}

interface LearningProfile {
  tone_of_voice: string;
  communication_guidelines: string;
  employer_branding: string;
  why_work_here: string;
  strategic_recruitment_goals: string;
  care_types: string[];
  words_to_use: string[];
  words_to_avoid: string[];
  creative_dos: string[];
  creative_donts: string[];
  visual_style_notes: string;
  internal_notes: string;
}

interface ClientInfo {
  website_url: string;
  mission: string;
  vision: string;
  description: string;
}

const emptyCareTypes = ['thuiszorg', 'revalidatie', 'verpleeghuis', 'flexpool', 'intramuraal', 'PG', 'somatiek'];

const emptyProfile: LearningProfile = {
  tone_of_voice: '',
  communication_guidelines: '',
  employer_branding: '',
  why_work_here: '',
  strategic_recruitment_goals: '',
  care_types: [],
  words_to_use: [],
  words_to_avoid: [],
  creative_dos: [],
  creative_donts: [],
  visual_style_notes: '',
  internal_notes: '',
};

function calculateScore(client: ClientInfo, profile: LearningProfile, locationCount: number, roleCount: number, audienceCount: number, uspCount: number, assetCount: number): number {
  let score = 0;
  let total = 0;

  // Identity (15%)
  const identityFields = [client.website_url, client.mission, client.vision, client.description];
  const identityFilled = identityFields.filter(f => f && f.trim()).length;
  score += (identityFilled >= 3 ? 15 : identityFilled >= 1 ? 7 : 0);
  total += 15;

  // Brand (15%)
  const brandFields = [profile.tone_of_voice, profile.communication_guidelines, profile.employer_branding];
  const brandFilled = brandFields.filter(f => f && f.trim()).length;
  score += (brandFilled >= 2 ? 15 : brandFilled >= 1 ? 7 : 0);
  total += 15;

  // Locations (10%)
  score += (locationCount >= 1 ? 10 : 0);
  total += 10;

  // Roles (15%)
  score += (roleCount >= 1 ? 15 : 0);
  total += 15;

  // Audience (15%)
  score += (audienceCount >= 1 ? 15 : 0);
  total += 15;

  // USPs (10%)
  score += (uspCount >= 2 ? 10 : uspCount >= 1 ? 5 : 0);
  total += 10;

  // Care types (10%)
  score += (profile.care_types.length >= 1 ? 10 : 0);
  total += 10;

  // Assets (10%)
  score += (assetCount >= 1 ? 10 : 0);
  total += 10;

  return Math.round((score / total) * 100);
}

export default function LearningTab({ clientId, onScoreChange }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [clientInfo, setClientInfo] = useState<ClientInfo>({ website_url: '', mission: '', vision: '', description: '' });
  const [profile, setProfile] = useState<LearningProfile>(emptyProfile);
  const [profileExists, setProfileExists] = useState(false);
  const [usps, setUsps] = useState<{ id?: string; usp_text: string }[]>([]);
  const [locationCount, setLocationCount] = useState(0);
  const [roleCount, setRoleCount] = useState(0);
  const [audienceCount, setAudienceCount] = useState(0);
  const [assetCount, setAssetCount] = useState(0);
  const [assets, setAssets] = useState<{ id: string; file_name: string; asset_category: string; created_at: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  const loadData = useCallback(async () => {
    const [clientRes, profileRes, uspsRes, locRes, roleRes, audRes, assetRes] = await Promise.all([
      supabase.from('clients').select('website_url, mission, vision, description').eq('id', clientId).single(),
      supabase.from('client_learning_profiles').select('*').eq('client_id', clientId).single(),
      supabase.from('client_usps').select('*').eq('client_id', clientId).order('sort_order'),
      supabase.from('client_locations').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
      supabase.from('client_roles').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
      supabase.from('client_audience_insights').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
      supabase.from('client_learning_assets').select('id, file_name, asset_category, created_at').eq('client_id', clientId).order('created_at', { ascending: false }),
    ]);

    if (clientRes.data) {
      setClientInfo({
        website_url: clientRes.data.website_url || '',
        mission: clientRes.data.mission || '',
        vision: clientRes.data.vision || '',
        description: clientRes.data.description || '',
      });
    }

    if (profileRes.data) {
      setProfileExists(true);
      setProfile({
        tone_of_voice: profileRes.data.tone_of_voice || '',
        communication_guidelines: profileRes.data.communication_guidelines || '',
        employer_branding: profileRes.data.employer_branding || '',
        why_work_here: profileRes.data.why_work_here || '',
        strategic_recruitment_goals: profileRes.data.strategic_recruitment_goals || '',
        care_types: profileRes.data.care_types || [],
        words_to_use: profileRes.data.words_to_use || [],
        words_to_avoid: profileRes.data.words_to_avoid || [],
        creative_dos: profileRes.data.creative_dos || [],
        creative_donts: profileRes.data.creative_donts || [],
        visual_style_notes: profileRes.data.visual_style_notes || '',
        internal_notes: profileRes.data.internal_notes || '',
      });
    }

    setUsps((uspsRes.data || []).map(u => ({ id: u.id, usp_text: u.usp_text })));
    setLocationCount(locRes.count || 0);
    setRoleCount(roleRes.count || 0);
    setAudienceCount(audRes.count || 0);
    setAssets(assetRes.data || []);
    setAssetCount(assetRes.data?.length || 0);
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Update score whenever data changes
  useEffect(() => {
    const score = calculateScore(clientInfo, profile, locationCount, roleCount, audienceCount, usps.length, assetCount);
    onScoreChange(score);
  }, [clientInfo, profile, locationCount, roleCount, audienceCount, usps, assetCount, onScoreChange]);

  const handleSave = async () => {
    setSaving(true);

    // Save client info
    await supabase.from('clients').update({
      website_url: clientInfo.website_url || null,
      mission: clientInfo.mission || null,
      vision: clientInfo.vision || null,
      description: clientInfo.description || null,
    }).eq('id', clientId);

    // Save learning profile
    const profileData = {
      client_id: clientId,
      tone_of_voice: profile.tone_of_voice || null,
      communication_guidelines: profile.communication_guidelines || null,
      employer_branding: profile.employer_branding || null,
      why_work_here: profile.why_work_here || null,
      strategic_recruitment_goals: profile.strategic_recruitment_goals || null,
      care_types: profile.care_types,
      words_to_use: profile.words_to_use,
      words_to_avoid: profile.words_to_avoid,
      creative_dos: profile.creative_dos,
      creative_donts: profile.creative_donts,
      visual_style_notes: profile.visual_style_notes || null,
      internal_notes: profile.internal_notes || null,
    };

    if (profileExists) {
      await supabase.from('client_learning_profiles').update(profileData).eq('client_id', clientId);
    } else {
      await supabase.from('client_learning_profiles').insert(profileData);
      setProfileExists(true);
    }

    // Save USPs: delete all, re-insert
    await supabase.from('client_usps').delete().eq('client_id', clientId);
    const uspInserts = usps.filter(u => u.usp_text.trim()).map((u, i) => ({
      client_id: clientId,
      usp_text: u.usp_text.trim(),
      sort_order: i,
    }));
    if (uspInserts.length > 0) {
      await supabase.from('client_usps').insert(uspInserts);
    }

    toast({ title: 'Opgeslagen', description: 'Learning data is bijgewerkt.' });
    setSaving(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, category: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const filePath = `${clientId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('learning-assets').upload(filePath, file);
    if (uploadError) {
      toast({ title: 'Upload mislukt', description: uploadError.message, variant: 'destructive' });
      setUploading(false);
      return;
    }

    await supabase.from('client_learning_assets').insert({
      client_id: clientId,
      file_name: file.name,
      file_path: filePath,
      file_type: file.type,
      asset_category: category,
      uploaded_by: user?.id,
    });

    toast({ title: 'Geüpload', description: file.name });
    setUploading(false);
    loadData();
  };

  const handleDeleteAsset = async (assetId: string, filePath: string) => {
    await supabase.storage.from('learning-assets').remove([filePath]);
    await supabase.from('client_learning_assets').delete().eq('id', assetId);
    loadData();
  };

  const toggleCareType = (ct: string) => {
    setProfile(p => ({
      ...p,
      care_types: p.care_types.includes(ct)
        ? p.care_types.filter(c => c !== ct)
        : [...p.care_types, ct],
    }));
  };

  const updateTagList = (field: keyof LearningProfile, value: string) => {
    const items = value.split(',').map(s => s.trim()).filter(Boolean);
    setProfile(p => ({ ...p, [field]: items }));
  };

  const score = calculateScore(clientInfo, profile, locationCount, roleCount, audienceCount, usps.length, assetCount);

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      {/* Score header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold',
            score >= 80 ? 'bg-success/10 text-success' :
            score >= 40 ? 'bg-warning/10 text-warning' :
            'bg-muted text-muted-foreground'
          )}>
            {score}%
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">AI Training Book</h2>
            <p className="text-xs text-muted-foreground">
              {score >= 80 ? 'De AI heeft voldoende context — klaar om te genereren.' :
               score >= 40 ? 'Vul meer secties in voor betere AI-resultaten.' :
               'Begin met het invullen van de client kennis.'}
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Save className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Opslaan
        </Button>
      </div>

      <Accordion type="multiple" defaultValue={['identity', 'brand']} className="space-y-3">
        {/* Identity */}
        <AccordionItem value="identity" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium">
            <div className="flex items-center gap-2">
              Identiteit & Basis
              {(clientInfo.website_url || clientInfo.mission || clientInfo.vision) && <Check className="h-3.5 w-3.5 text-success" />}
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="space-y-2">
              <Label>Website URL</Label>
              <Input value={clientInfo.website_url} onChange={e => setClientInfo(p => ({ ...p, website_url: e.target.value }))} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label>Omschrijving</Label>
              <Textarea value={clientInfo.description} onChange={e => setClientInfo(p => ({ ...p, description: e.target.value }))} placeholder="Korte beschrijving van de organisatie" rows={2} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Missie</Label>
                <Textarea value={clientInfo.mission} onChange={e => setClientInfo(p => ({ ...p, mission: e.target.value }))} placeholder="Missie van de organisatie" rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Visie</Label>
                <Textarea value={clientInfo.vision} onChange={e => setClientInfo(p => ({ ...p, vision: e.target.value }))} placeholder="Visie van de organisatie" rows={3} />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Brand & Tone */}
        <AccordionItem value="brand" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium">
            <div className="flex items-center gap-2">
              Merk & Tone of Voice
              {(profile.tone_of_voice || profile.employer_branding) && <Check className="h-3.5 w-3.5 text-success" />}
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="space-y-2">
              <Label>Tone of Voice</Label>
              <Textarea value={profile.tone_of_voice} onChange={e => setProfile(p => ({ ...p, tone_of_voice: e.target.value }))} placeholder="Warm, persoonlijk, informeel..." rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Communicatierichtlijnen</Label>
              <Textarea value={profile.communication_guidelines} onChange={e => setProfile(p => ({ ...p, communication_guidelines: e.target.value }))} placeholder="Richtlijnen voor communicatie" rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Employer Branding</Label>
              <Textarea value={profile.employer_branding} onChange={e => setProfile(p => ({ ...p, employer_branding: e.target.value }))} placeholder="Kernboodschap werkgeversmerk" rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Waarom hier werken?</Label>
              <Textarea value={profile.why_work_here} onChange={e => setProfile(p => ({ ...p, why_work_here: e.target.value }))} placeholder="Redenen waarom kandidaten hier willen werken" rows={3} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* USPs */}
        <AccordionItem value="usps" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium">
            <div className="flex items-center gap-2">
              USPs
              {usps.length > 0 && <Check className="h-3.5 w-3.5 text-success" />}
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-4">
            {usps.map((usp, i) => (
              <div key={i} className="flex gap-2">
                <Input value={usp.usp_text} onChange={e => {
                  const next = [...usps];
                  next[i] = { ...next[i], usp_text: e.target.value };
                  setUsps(next);
                }} placeholder={`USP ${i + 1}`} />
                <Button variant="ghost" size="icon" onClick={() => setUsps(usps.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setUsps([...usps, { usp_text: '' }])}>
              <Plus className="mr-1 h-3 w-3" /> USP toevoegen
            </Button>
          </AccordionContent>
        </AccordionItem>

        {/* Care types */}
        <AccordionItem value="care" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium">
            <div className="flex items-center gap-2">
              Zorgtypen
              {profile.care_types.length > 0 && <Check className="h-3.5 w-3.5 text-success" />}
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="flex flex-wrap gap-2">
              {emptyCareTypes.map(ct => (
                <button
                  key={ct}
                  type="button"
                  onClick={() => toggleCareType(ct)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
                    profile.care_types.includes(ct)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                  )}
                >
                  {ct}
                </button>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Recruitment strategy */}
        <AccordionItem value="strategy" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium">
            <div className="flex items-center gap-2">
              Recruitmentstrategie
              {profile.strategic_recruitment_goals && <Check className="h-3.5 w-3.5 text-success" />}
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="space-y-2">
              <Label>Strategische recruitmentdoelen</Label>
              <Textarea value={profile.strategic_recruitment_goals} onChange={e => setProfile(p => ({ ...p, strategic_recruitment_goals: e.target.value }))} placeholder="Wat zijn de belangrijkste wervingsdoelen?" rows={3} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Creative guidelines */}
        <AccordionItem value="creative" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium">
            <div className="flex items-center gap-2">
              Creative Richtlijnen
              {(profile.words_to_use.length > 0 || profile.creative_dos.length > 0) && <Check className="h-3.5 w-3.5 text-success" />}
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Woorden om te gebruiken</Label>
                <Textarea value={profile.words_to_use.join(', ')} onChange={e => updateTagList('words_to_use', e.target.value)} placeholder="woord1, woord2, woord3" rows={2} />
                <p className="text-[10px] text-muted-foreground">Komma-gescheiden</p>
              </div>
              <div className="space-y-2">
                <Label>Woorden om te vermijden</Label>
                <Textarea value={profile.words_to_avoid.join(', ')} onChange={e => updateTagList('words_to_avoid', e.target.value)} placeholder="woord1, woord2, woord3" rows={2} />
                <p className="text-[10px] text-muted-foreground">Komma-gescheiden</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Do's voor creative</Label>
                <Textarea value={profile.creative_dos.join(', ')} onChange={e => updateTagList('creative_dos', e.target.value)} placeholder="do1, do2, do3" rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Don'ts voor creative</Label>
                <Textarea value={profile.creative_donts.join(', ')} onChange={e => updateTagList('creative_donts', e.target.value)} placeholder="dont1, dont2, dont3" rows={2} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Visuele stijlnotities</Label>
              <Textarea value={profile.visual_style_notes} onChange={e => setProfile(p => ({ ...p, visual_style_notes: e.target.value }))} placeholder="Kleurgebruik, fotostijl, etc." rows={2} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Internal notes */}
        <AccordionItem value="notes" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium">Interne notities</AccordionTrigger>
          <AccordionContent className="pb-4">
            <Textarea value={profile.internal_notes} onChange={e => setProfile(p => ({ ...p, internal_notes: e.target.value }))} placeholder="Interne opmerkingen van Eva Zorg" rows={4} />
          </AccordionContent>
        </AccordionItem>

        {/* Assets */}
        <AccordionItem value="assets" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium">
            <div className="flex items-center gap-2">
              Documenten & Uploads
              {assetCount > 0 && <Check className="h-3.5 w-3.5 text-success" />}
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {['brandbook', 'vacatures', 'statics', 'campagne_assets', 'overig'].map(cat => (
                <div key={cat}>
                  <Label className="text-xs capitalize mb-1 block">{cat.replace('_', ' ')}</Label>
                  <label className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed p-3 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors',
                    uploading && 'opacity-50 pointer-events-none'
                  )}>
                    <Upload className="h-4 w-4" />
                    Upload bestand
                    <input type="file" className="hidden" onChange={e => handleFileUpload(e, cat)} />
                  </label>
                </div>
              ))}
            </div>

            {assets.length > 0 && (
              <div className="space-y-1.5 mt-4">
                <p className="text-xs font-medium text-muted-foreground">Geüploade bestanden</p>
                {assets.map(a => (
                  <div key={a.id} className="flex items-center justify-between rounded border px-3 py-2">
                    <div>
                      <p className="text-sm text-foreground">{a.file_name}</p>
                      <p className="text-[10px] text-muted-foreground">{a.asset_category} · {new Date(a.created_at).toLocaleDateString('nl-NL')}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteAsset(a.id, '')}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Existing data counts */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Data uit andere tabbladen</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>Locaties: <span className="font-medium text-foreground">{locationCount}</span> — beheer via het oude Locations tabblad (wordt binnenkort samengevoegd)</p>
          <p>Rollen: <span className="font-medium text-foreground">{roleCount}</span></p>
          <p>Doelgroepen: <span className="font-medium text-foreground">{audienceCount}</span></p>
        </CardContent>
      </Card>
    </div>
  );
}
