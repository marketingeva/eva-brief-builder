import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, MapPin } from 'lucide-react';

interface Location {
  id: string;
  name: string;
  region: string | null;
  city: string | null;
  is_commute_friendly: boolean;
  notes: string | null;
}

export default function ClientLocationsTab({ clientId }: { clientId: string }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [commuteFriendly, setCommuteFriendly] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    const { data } = await supabase.from('client_locations').select('*').eq('client_id', clientId).order('name');
    setLocations(data || []);
  };

  useEffect(() => { load(); }, [clientId]);

  const handleAdd = async () => {
    setSaving(true);
    const { error } = await supabase.from('client_locations').insert({
      client_id: clientId, name, region: region || null, city: city || null,
      is_commute_friendly: commuteFriendly, notes: notes || null,
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Location added' });
      setName(''); setRegion(''); setCity(''); setCommuteFriendly(false); setNotes('');
      setShowForm(false);
      load();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('client_locations').delete().eq('id', id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-medium">Locations & Regions</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-4 w-4" />Add location
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1"><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Leiden Centrum" /></div>
              <div className="space-y-1"><Label>Region</Label><Input value={region} onChange={e => setRegion(e.target.value)} placeholder="e.g. Zuid-Holland" /></div>
              <div className="space-y-1"><Label>City</Label><Input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Leiden" /></div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={commuteFriendly} onCheckedChange={setCommuteFriendly} />
              <Label>Commute-friendly region</Label>
            </div>
            <div className="space-y-1"><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={!name || saving}>{saving ? 'Adding...' : 'Add'}</Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {locations.length === 0 && !showForm ? (
        <Card><CardContent className="p-8 text-center">
          <MapPin className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No locations added yet</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {locations.map(loc => (
            <Card key={loc.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">{loc.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[loc.city, loc.region].filter(Boolean).join(', ')}
                    {loc.is_commute_friendly && ' • Commute-friendly'}
                  </p>
                  {loc.notes && <p className="mt-1 text-xs text-muted-foreground">{loc.notes}</p>}
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(loc.id)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
