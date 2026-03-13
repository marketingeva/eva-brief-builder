import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Target } from 'lucide-react';

interface Insight {
  id: string;
  segment_name: string;
  description: string | null;
  triggers: string[] | null;
  objections: string[] | null;
  platform_notes: string | null;
}

export default function ClientAudienceTab({ clientId }: { clientId: string }) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [segment, setSegment] = useState('');
  const [desc, setDesc] = useState('');
  const [triggers, setTriggers] = useState('');
  const [objections, setObjections] = useState('');
  const [platformNotes, setPlatformNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    const { data } = await supabase.from('client_audience_insights').select('*').eq('client_id', clientId).order('segment_name');
    setInsights(data || []);
  };

  useEffect(() => { load(); }, [clientId]);

  const handleAdd = async () => {
    setSaving(true);
    const split = (s: string) => s ? s.split(',').map(w => w.trim()).filter(Boolean) : [];
    const { error } = await supabase.from('client_audience_insights').insert({
      client_id: clientId, segment_name: segment, description: desc || null,
      triggers: split(triggers), objections: split(objections), platform_notes: platformNotes || null,
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Insight added' });
      setSegment(''); setDesc(''); setTriggers(''); setObjections(''); setPlatformNotes('');
      setShowForm(false);
      load();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('client_audience_insights').delete().eq('id', id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-medium">Audience Insights</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)}><Plus className="mr-2 h-4 w-4" />Add segment</Button>
      </div>

      {showForm && (
        <Card><CardContent className="space-y-3 pt-4">
          <div className="space-y-1"><Label>Segment name *</Label><Input value={segment} onChange={e => setSegment(e.target.value)} placeholder="e.g. Latent zoekende VIG'ers 25-40" /></div>
          <div className="space-y-1"><Label>Description</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} /></div>
          <div className="space-y-1"><Label>Triggers (comma-separated)</Label><Input value={triggers} onChange={e => setTriggers(e.target.value)} /></div>
          <div className="space-y-1"><Label>Objections (comma-separated)</Label><Input value={objections} onChange={e => setObjections(e.target.value)} /></div>
          <div className="space-y-1"><Label>Platform notes</Label><Textarea value={platformNotes} onChange={e => setPlatformNotes(e.target.value)} rows={2} placeholder="e.g. Best reached via Instagram Reels" /></div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={!segment || saving}>{saving ? 'Adding...' : 'Add'}</Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </CardContent></Card>
      )}

      {insights.length === 0 && !showForm ? (
        <Card><CardContent className="p-8 text-center">
          <Target className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No audience insights yet</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {insights.map(ins => (
            <Card key={ins.id}><CardContent className="flex items-start justify-between p-4">
              <div>
                <p className="text-sm font-medium">{ins.segment_name}</p>
                {ins.description && <p className="mt-1 text-xs text-muted-foreground">{ins.description}</p>}
                {ins.platform_notes && <p className="mt-1 text-xs text-muted-foreground italic">{ins.platform_notes}</p>}
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(ins.id)}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}
