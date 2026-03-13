import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, X, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  onGenerated: () => void;
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

const careTypes = ['thuiszorg', 'revalidatie', 'verpleeghuis', 'flexpool', 'intramuraal', 'PG', 'somatiek'];
const employmentTypes = ['loondienst', 'zzp', 'interim', 'detachering'];
const styleOptions = ['acuut', 'warm', 'enkel header', 'veel USPs', 'premium', 'employer brand'];
const ctaOptions = ['Maak telefonisch kennis', 'Kom langs', 'Schrijf je in', 'Solliciteer direct', 'Plan een gesprek'];
const creativeTypes = ['static', 'video', 'both'];
const requestTypes = ['one_vacancy', 'batch', 'recurring'];
const hoursTypes = ['fulltime', 'parttime', 'flexible', 'oproep'];

export default function NewBriefingDialog({ open, onOpenChange, clientId, clientName, onGenerated }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);

  // Form state
  const [functions, setFunctions] = useState<string[]>([]);
  const [funcInput, setFuncInput] = useState('');
  const [location, setLocation] = useState('');
  const [hoursType, setHoursType] = useState('flexible');
  const [employmentType, setEmploymentType] = useState('loondienst');
  const [targetAudience, setTargetAudience] = useState('');
  const [careType, setCareType] = useState('');
  const [cta, setCta] = useState('');
  const [usps, setUsps] = useState('');
  const [numVariations, setNumVariations] = useState(1);
  const [style, setStyle] = useState('warm');
  const [requestType, setRequestType] = useState('one_vacancy');
  const [creativeType, setCreativeType] = useState('static');
  const [priority, setPriority] = useState('balanced');
  const [extraNotes, setExtraNotes] = useState('');
  const [hardRequirements, setHardRequirements] = useState('');
  const [wordsToAvoid, setWordsToAvoid] = useState('');
  const [isNewConcept, setIsNewConcept] = useState(true);

  const addFunction = () => {
    const trimmed = funcInput.trim();
    if (trimmed && !functions.includes(trimmed)) {
      setFunctions([...functions, trimmed]);
      setFuncInput('');
    }
  };

  const removeFunction = (f: string) => setFunctions(functions.filter(x => x !== f));

  const handleSubmit = async () => {
    if (!user) return;
    if (functions.length === 0) {
      toast({ title: 'Vul minimaal één functie in', variant: 'destructive' });
      return;
    }

    setGenerating(true);
    try {
      const weekNumber = getWeekNumber(new Date());

      // 1. Create briefing request
      const { data: request, error: reqErr } = await supabase
        .from('briefing_requests')
        .insert({
          client_id: clientId,
          created_by: user.id,
          functions,
          location: location || null,
          hours_type: hoursType,
          employment_type: employmentType,
          target_audience: targetAudience || null,
          care_type: careType === 'none' ? null : careType || null,
          cta: cta === 'none' ? null : cta || null,
          usps: usps || null,
          num_variations: numVariations,
          style: style || null,
          request_type: requestType,
          creative_type: creativeType,
          priority,
          extra_notes: extraNotes || null,
          hard_requirements: hardRequirements || null,
          words_to_avoid: wordsToAvoid || null,
          is_new_concept: isNewConcept,
          week_number: weekNumber,
          status: 'generating',
        })
        .select('id')
        .single();

      if (reqErr) throw reqErr;

      // 2. Call AI generator
      const { data: aiResult, error: aiErr } = await supabase.functions.invoke('generate-briefing', {
        body: { briefing_request_id: request.id },
      });

      if (aiErr) throw aiErr;

      // 3. Update status
      await supabase
        .from('briefing_requests')
        .update({ status: 'generated' })
        .eq('id', request.id);

      toast({ title: 'Briefing gegenereerd!', description: `${functions.join(', ')} — Week ${weekNumber}` });
      onGenerated();
      onOpenChange(false);
      resetForm();
    } catch (e: any) {
      console.error('Briefing generation error:', e);
      toast({ title: 'Generatie mislukt', description: e.message || 'Probeer het opnieuw', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const resetForm = () => {
    setFunctions([]);
    setFuncInput('');
    setLocation('');
    setHoursType('flexible');
    setEmploymentType('loondienst');
    setTargetAudience('');
    setCareType('');
    setCta('');
    setUsps('');
    setNumVariations(1);
    setStyle('warm');
    setRequestType('one_vacancy');
    setCreativeType('static');
    setPriority('balanced');
    setExtraNotes('');
    setHardRequirements('');
    setWordsToAvoid('');
    setIsNewConcept(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Nieuw content briefing — {clientName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Section 1: Core */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Vacature & Doelgroep</h3>

            {/* Functions */}
            <div className="space-y-2">
              <Label className="text-xs">Functie(s) *</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="bijv. Verzorgende IG"
                  value={funcInput}
                  onChange={e => setFuncInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addFunction())}
                  className="h-9 text-sm"
                />
                <Button type="button" variant="outline" size="sm" onClick={addFunction} className="h-9">
                  Toevoegen
                </Button>
              </div>
              {functions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {functions.map(f => (
                    <Badge key={f} variant="secondary" className="text-xs gap-1">
                      {f}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => removeFunction(f)} />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Location + Hours */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Locatie</Label>
                <Input placeholder="bijv. Amsterdam" value={location} onChange={e => setLocation(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Uren</Label>
                <Select value={hoursType} onValueChange={setHoursType}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {hoursTypes.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Employment + Care type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Dienstverband</Label>
                <Select value={employmentType} onValueChange={setEmploymentType}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {employmentTypes.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Zorgtype</Label>
                <Select value={careType} onValueChange={setCareType}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Niet gespecificeerd</SelectItem>
                    {careTypes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Target audience */}
            <div className="space-y-1.5">
              <Label className="text-xs">Doelgroep</Label>
              <Input placeholder="bijv. Herintreders, 35-50 jaar" value={targetAudience} onChange={e => setTargetAudience(e.target.value)} className="h-9 text-sm" />
            </div>
          </section>

          {/* Section 2: Creative direction */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Creative Richting</h3>

            {/* Style + CTA */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Stijl</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {styleOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CTA</Label>
                <Select value={cta} onValueChange={setCta}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Niet gespecificeerd</SelectItem>
                    {ctaOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* USPs */}
            <div className="space-y-1.5">
              <Label className="text-xs">Belangrijkste USP's voor dit briefing</Label>
              <Textarea placeholder="bijv. Reiskostenvergoeding, Klein team, Geen nachtdiensten" value={usps} onChange={e => setUsps(e.target.value)} className="text-sm min-h-[60px]" />
            </div>

            {/* Type + Creative format */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Request type</Label>
                <Select value={requestType} onValueChange={setRequestType}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {requestTypes.map(r => (
                      <SelectItem key={r} value={r}>
                        {r === 'one_vacancy' ? 'Eén vacature' : r === 'batch' ? 'Batch' : 'Terugkerend'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Creative type</Label>
                <Select value={creativeType} onValueChange={setCreativeType}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {creativeTypes.map(c => (
                      <SelectItem key={c} value={c}>{c === 'both' ? 'Static + Video' : c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Aantal variaties</Label>
                <Input type="number" min={1} max={10} value={numVariations} onChange={e => setNumVariations(Number(e.target.value))} className="h-9 text-sm" />
              </div>
            </div>

            {/* New concept toggle */}
            <div className="flex items-center gap-3">
              <Switch checked={isNewConcept} onCheckedChange={setIsNewConcept} />
              <Label className="text-xs">{isNewConcept ? 'Nieuw concept' : 'Remake van bestaand'}</Label>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <Label className="text-xs">Prioriteit: snelheid vs. originaliteit</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="speed">Snelheid — snel produceren</SelectItem>
                  <SelectItem value="balanced">Gebalanceerd</SelectItem>
                  <SelectItem value="originality">Originaliteit — meer tijd voor uniek concept</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* Section 3: Extra */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Extra Instructies</h3>

            <div className="space-y-1.5">
              <Label className="text-xs">Harde eisen voor ontwerp</Label>
              <Textarea placeholder="bijv. Logo linksboven, geen stock foto's" value={hardRequirements} onChange={e => setHardRequirements(e.target.value)} className="text-sm min-h-[50px]" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Woorden of invalshoeken om te vermijden</Label>
              <Input placeholder="bijv. 'dynamisch', 'uniek'" value={wordsToAvoid} onChange={e => setWordsToAvoid(e.target.value)} className="h-9 text-sm" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Interne notities</Label>
              <Textarea placeholder="Eventuele extra opmerkingen voor het team" value={extraNotes} onChange={e => setExtraNotes(e.target.value)} className="text-sm min-h-[50px]" />
            </div>
          </section>

          {/* Submit */}
          <Button onClick={handleSubmit} disabled={generating || functions.length === 0} className="w-full h-11">
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                AI genereert briefing...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Genereer briefing
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
