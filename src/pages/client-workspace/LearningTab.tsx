import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Check, Save, Upload, Trash2, Plus, X, Building2, MapPin, Heart, Users, Star, Target, Palette, FileUp, MessageSquare, RefreshCw, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import StatusBadge, { type FieldStatus } from '@/components/learning/StatusBadge';

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

type FieldStatuses = Record<string, FieldStatus>;

const allCareTypes = [
  'thuiszorg', 'revalidatie', 'verpleeghuis', 'intramuraal', 'extramuraal',
  'PG', 'somatiek', 'flexpool', 'wijkzorg', 'dementiezorg',
  'gehandicaptenzorg', 'jeugdzorg', 'GGZ', 'hospice', 'geriatrische revalidatiezorg',
];

const emptyProfile: LearningProfile = {
  tone_of_voice: '', communication_guidelines: '', employer_branding: '',
  why_work_here: '', strategic_recruitment_goals: '', care_types: [],
  words_to_use: [], words_to_avoid: [], creative_dos: [], creative_donts: [],
  visual_style_notes: '', internal_notes: '',
};

interface LocationItem { id?: string; name: string; city: string; region: string; recruitment_region: string; notes: string; }
interface RoleItem { id?: string; role_title: string; care_domain: string; description: string; qualifications: string[]; audience_triggers: string[]; audience_objections: string[]; }
interface AudienceItem { id?: string; segment_name: string; description: string; triggers: string[]; objections: string[]; }

const sectionIcons: Record<string, typeof Building2> = {
  org: Building2, locations: MapPin, care: Heart, roles: Users, usps: Star,
  strategy: Target, creative: Palette, uploads: FileUp, internal: MessageSquare,
};

function calculateScore(
  client: ClientInfo, profile: LearningProfile, fieldStatuses: FieldStatuses,
  locations: LocationItem[], roles: RoleItem[], audiences: AudienceItem[],
  usps: { usp_text: string }[], assetCount: number
): number {
  let score = 0;
  const total = 100;

  // 1. Organisation (15) - confirmed fields count more
  const orgFields = ['description', 'mission', 'vision', 'website_url'];
  const orgConfirmed = orgFields.filter(f => fieldStatuses[f] === 'confirmed' && (client as any)[f === 'website_url' ? 'website_url' : f]).length;
  const orgFilled = orgFields.filter(f => (client as any)[f === 'website_url' ? 'website_url' : f]?.trim()).length;
  score += orgConfirmed >= 3 ? 15 : orgFilled >= 3 ? 10 : orgFilled >= 1 ? 5 : 0;

  // 2. Locations (10)
  const locsConfirmed = fieldStatuses['locations'] === 'confirmed';
  score += locations.length >= 1 ? (locsConfirmed ? 10 : 7) : 0;

  // 3. Care types (10)
  const careConfirmed = fieldStatuses['care_types'] === 'confirmed';
  score += profile.care_types.length >= 1 ? (careConfirmed ? 10 : 7) : 0;

  // 4. Roles (15)
  const rolesConfirmed = fieldStatuses['roles'] === 'confirmed';
  score += roles.length >= 1 ? (rolesConfirmed ? 15 : 10) : 0;

  // 5. USPs (10)
  const uspsConfirmed = fieldStatuses['usps'] === 'confirmed';
  score += usps.filter(u => u.usp_text.trim()).length >= 2 ? (uspsConfirmed ? 10 : 7) : usps.length >= 1 ? 4 : 0;

  // 6. Strategy (15)
  const stratFields = [profile.strategic_recruitment_goals, profile.employer_branding, profile.why_work_here];
  const stratFilled = stratFields.filter(f => f?.trim()).length;
  const stratConfirmed = fieldStatuses['strategy'] === 'confirmed';
  score += stratFilled >= 2 ? (stratConfirmed ? 15 : 10) : stratFilled >= 1 ? 5 : 0;

  // 7. Brand / Tone (10)
  const brandFields = [profile.tone_of_voice, profile.communication_guidelines];
  const brandFilled = brandFields.filter(f => f?.trim()).length;
  const brandConfirmed = fieldStatuses['brand'] === 'confirmed';
  score += brandFilled >= 1 ? (brandConfirmed ? 10 : 7) : 0;

  // 8. Creative guidelines (10)
  const creativeFilled = profile.words_to_use.length + profile.words_to_avoid.length + profile.creative_dos.length + profile.creative_donts.length;
  score += creativeFilled >= 2 ? 10 : creativeFilled >= 1 ? 5 : 0;

  // 9. Assets (5)
  score += assetCount >= 1 ? 5 : 0;

  return Math.min(Math.round(score), 100);
}

