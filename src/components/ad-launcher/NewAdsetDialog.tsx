import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  Loader2, Search, X, MapPin, CalendarIcon, Target, Wallet,
  Users, FileText, CheckCircle2, Info,
} from 'lucide-react';

interface Campaign { id: string; name: string }
interface LeadForm { id: string; name: string }

interface LocationItem {
  key: string;
  name: string;
  type: string;
  region?: string;
  country_code?: string;
  country_name?: string;
  primary_city?: string;
  radius?: number;
  distance_unit?: 'kilometer' | 'mile';
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientId: string;
  clientName?: string;
  pageId: string | null;
  nameFilter: string | null;
  initialCampaignId?: string;
  onCreated: (adsetId: string, name: string, campaignId: string) => void;
}

const PERFORMANCE_GOALS = [
  { value: 'LEAD_GENERATION', label: 'Maximaal aantal leads' },
  { value: 'OFFSITE_CONVERSIONS', label: 'Maximaal aantal conversie-leads' },
  { value: 'QUALITY_LEAD', label: 'Maximaal aantal kwaliteits-leads' },
  { value: 'REACH', label: 'Bereik' },
  { value: 'IMPRESSIONS', label: 'Impressies' },
  { value: 'LINK_CLICKS', label: 'Link clicks' },
];

const BILLING_EVENTS = [
  { value: 'IMPRESSIONS', label: 'Per impressie (CPM)' },
  { value: 'LINK_CLICKS', label: 'Per link click (CPC)' },
];

const GENDER_OPTIONS = [
  { value: 'all', label: 'Alle' },
  { value: 'male', label: 'Mannen' },
  { value: 'female', label: 'Vrouwen' },
];

