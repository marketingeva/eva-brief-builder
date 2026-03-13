import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (client: { id: string; slug: string | null }) => void;
}

function generateSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function AddClientDialog({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    const slug = generateSlug(name);
    const { data, error } = await supabase
      .from('clients')
      .insert({ name: name.trim(), website_url: websiteUrl.trim() || null, slug })
      .select('id, slug')
      .single();

    if (error) {
      toast({ title: 'Fout', description: error.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    toast({ title: 'Client aangemaakt', description: `${name} is toegevoegd.` });
    setName('');
    setCareType('');
    setSaving(false);
    onOpenChange(false);
    onCreated(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nieuwe client toevoegen</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client-name">Organisatienaam *</Label>
            <Input id="client-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="bijv. Martha Flora" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="care-type">Type zorg</Label>
            <Input id="care-type" value={careType} onChange={(e) => setCareType(e.target.value)} placeholder="bijv. Ouderenzorg, Thuiszorg" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Bezig...' : 'Aanmaken'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
