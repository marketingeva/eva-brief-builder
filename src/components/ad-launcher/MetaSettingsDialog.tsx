import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  clientName: string;
  onSaved?: () => void;
}

export default function MetaSettingsDialog({ open, onOpenChange, clientId, clientName, onSaved }: Props) {
  const [filter, setFilter] = useState('');
  const [pageId, setPageId] = useState('');
  const [igId, setIgId] = useState('');
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
        setIgId((data as any)?.meta_instagram_account_id ?? '');
        setLoading(false);
      });
  }, [open, clientId]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('clients')
      .update({
        meta_name_filter: filter.trim() || null,
        meta_page_id: pageId.trim() || null,
        meta_instagram_account_id: igId.trim() || null,
      } as any)
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
            <Label htmlFor="igId">Instagram Account ID</Label>
            <Input
              id="igId"
              placeholder="17841400000000000"
              value={igId}
              onChange={(e) => setIgId(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Het Instagram-account dat in Meta Ads Manager onder "Instagram profile" verschijnt (bv. <code>1646842048691596</code> voor rivaszorggroep). Zonder dit ID gebruikt Meta een page-backed account, wat tot foutmeldingen kan leiden.
            </p>
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