export default function NewAdsetDialog({
  open, onOpenChange, clientId, clientName, pageId, nameFilter,
  initialCampaignId, onCreated,
}: Props) {
  const { toast } = useToast();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leadForms, setLeadForms] = useState<LeadForm[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingForms, setLoadingForms] = useState(false);

  const [campaignId, setCampaignId] = useState(initialCampaignId || '');
  const [name, setName] = useState('');
  const [leadFormId, setLeadFormId] = useState('');

  const [optimizationGoal, setOptimizationGoal] = useState('LEAD_GENERATION');
  const [billingEvent, setBillingEvent] = useState('IMPRESSIONS');

  const [dailyBudget, setDailyBudget] = useState('20');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(65);
  const [gender, setGender] = useState<'all' | 'male' | 'female'>('all');

  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResults, setLocationResults] = useState<LocationItem[]>([]);
  const [searchingLocations, setSearchingLocations] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setCampaignId(initialCampaignId || '');
    setName('');
    setLeadFormId('');
    setOptimizationGoal('LEAD_GENERATION');
    setBillingEvent('IMPRESSIONS');
    setDailyBudget('20');
    setStartDate(undefined);
    setEndDate(undefined);
    setAgeMin(18);
    setAgeMax(65);
    setGender('all');
    setLocations([]);
    setLocationQuery('');
    setLocationResults([]);
  }, [open, initialCampaignId]);

  // Load campaigns
  useEffect(() => {
    if (!open) return;
    setLoadingCampaigns(true);
    supabase.functions.invoke('meta-list-resources', {
      body: { resource: 'campaigns', name_filter: nameFilter || '' },
    }).then(({ data, error }) => {
      setLoadingCampaigns(false);
      if (error || data?.error) {
        toast({ title: 'Fout', description: error?.message || data?.error, variant: 'destructive' });
        return;
      }
      setCampaigns(data?.data || []);
    });
  }, [open, nameFilter]);

  // Load lead forms when page set
  useEffect(() => {
    if (!open || !pageId) return;
    setLoadingForms(true);
    supabase.functions.invoke('meta-list-resources', {
      body: { resource: 'leadforms', page_id: pageId },
    }).then(({ data, error }) => {
      setLoadingForms(false);
      if (error || data?.error) return;
      setLeadForms(data?.data || []);
    });
  }, [open, pageId]);

  // Location search (debounced)
  useEffect(() => {
    if (!locationQuery || locationQuery.length < 2) {
      setLocationResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearchingLocations(true);
      const { data, error } = await supabase.functions.invoke('meta-list-resources', {
        body: { resource: 'location_search', query: locationQuery, country_code: 'NL' },
      });
      setSearchingLocations(false);
      if (error || data?.error) return;
      setLocationResults(data?.data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [locationQuery]);

  const addLocation = (loc: LocationItem) => {
    if (locations.some((l) => l.key === loc.key)) return;
    setLocations((prev) => [...prev, { ...loc, radius: loc.type === 'city' || loc.type === 'subcity' || loc.type === 'neighborhood' ? 17 : undefined, distance_unit: 'kilometer' }]);
    setLocationQuery('');
    setLocationResults([]);
    setLocationOpen(false);
  };

  const updateRadius = (key: string, radius: number) => {
    setLocations((prev) => prev.map((l) => l.key === key ? { ...l, radius } : l));
  };

  const removeLocation = (key: string) => {
    setLocations((prev) => prev.filter((l) => l.key !== key));
  };

  const canSubmit = useMemo(() => {
    return Boolean(
      campaignId && name.trim() && leadFormId && pageId &&
      Number(dailyBudget) >= 1 && locations.length > 0,
    );
  }, [campaignId, name, leadFormId, pageId, dailyBudget, locations]);

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    const cities = locations.filter((l) => l.type === 'city' || l.type === 'subcity' || l.type === 'neighborhood')
      .map((l) => ({ key: l.key, type: l.type, radius: l.radius ?? 17, distance_unit: 'kilometer' as const }));
    const regions = locations.filter((l) => l.type === 'region')
      .map((l) => ({ key: l.key, type: l.type }));

    const genders = gender === 'all' ? [] : gender === 'male' ? [1] : [2];

    const payload = {
      campaign_id: campaignId,
      name: name.trim(),
      page_id: pageId!,
      lead_form_id: leadFormId,
      daily_budget_eur: Number(dailyBudget),
      start_time: startDate ? startDate.toISOString() : null,
      end_time: endDate ? endDate.toISOString() : null,
      age_min: ageMin,
      age_max: ageMax,
      genders,
      countries: cities.length === 0 && regions.length === 0 ? ['NL'] : undefined,
      cities,
      regions,
      optimization_goal: optimizationGoal,
      billing_event: billingEvent,
      status: 'PAUSED' as const,
    };

    const { data, error } = await supabase.functions.invoke('meta-create-adset', { body: payload });
    setSubmitting(false);

    if (error || data?.error) {
      toast({
        title: 'Ad set aanmaken mislukt',
        description: error?.message || data?.error || 'Onbekende fout',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Ad set aangemaakt',
      description: `${data.name} is gepauzeerd aangemaakt in Meta.`,
    });
    onCreated(data.id, data.name, campaignId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Target className="h-4 w-4" />
            </div>
            Nieuwe ad set
          </DialogTitle>
          <DialogDescription>
            Maakt een nieuwe ad set aan in Meta {clientName ? `voor ${clientName}` : ''}. De ad set wordt <strong>gepauzeerd</strong> aangemaakt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Section: Basis */}
          <section className="space-y-4">
            <SectionHeader icon={<FileText className="h-3.5 w-3.5" />} title="Basis" />

            <Field label="Campagne" required>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingCampaigns ? 'Laden...' : 'Kies een campagne'} />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Naam ad set" required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Bijv. Verpleegkundigen — Gorinchem 17km"
              />
            </Field>
          </section>

          {/* Section: Doel */}
          <section className="space-y-4">
            <SectionHeader icon={<Target className="h-3.5 w-3.5" />} title="Performance & doel" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Performance goal">
                <Select value={optimizationGoal} onValueChange={setOptimizationGoal}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERFORMANCE_GOALS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Billing event">
                <Select value={billingEvent} onValueChange={setBillingEvent}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BILLING_EVENTS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Conversion location">
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/30 text-sm">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Instant forms (lead formulier)
              </div>
            </Field>

            <Field label="Lead formulier" required>
              <Select value={leadFormId} onValueChange={setLeadFormId} disabled={!pageId}>
                <SelectTrigger>
                  <SelectValue placeholder={
                    !pageId ? 'Geen Page ID ingesteld' :
                    loadingForms ? 'Laden...' :
                    'Kies lead formulier'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {leadForms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </section>

          {/* Section: Budget */}
          <section className="space-y-4">
            <SectionHeader icon={<Wallet className="h-3.5 w-3.5" />} title="Budget & schema" />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Dagbudget (€)" required>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={dailyBudget}
                    onChange={(e) => setDailyBudget(e.target.value)}
                    className="pl-7"
                  />
                </div>
              </Field>

              <Field label="Startdatum">
                <DatePickerField date={startDate} onChange={setStartDate} placeholder="Direct" />
              </Field>

              <Field label="Einddatum">
                <DatePickerField date={endDate} onChange={setEndDate} placeholder="Doorlopend" />
              </Field>
            </div>

            {Number(dailyBudget) > 0 && (
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                Gemiddeld €{Number(dailyBudget).toFixed(2)} per dag. Wekelijks max ±€{(Number(dailyBudget) * 7).toFixed(2)}.
              </p>
            )}
          </section>

          {/* Section: Doelgroep */}
          <section className="space-y-4">
            <SectionHeader icon={<Users className="h-3.5 w-3.5" />} title="Doelgroep" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={`Leeftijd: ${ageMin} – ${ageMax === 65 ? '65+' : ageMax}`}>
                <div className="px-1 pt-2">
                  <Slider
                    min={13}
                    max={65}
                    step={1}
                    value={[ageMin, ageMax]}
                    onValueChange={(v) => { setAgeMin(v[0]); setAgeMax(v[1]); }}
                  />
                </div>
              </Field>

              <Field label="Geslacht">
                <Select value={gender} onValueChange={(v) => setGender(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </section>

          {/* Section: Locaties */}
          <section className="space-y-4">
            <SectionHeader icon={<MapPin className="h-3.5 w-3.5" />} title="Locaties" required />

            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="px-4 py-3 bg-muted/30 border-b flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nederland</span>
                <span className="text-xs text-muted-foreground">{locations.length} {locations.length === 1 ? 'locatie' : 'locaties'}</span>
              </div>

              <div className="p-4 space-y-3">
                {locations.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nog geen locaties. Zoek hieronder een stad of regio.
                  </p>
                )}

                {locations.map((loc) => (
                  <div key={loc.key} className="flex items-center gap-3 p-3 rounded-md border bg-background">
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {loc.name}
                        {loc.region && <span className="text-muted-foreground font-normal">, {loc.region}</span>}
                      </p>
                      <p className="text-[11px] text-muted-foreground capitalize">{loc.type}</p>
                    </div>
                    {(loc.type === 'city' || loc.type === 'subcity' || loc.type === 'neighborhood') && (
                      <div className="flex items-center gap-2 w-44">
                        <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">+{loc.radius}km</span>
                        <Slider
                          min={1}
                          max={80}
                          step={1}
                          value={[loc.radius ?? 17]}
                          onValueChange={(v) => updateRadius(loc.key, v[0])}
                          className="flex-1"
                        />
                      </div>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLocation(loc.key)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}

                <Popover open={locationOpen} onOpenChange={setLocationOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md border border-dashed text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
                    >
                      <Search className="h-4 w-4" />
                      Zoek locaties...
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                    <div className="p-2 border-b">
                      <Input
                        autoFocus
                        placeholder="Bijv. Gorinchem, Utrecht, Zuid-Holland..."
                        value={locationQuery}
                        onChange={(e) => setLocationQuery(e.target.value)}
                      />
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {searchingLocations && (
                        <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Zoeken...
                        </div>
                      )}
                      {!searchingLocations && locationQuery.length >= 2 && locationResults.length === 0 && (
                        <p className="p-3 text-sm text-muted-foreground">Geen resultaten</p>
                      )}
                      {locationResults.map((r) => (
                        <button
                          key={r.key}
                          type="button"
                          onClick={() => addLocation(r)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted text-sm"
                        >
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate">
                            {r.name}
                            {r.region && <span className="text-muted-foreground">, {r.region}</span>}
                          </span>
                          <span className="text-[10px] uppercase text-muted-foreground">{r.type}</span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuleren
          </Button>
          <Button onClick={submit} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Ad set aanmaken (gepauzeerd)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionHeader({ icon, title, required }: { icon: React.ReactNode; title: string; required?: boolean }) {
  return (
    <div className="flex items-center gap-2 pb-1 border-b">
      <span className="h-6 w-6 rounded-md bg-primary/10 text-primary flex items-center justify-center">{icon}</span>
      <h3 className="text-sm font-semibold">{title}</h3>
      {required && <span className="text-[10px] uppercase tracking-wide text-destructive">verplicht</span>}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function DatePickerField({ date, onChange, placeholder }: { date?: Date; onChange: (d?: Date) => void; placeholder: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('w-full justify-start font-normal h-10', !date && 'text-muted-foreground')}
        >
          <CalendarIcon className="h-4 w-4 mr-2" />
          {date ? format(date, 'd MMM yyyy') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onChange}
          initialFocus
          className={cn('p-3 pointer-events-auto')}
        />
        {date && (
          <div className="p-2 border-t">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange(undefined)}>Wissen</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
