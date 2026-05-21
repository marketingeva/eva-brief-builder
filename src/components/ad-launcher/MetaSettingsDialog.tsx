import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronsUpDown, Check, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  clientName: string;
  onSaved?: () => void;
}

interface IgAccount {
  id: string;
  actorId?: string | null;
  businessId?: string | null;
  name: string;
  source?: string;
}

export default function MetaSettingsDialog({ open, onOpenChange, clientId, clientName, onSaved }: Props) {
  const [filter, setFilter] = useState('');
  const [pageId, setPageId] = useState('');
  const [igId, setIgId] = useState('');
  const [igAccounts, setIgAccounts] = useState<IgAccount[]>([]);
  const [igLoading, setIgLoading] = useState(false);
  const [igError, setIgError] = useState<string | null>(null);
  const [igOpen, setIgOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !clientId) return;
    setLoading(true);
    supabase
      .from('clients')
      .select('meta_name_filter, meta_page_id, meta_instagram_account_id')
      .eq('id', clientId)
      .maybeSingle()
      .then(({ data }) => {
        setFilter(data?.meta_name_filter ?? '');
        setPageId(data?.meta_page_id ?? '');
        setIgId(data?.meta_instagram_account_id ?? '');
        setLoading(false);
      });
  }, [open, clientId]);

  const fetchIgAccounts = async (pid: string) => {
    if (!pid.trim()) {
      setIgAccounts([]);
      return;
    }
    setIgLoading(true);
    setIgError(null);
    const { data, error } = await supabase.functions.invoke<{ data?: IgAccount[]; error?: string }>(
      'meta-list-resources',
      { body: { resource: 'instagram_accounts', page_id: pid.trim(), instagram_account_id: igId.trim() || null } },
    );
    setIgLoading(false);
    if (error || data?.error) {
      setIgError(error?.message || data?.error || 'Kon Instagram-accounts niet ophalen.');
      setIgAccounts([]);
      return;
    }
    const accounts = data?.data || [];
    setIgAccounts(accounts);
    // Als opgeslagen IG ID niet in de lijst zit, en lijst heeft 1 entry: auto-selecteer.
    if (accounts.length === 1 && !igId) setIgId(accounts[0].id);
  };

  useEffect(() => {
    if (!open) return;
    fetchIgAccounts(pageId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pageId]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('clients')
      .update({
        meta_name_filter: filter.trim() || null,
        meta_page_id: pageId.trim() || null,
        meta_instagram_account_id: igId.trim() || null,
      })
      .eq('id', clientId);
    setSaving(false);
    if (error) {
      toast.error('Opslaan mislukt: ' + error.message);
      return;
    }
    toast.success('Meta-instellingen opgeslagen');
    onSaved?.();
    onOpenChange(false);
  };

  const selectedIg = igAccounts.find((a) => a.id === igId || a.actorId === igId || a.businessId === igId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Meta-instellingen — {clientName}</DialogTitle>
          <DialogDescription>
            Configureer welke campagnes en lead-formulieren bij deze klant horen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="filter">Naam-filter</Label>
            <Input
              id="filter"
              placeholder='Bijv. "Rivas", "MF" of "WIJdezorg"'
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Alleen Meta-campagnes/ad sets/lead forms waarvan de naam deze tekst bevat worden getoond. Hoofdletterongevoelig.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pageId">Facebook Page ID</Label>
            <Input
              id="pageId"
              placeholder="123456789012345"
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Page ID waaronder de lead-formulieren hangen. Te vinden in Meta Business Manager → Pages → About → Page ID.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Instagram-profiel</Label>
              <button
                type="button"
                onClick={() => fetchIgAccounts(pageId)}
                disabled={!pageId || igLoading}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-50"
              >
                {igLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Verversen
              </button>
            </div>

            {!manual ? (
              <>
                <Popover open={igOpen} onOpenChange={setIgOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      disabled={!pageId || igLoading}
                      className="w-full justify-between font-normal h-10"
                    >
                      <span className="truncate">
                        {selectedIg
                          ? `@${selectedIg.name} (${selectedIg.businessId || selectedIg.id})`
                          : igId
                          ? `ID ${igId}`
                          : pageId
                          ? 'Kies Instagram-profiel'
                          : 'Eerst Page ID invoeren'}
                      </span>
                      {igLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      ) : (
                        <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[320px]" align="start">
                    <Command>
                      <CommandInput placeholder="Zoek Instagram-account..." />
                      <CommandList>
                        <CommandEmpty>
                          {igError || 'Geen Instagram-accounts gevonden voor deze Page.'}
                        </CommandEmpty>
                        <CommandGroup>
                          {igAccounts.map((a) => (
                            <CommandItem
                              key={a.id}
                              value={`${a.name} ${a.id} ${a.actorId || ''} ${a.businessId || ''}`}
                              onSelect={() => {
                                setIgId(a.id);
                                setIgOpen(false);
                              }}
                              className="flex items-center gap-2"
                            >
                              <span className="flex-1 truncate">
                                @{a.name}
                                <span className="text-muted-foreground">
                                  {' '}· IG {a.businessId || a.id}{a.actorId ? ` · actor ${a.actorId}` : ''}
                                </span>
                              </span>
                              {(igId === a.id || igId === a.actorId || igId === a.businessId) && <Check className="h-4 w-4" />}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Het Instagram-profiel dat aan de Page is gekoppeld; de app gebruikt intern zowel Business ID als actor ID.
                  </p>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                    onClick={() => setManual(true)}
                  >
                    Handmatig invoeren
                  </button>
                </div>
                {igError && <p className="text-xs text-destructive">{igError}</p>}
              </>
            ) : (
              <>
                <Input
                  placeholder="17841400000000000"
                  value={igId}
                  onChange={(e) => setIgId(e.target.value)}
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Handmatige fallback. Zowel de Instagram Business ID (<code>1784…</code>) als actor ID wordt automatisch gematcht.
                  </p>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                    onClick={() => setManual(false)}
                  >
                    Terug naar lijst
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Opslaan...' : 'Opslaan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
