import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, BookOpen } from 'lucide-react';

interface Learning {
  id: string;
  hook_used: string | null;
  concept: string | null;
  result: string | null;
  what_worked: string | null;
  what_failed: string | null;
  campaign_date: string | null;
  tags: string[] | null;
}

export default function ClientLearningsTab({ clientId }: { clientId: string }) {
  const [learnings, setLearnings] = useState<Learning[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [hook, setHook] = useState('');
  const [concept, setConcept] = useState('');
  const [result, setResult] = useState('');
  const [worked, setWorked] = useState('');
  const [failed, setFailed] = useState('');
  const [date, setDate] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    const { data } = await supabase.from('client_learnings').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
    setLearnings(data || []);
  };

  useEffect(() => { load(); }, [clientId]);

  const handleAdd = async () => {
    setSaving(true);
    const { error } = await supabase.from('client_learnings').insert({
      client_id: clientId, hook_used: hook || null, concept: concept || null,
      result: result || null, what_worked: worked || null, what_failed: failed || null,
      campaign_date: date || null,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Learning added' });
      setHook(''); setConcept(''); setResult(''); setWorked(''); setFailed(''); setDate(''); setTags('');
      setShowForm(false);
      load();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('client_learnings').delete().eq('id', id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-medium">Campaign Learnings</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)}><Plus className="mr-2 h-4 w-4" />Add learning</Button>
      </div>

      {showForm && (
        <Card><CardContent className="space-y-3 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Hook used</Label><Input value={hook} onChange={e => setHook(e.target.value)} placeholder="e.g. 'Wil jij écht verschil maken?'" /></div>
            <div className="space-y-1"><Label>Campaign date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Concept</Label><Textarea value={concept} onChange={e => setConcept(e.target.value)} rows={2} placeholder="Describe the campaign concept" /></div>
          <div className="space-y-1"><Label>Result</Label><Textarea value={result} onChange={e => setResult(e.target.value)} rows={2} placeholder="What was the outcome?" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>What worked</Label><Textarea value={worked} onChange={e => setWorked(e.target.value)} rows={2} /></div>
            <div className="space-y-1"><Label>What failed</Label><Textarea value={failed} onChange={e => setFailed(e.target.value)} rows={2} /></div>
          </div>
          <div className="space-y-1"><Label>Tags (comma-separated)</Label><Input value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. VIG, thuiszorg, video" /></div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={saving}>{saving ? 'Adding...' : 'Add'}</Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </CardContent></Card>
      )}

      {learnings.length === 0 && !showForm ? (
        <Card><CardContent className="p-8 text-center">
          <BookOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No learnings recorded yet</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {learnings.map(l => (
            <Card key={l.id}><CardContent className="flex items-start justify-between p-4">
              <div>
                {l.hook_used && <p className="text-sm font-medium">"{l.hook_used}"</p>}
                {l.concept && <p className="mt-1 text-xs text-muted-foreground">{l.concept}</p>}
                {l.what_worked && <p className="mt-1 text-xs text-success">✓ {l.what_worked}</p>}
                {l.what_failed && <p className="mt-0.5 text-xs text-destructive">✗ {l.what_failed}</p>}
                {l.tags && l.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {l.tags.map((t, i) => (
                      <span key={i} className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(l.id)}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}