export default function LearningTab({ clientId, onScoreChange }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [clientInfo, setClientInfo] = useState<ClientInfo>({ website_url: '', mission: '', vision: '', description: '' });
  const [profile, setProfile] = useState<LearningProfile>(emptyProfile);
  const [profileExists, setProfileExists] = useState(false);
  const [fieldStatuses, setFieldStatuses] = useState<FieldStatuses>({});
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);

  const [usps, setUsps] = useState<{ id?: string; usp_text: string }[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [audiences, setAudiences] = useState<AudienceItem[]>([]);
  const [assets, setAssets] = useState<{ id: string; file_name: string; asset_category: string; created_at: string; file_path: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  // Custom care type input
  const [careInput, setCareInput] = useState('');

  const loadData = useCallback(async () => {
    const [clientRes, profileRes, uspsRes, locRes, roleRes, audRes, assetRes] = await Promise.all([
      supabase.from('clients').select('website_url, mission, vision, description').eq('id', clientId).single(),
      supabase.from('client_learning_profiles').select('*').eq('client_id', clientId).single(),
      supabase.from('client_usps').select('*').eq('client_id', clientId).order('sort_order'),
      supabase.from('client_locations').select('*').eq('client_id', clientId),
      supabase.from('client_roles').select('*').eq('client_id', clientId),
      supabase.from('client_audience_insights').select('*').eq('client_id', clientId),
      supabase.from('client_learning_assets').select('id, file_name, asset_category, created_at, file_path').eq('client_id', clientId).order('created_at', { ascending: false }),
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
      const rawStatuses = profileRes.data.field_statuses;
      setFieldStatuses(
        rawStatuses && typeof rawStatuses === 'object' && !Array.isArray(rawStatuses)
          ? rawStatuses as FieldStatuses
          : {}
      );
      setAnalyzedAt(profileRes.data.website_analyzed_at || null);
    }

    setUsps((uspsRes.data || []).map(u => ({ id: u.id, usp_text: u.usp_text })));
    setLocations((locRes.data || []).map(l => ({
      id: l.id, name: l.name, city: l.city || '', region: l.region || '',
      recruitment_region: l.recruitment_region || '', notes: l.notes || '',
    })));
    setRoles((roleRes.data || []).map(r => ({
      id: r.id, role_title: r.role_title, care_domain: r.care_domain || '',
      description: r.description || '', qualifications: r.qualifications || [],
      audience_triggers: r.audience_triggers || [], audience_objections: r.audience_objections || [],
    })));
    setAudiences((audRes.data || []).map(a => ({
      id: a.id, segment_name: a.segment_name, description: a.description || '',
      triggers: a.triggers || [], objections: a.objections || [],
    })));
    setAssets(assetRes.data || []);
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const score = calculateScore(clientInfo, profile, fieldStatuses, locations, roles, audiences, usps, assets.length);
    onScoreChange(score);
  }, [clientInfo, profile, fieldStatuses, locations, roles, audiences, usps, assets, onScoreChange]);

  const setStatus = (field: string, status: FieldStatus) => {
    setFieldStatuses(prev => ({ ...prev, [field]: status }));
  };

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
      field_statuses: fieldStatuses,
    };

    if (profileExists) {
      await supabase.from('client_learning_profiles').update(profileData).eq('client_id', clientId);
    } else {
      await supabase.from('client_learning_profiles').insert(profileData);
      setProfileExists(true);
    }

    // Save USPs
    await supabase.from('client_usps').delete().eq('client_id', clientId);
    const uspInserts = usps.filter(u => u.usp_text.trim()).map((u, i) => ({
      client_id: clientId, usp_text: u.usp_text.trim(), sort_order: i,
    }));
    if (uspInserts.length) await supabase.from('client_usps').insert(uspInserts);

    // Save locations
    await supabase.from('client_locations').delete().eq('client_id', clientId);
    const locInserts = locations.filter(l => l.name.trim()).map(l => ({
      client_id: clientId, name: l.name.trim(), city: l.city || null,
      region: l.region || null, recruitment_region: l.recruitment_region || null, notes: l.notes || null,
    }));
    if (locInserts.length) await supabase.from('client_locations').insert(locInserts);

    // Save roles
    await supabase.from('client_roles').delete().eq('client_id', clientId);
    const roleInserts = roles.filter(r => r.role_title.trim()).map(r => ({
      client_id: clientId, role_title: r.role_title.trim(), care_domain: r.care_domain || null,
      description: r.description || null, qualifications: r.qualifications,
      audience_triggers: r.audience_triggers, audience_objections: r.audience_objections,
    }));
    if (roleInserts.length) await supabase.from('client_roles').insert(roleInserts);

    // Save audiences
    await supabase.from('client_audience_insights').delete().eq('client_id', clientId);
    const audInserts = audiences.filter(a => a.segment_name.trim()).map(a => ({
      client_id: clientId, segment_name: a.segment_name.trim(), description: a.description || null,
      triggers: a.triggers, objections: a.objections,
    }));
    if (audInserts.length) await supabase.from('client_audience_insights').insert(audInserts);

    toast({ title: 'Opgeslagen', description: 'Alle learning data is bijgewerkt.' });
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
      client_id: clientId, file_name: file.name, file_path: filePath,
      file_type: file.type, asset_category: category, uploaded_by: user?.id,
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
      care_types: p.care_types.includes(ct) ? p.care_types.filter(c => c !== ct) : [...p.care_types, ct],
    }));
  };

  const addCustomCareType = () => {
    const trimmed = careInput.trim();
    if (trimmed && !profile.care_types.includes(trimmed)) {
      setProfile(p => ({ ...p, care_types: [...p.care_types, trimmed] }));
      setCareInput('');
    }
  };

  const updateTagList = (field: keyof LearningProfile, value: string) => {
    const items = value.split(',').map(s => s.trim()).filter(Boolean);
    setProfile(p => ({ ...p, [field]: items }));
  };

  const handleRescan = async () => {
    if (!clientInfo.website_url) {
      toast({ title: 'Geen website URL', description: 'Vul eerst een website URL in.', variant: 'destructive' });
      return;
    }
    setRescanning(true);
    const { error } = await supabase.functions.invoke('analyze-website', {
      body: { client_id: clientId, website_url: clientInfo.website_url },
    });
    if (error) {
      toast({ title: 'Analyse mislukt', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Website opnieuw geanalyseerd', description: 'Learning velden zijn bijgewerkt.' });
      loadData();
    }
    setRescanning(false);
  };

  const score = calculateScore(clientInfo, profile, fieldStatuses, locations, roles, audiences, usps, assets.length);

  const SectionHeader = ({ field, label }: { field: string; label: string }) => (
    <div className="flex items-center gap-2">
      {label}
      {fieldStatuses[field] && <StatusBadge status={fieldStatuses[field]} onStatusChange={s => setStatus(field, s)} compact />}
      {!fieldStatuses[field] && score > 0 && null}
    </div>
  );

  return (
    <div className="p-8 max-w-4xl mx-auto animate-fade-in">
      {/* Score header — minimal */}
      <div className="mb-8 flex items-end justify-between gap-6">
        <div className="flex items-baseline gap-4">
          <span className={cn(
            'text-4xl font-semibold tracking-tight tabular-nums',
            score >= 80 ? 'text-success' :
            score >= 40 ? 'text-warning' :
            'text-muted-foreground'
          )}>
            {score}<span className="text-xl text-muted-foreground/60">%</span>
          </span>
          <div>
            <h2 className="text-base font-semibold text-foreground leading-tight">AI Training Book</h2>
            <p className="text-xs text-muted-foreground">
              {score >= 80 ? 'Getraind — voldoende context voor AI.' :
               score >= 40 ? 'In opbouw — bevestig meer secties.' :
               'Start met website analyse of vul handmatig in.'}
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 h-9 px-4 rounded-full glass glass-hover text-sm font-medium text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Save className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Opslaan
        </button>
      </div>

      {/* Website scan status — subtle inline */}
      {(analyzedAt || clientInfo.website_url) && (
        <div className="mb-6 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 min-w-0">
            <Globe className="h-3.5 w-3.5 shrink-0" />
            {analyzedAt ? (
              <span className="truncate">Geanalyseerd op {new Date(analyzedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            ) : (
              <span>Nog niet geanalyseerd</span>
            )}
          </div>
          <button
            onClick={handleRescan}
            disabled={rescanning || !clientInfo.website_url}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw className={cn("h-3 w-3", rescanning && "animate-spin")} />
            {rescanning ? 'Bezig...' : 'Opnieuw scannen'}
          </button>
        </div>
      )}

      <Accordion type="multiple" defaultValue={['org', 'care']} className="space-y-3">
        {/* 1. Organisatie */}
        <AccordionItem value="org" className="glass rounded-2xl border-0 px-4">
          <AccordionTrigger className="text-sm font-medium">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary/60" />
              <SectionHeader field="org" label="Algemene Organisatiegegevens" />
              {(clientInfo.website_url && clientInfo.description) && <Check className="h-3.5 w-3.5 text-success" />}
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Website URL</Label>
                <Input value={clientInfo.website_url} onChange={e => setClientInfo(p => ({ ...p, website_url: e.target.value }))} placeholder="https://..." className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Organisatienaam</Label>
                <Input disabled value="" placeholder="Wordt overgenomen uit client" className="h-9 text-sm bg-muted/50" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Omschrijving</Label>
                {fieldStatuses['description'] && <StatusBadge status={fieldStatuses['description']} onStatusChange={s => setStatus('description', s)} />}
              </div>
              <Textarea value={clientInfo.description} onChange={e => setClientInfo(p => ({ ...p, description: e.target.value }))} placeholder="Korte beschrijving van de organisatie" rows={2} className="text-sm" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Missie</Label>
                  {fieldStatuses['mission'] && <StatusBadge status={fieldStatuses['mission']} onStatusChange={s => setStatus('mission', s)} />}
                </div>
                <Textarea value={clientInfo.mission} onChange={e => setClientInfo(p => ({ ...p, mission: e.target.value }))} placeholder="Missie" rows={3} className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Visie</Label>
                  {fieldStatuses['vision'] && <StatusBadge status={fieldStatuses['vision']} onStatusChange={s => setStatus('vision', s)} />}
                </div>
                <Textarea value={clientInfo.vision} onChange={e => setClientInfo(p => ({ ...p, vision: e.target.value }))} placeholder="Visie" rows={3} className="text-sm" />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 2. Locaties */}
        <AccordionItem value="locations" className="glass rounded-2xl border-0 px-4">
          <AccordionTrigger className="text-sm font-medium">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary/60" />
              <SectionHeader field="locations" label="Locaties & Regio's" />
              {locations.length > 0 && <Badge variant="secondary" className="text-[10px] ml-1">{locations.length}</Badge>}
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-4">
            {locations.map((loc, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start">
                <Input value={loc.name} onChange={e => { const n = [...locations]; n[i] = { ...n[i], name: e.target.value }; setLocations(n); }} placeholder="Naam" className="h-8 text-xs" />
                <Input value={loc.city} onChange={e => { const n = [...locations]; n[i] = { ...n[i], city: e.target.value }; setLocations(n); }} placeholder="Stad" className="h-8 text-xs" />
                <Input value={loc.recruitment_region} onChange={e => { const n = [...locations]; n[i] = { ...n[i], recruitment_region: e.target.value }; setLocations(n); }} placeholder="Wervingsregio" className="h-8 text-xs" />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLocations(locations.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setLocations([...locations, { name: '', city: '', region: '', recruitment_region: '', notes: '' }])}>
              <Plus className="mr-1 h-3 w-3" /> Locatie toevoegen
            </Button>
          </AccordionContent>
        </AccordionItem>

        {/* 3. Zorgtypen */}
        <AccordionItem value="care" className="glass rounded-2xl border-0 px-4">
          <AccordionTrigger className="text-sm font-medium">
            <div className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-primary/60" />
              <SectionHeader field="care_types" label="Zorgtypen" />
              {profile.care_types.length > 0 && <Badge variant="secondary" className="text-[10px] ml-1">{profile.care_types.length}</Badge>}
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {allCareTypes.map(ct => (
                <button key={ct} type="button" onClick={() => toggleCareType(ct)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
                    profile.care_types.includes(ct)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                  )}>
                  {ct}
                </button>
              ))}
              {profile.care_types.filter(ct => !allCareTypes.includes(ct)).map(ct => (
                <button key={ct} type="button" onClick={() => toggleCareType(ct)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium border bg-primary text-primary-foreground border-primary flex items-center gap-1">
                  {ct} <X className="h-3 w-3" />
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={careInput} onChange={e => setCareInput(e.target.value)} placeholder="Ander zorgtype toevoegen" className="h-8 text-xs max-w-[220px]"
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomCareType())} />
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addCustomCareType}>Toevoegen</Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 4. Functies en Doelgroepen */}
        <AccordionItem value="roles" className="glass rounded-2xl border-0 px-4">
          <AccordionTrigger className="text-sm font-medium">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary/60" />
              <SectionHeader field="roles" label="Functies & Doelgroepen" />
              {roles.length > 0 && <Badge variant="secondary" className="text-[10px] ml-1">{roles.length}</Badge>}
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            {roles.map((role, i) => (
              <Card key={i} className="border-border/50">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="grid grid-cols-2 gap-2 flex-1">
                      <Input value={role.role_title} onChange={e => { const n = [...roles]; n[i] = { ...n[i], role_title: e.target.value }; setRoles(n); }} placeholder="Functietitel" className="h-8 text-xs font-medium" />
                      <Input value={role.care_domain} onChange={e => { const n = [...roles]; n[i] = { ...n[i], care_domain: e.target.value }; setRoles(n); }} placeholder="Zorgdomein" className="h-8 text-xs" />
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 ml-2" onClick={() => setRoles(roles.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                  <Textarea value={role.description} onChange={e => { const n = [...roles]; n[i] = { ...n[i], description: e.target.value }; setRoles(n); }} placeholder="Beschrijving, kwalificaties, doelgroep..." rows={2} className="text-xs" />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Triggers (komma-gescheiden)</Label>
                      <Input value={role.audience_triggers.join(', ')} onChange={e => { const n = [...roles]; n[i] = { ...n[i], audience_triggers: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }; setRoles(n); }} placeholder="Wat motiveert deze doelgroep?" className="h-7 text-[11px]" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Bezwaren (komma-gescheiden)</Label>
                      <Input value={role.audience_objections.join(', ')} onChange={e => { const n = [...roles]; n[i] = { ...n[i], audience_objections: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }; setRoles(n); }} placeholder="Wat houdt kandidaten tegen?" className="h-7 text-[11px]" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setRoles([...roles, { role_title: '', care_domain: '', description: '', qualifications: [], audience_triggers: [], audience_objections: [] }])}>
              <Plus className="mr-1 h-3 w-3" /> Functie toevoegen
            </Button>

            {/* Audiences */}
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs font-medium text-foreground mb-2">Doelgroepsegmenten</p>
              {audiences.map((aud, i) => (
                <div key={i} className="flex items-start gap-2 mb-2">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <Input value={aud.segment_name} onChange={e => { const n = [...audiences]; n[i] = { ...n[i], segment_name: e.target.value }; setAudiences(n); }} placeholder="Segment naam" className="h-8 text-xs" />
                    <Input value={aud.description} onChange={e => { const n = [...audiences]; n[i] = { ...n[i], description: e.target.value }; setAudiences(n); }} placeholder="Beschrijving" className="h-8 text-xs" />
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAudiences(audiences.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setAudiences([...audiences, { segment_name: '', description: '', triggers: [], objections: [] }])}>
                <Plus className="mr-1 h-3 w-3" /> Doelgroep toevoegen
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 5. USPs */}
        <AccordionItem value="usps" className="glass rounded-2xl border-0 px-4">
          <AccordionTrigger className="text-sm font-medium">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-primary/60" />
              <SectionHeader field="usps" label="USP's & Werkgeversverhaal" />
              {usps.length > 0 && <Badge variant="secondary" className="text-[10px] ml-1">{usps.length}</Badge>}
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="space-y-2">
              <Label className="text-xs">Belangrijkste USP's</Label>
              {usps.map((usp, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={usp.usp_text} onChange={e => { const n = [...usps]; n[i] = { ...n[i], usp_text: e.target.value }; setUsps(n); }} placeholder={`USP ${i + 1}`} className="h-8 text-sm" />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setUsps(usps.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setUsps([...usps, { usp_text: '' }])}>
                <Plus className="mr-1 h-3 w-3" /> USP toevoegen
              </Button>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Waarom hier werken?</Label>
                {fieldStatuses['why_work_here'] && <StatusBadge status={fieldStatuses['why_work_here']} onStatusChange={s => setStatus('why_work_here', s)} />}
              </div>
              <Textarea value={profile.why_work_here} onChange={e => setProfile(p => ({ ...p, why_work_here: e.target.value }))} placeholder="Redenen waarom kandidaten hier willen werken" rows={3} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Employer Branding</Label>
                {fieldStatuses['employer_branding'] && <StatusBadge status={fieldStatuses['employer_branding']} onStatusChange={s => setStatus('employer_branding', s)} />}
              </div>
              <Textarea value={profile.employer_branding} onChange={e => setProfile(p => ({ ...p, employer_branding: e.target.value }))} placeholder="Kernboodschap werkgeversmerk" rows={3} className="text-sm" />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 6. Recruitmentstrategie */}
        <AccordionItem value="strategy" className="glass rounded-2xl border-0 px-4">
          <AccordionTrigger className="text-sm font-medium">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary/60" />
              <SectionHeader field="strategy" label="Recruitmentstrategie" />
              {profile.strategic_recruitment_goals && <Check className="h-3.5 w-3.5 text-success" />}
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Strategische recruitmentdoelen</Label>
              <Textarea value={profile.strategic_recruitment_goals} onChange={e => setProfile(p => ({ ...p, strategic_recruitment_goals: e.target.value }))} placeholder="Wat zijn de belangrijkste wervingsdoelen?" rows={3} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Tone of Voice</Label>
                {fieldStatuses['tone_of_voice'] && <StatusBadge status={fieldStatuses['tone_of_voice']} onStatusChange={s => setStatus('tone_of_voice', s)} />}
              </div>
              <Textarea value={profile.tone_of_voice} onChange={e => setProfile(p => ({ ...p, tone_of_voice: e.target.value }))} placeholder="Warm, professioneel, direct..." rows={2} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Communicatierichtlijnen</Label>
              <Textarea value={profile.communication_guidelines} onChange={e => setProfile(p => ({ ...p, communication_guidelines: e.target.value }))} placeholder="Richtlijnen voor communicatie" rows={3} className="text-sm" />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 7. Creative richtlijnen */}
        <AccordionItem value="creative" className="glass rounded-2xl border-0 px-4">
          <AccordionTrigger className="text-sm font-medium">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary/60" />
              Creatieve Richtlijnen
              {(profile.words_to_use.length > 0 || profile.creative_dos.length > 0) && <Check className="h-3.5 w-3.5 text-success" />}
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Woorden om te gebruiken</Label>
                <Textarea value={profile.words_to_use.join(', ')} onChange={e => updateTagList('words_to_use', e.target.value)} placeholder="woord1, woord2, woord3" rows={2} className="text-xs" />
                <p className="text-[10px] text-muted-foreground">Komma-gescheiden</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Woorden om te vermijden</Label>
                <Textarea value={profile.words_to_avoid.join(', ')} onChange={e => updateTagList('words_to_avoid', e.target.value)} placeholder="woord1, woord2, woord3" rows={2} className="text-xs" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Do's voor creative</Label>
                <Textarea value={profile.creative_dos.join(', ')} onChange={e => updateTagList('creative_dos', e.target.value)} placeholder="do1, do2, do3" rows={2} className="text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Don'ts voor creative</Label>
                <Textarea value={profile.creative_donts.join(', ')} onChange={e => updateTagList('creative_donts', e.target.value)} placeholder="dont1, dont2, dont3" rows={2} className="text-xs" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Visuele stijlnotities</Label>
              <Textarea value={profile.visual_style_notes} onChange={e => setProfile(p => ({ ...p, visual_style_notes: e.target.value }))} placeholder="Kleurgebruik, fotostijl, etc." rows={2} className="text-xs" />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 8. Uploads */}
        <AccordionItem value="uploads" className="glass rounded-2xl border-0 px-4">
          <AccordionTrigger className="text-sm font-medium">
            <div className="flex items-center gap-2">
              <FileUp className="h-4 w-4 text-primary/60" />
              Uploads & Bronmateriaal
              {assets.length > 0 && <Badge variant="secondary" className="text-[10px] ml-1">{assets.length}</Badge>}
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {['brandbook', 'vacatures', 'statics', 'campagne_assets', 'documenten', 'overig'].map(cat => (
                <div key={cat}>
                  <Label className="text-[10px] capitalize mb-1 block">{cat.replace('_', ' ')}</Label>
                  <label className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed p-2.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors',
                    uploading && 'opacity-50 pointer-events-none'
                  )}>
                    <Upload className="h-3.5 w-3.5" />
                    Upload
                    <input type="file" className="hidden" onChange={e => handleFileUpload(e, cat)} />
                  </label>
                </div>
              ))}
            </div>
            {assets.length > 0 && (
              <div className="space-y-1.5 mt-3">
                <p className="text-xs font-medium text-muted-foreground">Geüploade bestanden</p>
                {assets.map(a => (
                  <div key={a.id} className="flex items-center justify-between rounded border px-3 py-2">
                    <div>
                      <p className="text-xs text-foreground">{a.file_name}</p>
                      <p className="text-[10px] text-muted-foreground">{a.asset_category} · {new Date(a.created_at).toLocaleDateString('nl-NL')}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteAsset(a.id, a.file_path)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* 9. Interne Eva Zorg inzichten */}
        <AccordionItem value="internal" className="glass rounded-2xl border-0 px-4">
          <AccordionTrigger className="text-sm font-medium">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary/60" />
              Interne Eva Zorg Inzichten
              {profile.internal_notes && <Check className="h-3.5 w-3.5 text-success" />}
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <Textarea
              value={profile.internal_notes}
              onChange={e => setProfile(p => ({ ...p, internal_notes: e.target.value }))}
              placeholder="Waarom is deze klant interessant? Commerciële kansen? Echte USP's die niet op de website staan? Wat recruiters/accountmanagers hebben gehoord? Belangrijke inzichten uit intakes?"
              rows={6}
              className="text-sm"
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
