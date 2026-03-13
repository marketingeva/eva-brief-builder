import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Save } from 'lucide-react';

interface BrandProfile {
  id?: string;
  tone_of_voice: string;
  words_to_use: string;
  words_to_avoid: string;
  employer_branding: string;
  why_work_here: string;
  visual_style_notes: string;
}

const empty: BrandProfile = {
  tone_of_voice: '', words_to_use: '', words_to_avoid: '',
  employer_branding: '', why_work_here: '', visual_style_notes: '',
};

export default function ClientBrandTab({ clientId }: { clientId: string }) {
  const [brand, setBrand] = useState<BrandProfile>(empty);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    supabase
      .from('client_brand_profiles')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setBrand({
          id: data.id,
          tone_of_voice: data.tone_of_voice || '',
          words_to_use: (data.words_to_use || []).join(', '),
          words_to_avoid: (data.words_to_avoid || []).join(', '),
          employer_branding: data.employer_branding || '',
          why_work_here: data.why_work_here || '',
          visual_style_notes: data.visual_style_notes || '',
        });
      });
  }, [clientId]);

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      client_id: clientId,
      tone_of_voice: brand.tone_of_voice || null,
      words_to_use: brand.words_to_use ? brand.words_to_use.split(',').map(w => w.trim()).filter(Boolean) : [],
      words_to_avoid: brand.words_to_avoid ? brand.words_to_avoid.split(',').map(w => w.trim()).filter(Boolean) : [],
      employer_branding: brand.employer_branding || null,
      why_work_here: brand.why_work_here || null,
      visual_style_notes: brand.visual_style_notes || null,
    };

    const { error } = brand.id
      ? await supabase.from('client_brand_profiles').update(payload).eq('id', brand.id)
      : await supabase.from('client_brand_profiles').insert(payload).select().single().then(res => {
          if (res.data) setBrand(prev => ({ ...prev, id: res.data.id }));
          return res;
        });

    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'Saved', description: 'Brand profile updated.' });
    setSaving(false);
  };

  const update = (field: keyof BrandProfile, value: string) => setBrand(prev => ({ ...prev, [field]: value }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Brand & Employer Branding</CardTitle>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />{saving ? 'Saving...' : 'Save'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Tone of voice</Label>
          <Textarea value={brand.tone_of_voice} onChange={e => update('tone_of_voice', e.target.value)} placeholder="e.g. Warm, professional, down-to-earth" rows={2} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Words to use (comma-separated)</Label>
            <Input value={brand.words_to_use} onChange={e => update('words_to_use', e.target.value)} placeholder="e.g. zorgzaam, samen, groei" />
          </div>
          <div className="space-y-2">
            <Label>Words to avoid (comma-separated)</Label>
            <Input value={brand.words_to_avoid} onChange={e => update('words_to_avoid', e.target.value)} placeholder="e.g. goedkoop, probleem" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Employer branding</Label>
          <Textarea value={brand.employer_branding} onChange={e => update('employer_branding', e.target.value)} placeholder="What makes this employer attractive?" rows={3} />
        </div>
        <div className="space-y-2">
          <Label>Why would candidates want to work here?</Label>
          <Textarea value={brand.why_work_here} onChange={e => update('why_work_here', e.target.value)} placeholder="Key reasons candidates choose this organization" rows={3} />
        </div>
        <div className="space-y-2">
          <Label>Visual style notes</Label>
          <Textarea value={brand.visual_style_notes} onChange={e => update('visual_style_notes', e.target.value)} placeholder="Colors, imagery style, photography direction" rows={2} />
        </div>
      </CardContent>
    </Card>
  );
}
