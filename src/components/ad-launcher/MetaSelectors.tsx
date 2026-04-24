import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Loader2, ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MetaSelection {
  campaign_id: string;
  adset_id: string;
  lead_form_id: string;
  template_ad_id: string;
}

interface Props {
  nameFilter?: string | null;
  pageId?: string | null;
  value: MetaSelection;
  onChange: (v: MetaSelection) => void;
}

interface Item {
  id: string;
  name: string;
  status?: string | null;
  effective_status?: string | null;
  budget_type?: 'ABO' | 'CBO';
}

interface MetaFunctionResponse {
  data?: Item[];
  error?: string;
  fallback?: boolean;
}

function StatusDot({ status }: { status?: string | null }) {
  const s = status || '';
  const color =
    s === 'ACTIVE' ? 'bg-success'
    : s === 'PAUSED' ? 'bg-muted-foreground/50'
    : 'bg-destructive/70';
  return <span className={cn('h-2 w-2 rounded-full shrink-0', color)} />;
}

function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'active' | 'warn' }) {
  const cls = tone === 'active' ? 'bg-success/15 text-success border-success/30'
    : tone === 'warn' ? 'bg-amber-500/15 text-amber-700 border-amber-500/30'
    : 'bg-muted text-muted-foreground border-border';
  return (
    <span className={cn('text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border font-medium', cls)}>
      {label}
    </span>
  );
}

