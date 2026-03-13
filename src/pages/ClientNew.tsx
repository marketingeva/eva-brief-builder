import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ClientNew() {
  const [name, setName] = useState('');
  const [careType, setCareType] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { data, error } = await supabase
      .from('clients')
      .insert({ name, care_type: careType || null, description: description || null })
      .select()
      .single();

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setSaving(false);
      return;
    }
    toast({ title: 'Client created', description: `${name} has been added.` });
    navigate(`/clients/${data.id}`);
  };

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto animate-fade-in">
      <Button variant="ghost" size="sm" className="mb-4" asChild>
        <Link to="/clients"><ArrowLeft className="mr-2 h-4 w-4" />Back to clients</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Add new client</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organization name *</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Wijdezorg" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="careType">Type of care</Label>
              <Input id="careType" value={careType} onChange={(e) => setCareType(e.target.value)} placeholder="e.g. Home care, Elderly care" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of this organization" rows={3} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create client'}</Button>
              <Button type="button" variant="outline" onClick={() => navigate('/clients')}>Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
