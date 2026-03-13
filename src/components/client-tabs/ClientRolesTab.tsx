import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Users } from 'lucide-react';

interface Role {
  id: string;
  role_title: string;
  care_domain: string | null;
  description: string | null;
  qualifications: string[] | null;
  audience_objections: string[] | null;
  audience_triggers: string[] | null;
}

export default function ClientRolesTab({ clientId }: { clientId: string }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [domain, setDomain] = useState('');
  const [desc, setDesc] = useState('');
  const [quals, setQuals] = useState('');
  const [objections, setObjections] = useState('');
  const [triggers, setTriggers] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    const { data } = await supabase.from('client_roles').select('*').eq('client_id', clientId).order('role_title');
    setRoles(data || []);
  };

  useEffect(() => { load(); }, [clientId]);

  const handleAdd = async () => {
    setSaving(true);
    const split = (s: string) => s ? s.split(',').map(w => w.trim()).filter(Boolean) : [];
    const { error } = await supabase.from('client_roles').insert({
      client_id: clientId, role_title: title, care_domain: domain || null,
      description: desc || null, qualifications: split(quals),
      audience_objections: split(objections), audience_triggers: split(triggers),
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Role added' });
      setTitle(''); setDomain(''); setDesc(''); setQuals(''); setObjections(''); setTriggers('');
      setShowForm(false);
      load();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('client_roles').delete().eq('id', id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-medium">Roles & Qualifications</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)}><Plus className="mr-2 h-4 w-4" />Add role</Button>
      </div>

      {showForm && (
        <Card><CardContent className="space-y-3 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Role title *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Verzorgende IG" /></div>
            <div className="space-y-1"><Label>Care domain</Label><Input value={domain} onChange={e => setDomain(e.target.value)} placeholder="e.g. Thuiszorg" /></div>
          </div>
          <div className="space-y-1"><Label>Description</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} /></div>
          <div className="space-y-1"><Label>Qualifications (comma-separated)</Label><Input value={quals} onChange={e => setQuals(e.target.value)} placeholder="e.g. MBO-3, BIG-registratie" /></div>
          <div className="space-y-1"><Label>Audience objections (comma-separated)</Label><Input value={objections} onChange={e => setObjections(e.target.value)} placeholder="e.g. Werkdruk, Salaris" /></div>
          <div className="space-y-1"><Label>Audience triggers (comma-separated)</Label><Input value={triggers} onChange={e => setTriggers(e.target.value)} placeholder="e.g. Flexibiliteit, Doorgroeimogelijkheden" /></div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={!title || saving}>{saving ? 'Adding...' : 'Add'}</Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </CardContent></Card>
      )}

      {roles.length === 0 && !showForm ? (
        <Card><CardContent className="p-8 text-center">
          <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No roles added yet</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {roles.map(role => (
            <Card key={role.id}><CardContent className="flex items-start justify-between p-4">
              <div>
                <p className="text-sm font-medium">{role.role_title}</p>
                {role.care_domain && <p className="text-xs text-muted-foreground">{role.care_domain}</p>}
                {role.description && <p className="mt-1 text-xs text-muted-foreground">{role.description}</p>}
                {role.qualifications && role.qualifications.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {role.qualifications.map((q, i) => (
                      <span key={i} className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{q}</span>
                    ))}
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(role.id)}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}