interface ComboboxProps {
  items: Item[];
  value: string;
  onSelect: (id: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  disabled?: boolean;
  loading?: boolean;
  showBudgetPill?: boolean;
}

function ResourceCombobox({
  items, value, onSelect, placeholder, searchPlaceholder, emptyText,
  disabled, loading, showBudgetPill,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal h-10"
        >
          <span className="flex items-center gap-2 min-w-0">
            {selected ? (
              <>
                <StatusDot status={selected.effective_status || selected.status} />
                <span className="truncate">{selected.name}</span>
                {showBudgetPill && selected.budget_type && (
                  <StatusPill label={selected.budget_type} />
                )}
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          {loading ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[320px]" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => {
                const status = item.effective_status || item.status || '';
                return (
                  <CommandItem
                    key={item.id}
                    value={`${item.name} ${item.id}`}
                    onSelect={() => {
                      onSelect(item.id);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <StatusDot status={status} />
                    <span className="flex-1 truncate">{item.name}</span>
                    {showBudgetPill && item.budget_type && (
                      <StatusPill label={item.budget_type} />
                    )}
                    {status && status !== 'ACTIVE' && (
                      <StatusPill label={status} tone={status === 'PAUSED' ? 'warn' : 'neutral'} />
                    )}
                    {value === item.id && <Check className="h-4 w-4 ml-1" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function MetaSelectors({ nameFilter, pageId, value, onChange }: Props) {
  const [campaigns, setCampaigns] = useState<Item[]>([]);
  const [adsets, setAdsets] = useState<Item[]>([]);
  const [leadForms, setLeadForms] = useState<Item[]>([]);
  const [templateAds, setTemplateAds] = useState<Item[]>([]);
  const [loadingC, setLoadingC] = useState(false);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingL, setLoadingL] = useState(false);
  const [loadingT, setLoadingT] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingC(true);
    setError(null);

    supabase.functions
      .invoke<MetaFunctionResponse>('meta-list-resources', {
        body: { resource: 'campaigns', name_filter: nameFilter || '' },
      })
      .then(({ data, error }) => {
        if (!active) return;
        setLoadingC(false);
        if (error || data?.error) {
          setCampaigns([]);
          setError(error?.message || data?.error || 'Campagnes konden niet geladen worden.');
          return;
        }
        const items = data?.data || [];
        setCampaigns(items);
        if (value.campaign_id && !items.some((item) => item.id === value.campaign_id)) {
          onChange({ ...value, campaign_id: '', adset_id: '' });
        }
      });

    return () => { active = false; };
  }, [nameFilter]);

  useEffect(() => {
    let active = true;
    if (!value.campaign_id) {
      setAdsets([]);
      return () => { active = false; };
    }
    setLoadingA(true);
    setError(null);

    supabase.functions
      .invoke<MetaFunctionResponse>('meta-list-resources', {
        body: { resource: 'adsets', campaign_id: value.campaign_id },
      })
      .then(({ data, error }) => {
        if (!active) return;
        setLoadingA(false);
        if (error || data?.error) {
          setAdsets([]);
          setError(error?.message || data?.error || 'Ad sets konden niet geladen worden.');
          return;
        }
        const items = data?.data || [];
        setAdsets(items);
        if (value.adset_id && !items.some((item) => item.id === value.adset_id)) {
          onChange({ ...value, adset_id: '' });
        }
      });

    return () => { active = false; };
  }, [value.campaign_id]);

  useEffect(() => {
    let active = true;
    if (!pageId) {
      setLeadForms([]);
      return () => { active = false; };
    }
    setLoadingL(true);
    setError(null);

    supabase.functions
      .invoke<MetaFunctionResponse>('meta-list-resources', {
        body: { resource: 'leadforms', page_id: pageId },
      })
      .then(({ data, error }) => {
        if (!active) return;
        setLoadingL(false);
        if (error || data?.error) {
          setLeadForms([]);
          setError(error?.message || data?.error || 'Lead formulieren konden niet geladen worden.');
          return;
        }
        const items = data?.data || [];
        setLeadForms(items);
        if (value.lead_form_id && !items.some((item) => item.id === value.lead_form_id)) {
          onChange({ ...value, lead_form_id: '' });
        }
      });

    return () => { active = false; };
  }, [pageId]);

  // Load template ads inside the chosen ad set, so we can clone a working creative.
  useEffect(() => {
    let active = true;
    if (!value.adset_id) {
      setTemplateAds([]);
      return () => { active = false; };
    }
    setLoadingT(true);
    supabase.functions
      .invoke<MetaFunctionResponse>('meta-list-resources', {
        body: { resource: 'template_ads', adset_id: value.adset_id },
      })
      .then(({ data, error }) => {
        if (!active) return;
        setLoadingT(false);
        if (error || data?.error) {
          setTemplateAds([]);
          return;
        }
        const items = data?.data || [];
        setTemplateAds(items);
        if (value.template_ad_id && !items.some((item) => item.id === value.template_ad_id)) {
          onChange({ ...value, template_ad_id: '' });
        }
      });
    return () => { active = false; };
  }, [value.adset_id]);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Campagne</Label>
        <ResourceCombobox
          items={campaigns}
          value={value.campaign_id}
          onSelect={(id) => onChange({ ...value, campaign_id: id, adset_id: '' })}
          placeholder="Kies campagne"
          searchPlaceholder="Zoek campagne..."
          emptyText="Geen campagnes gevonden"
          loading={loadingC}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Ad set</Label>
        <ResourceCombobox
          items={adsets}
          value={value.adset_id}
          onSelect={(id) => onChange({ ...value, adset_id: id, template_ad_id: '' })}
          placeholder={value.campaign_id ? 'Kies ad set' : 'Eerst campagne'}
          searchPlaceholder="Zoek ad set..."
          emptyText="Geen ad sets gevonden"
          loading={loadingA}
          disabled={!value.campaign_id}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Template advertentie <span className="text-muted-foreground/70 normal-case">(aanbevolen — kloont werkende creative)</span>
        </Label>
        <ResourceCombobox
          items={templateAds}
          value={value.template_ad_id}
          onSelect={(id) => onChange({ ...value, template_ad_id: id })}
          placeholder={value.adset_id ? (templateAds.length ? 'Kies bestaande ad als template' : 'Geen ads in deze ad set') : 'Eerst ad set'}
          searchPlaceholder="Zoek advertentie..."
          emptyText="Geen advertenties gevonden"
          loading={loadingT}
          disabled={!value.adset_id || templateAds.length === 0}
        />
        <p className="text-[11px] text-muted-foreground">
          Optioneel maar sterk aanbevolen: nieuwe ads erven dan placement-, profiel- en enhancement-instellingen van deze advertentie.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Lead formulier</Label>
        <ResourceCombobox
          items={leadForms}
          value={value.lead_form_id}
          onSelect={(id) => onChange({ ...value, lead_form_id: id })}
          placeholder={pageId ? 'Kies formulier' : 'Geen Page ID ingesteld'}
          searchPlaceholder="Zoek formulier..."
          emptyText="Geen lead formulieren gevonden"
          loading={loadingL}
          disabled={!pageId}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
