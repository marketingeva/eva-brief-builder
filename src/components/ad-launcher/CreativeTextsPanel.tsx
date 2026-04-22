import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CreativeText {
  primary_texts: string[];
  headlines: string[];
  descriptions: string[];
  cta: string;
  link_url: string;
}

const CTA_OPTIONS = [
  'SIGN_UP', 'APPLY_NOW', 'LEARN_MORE', 'CONTACT_US', 'GET_QUOTE', 'SUBSCRIBE', 'DOWNLOAD',
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: CreativeText;
  onSave: (text: CreativeText) => void;
  clientName?: string;
}

const MAX = 5;

export default function CreativeTextsPanel({ open, onOpenChange, initial, onSave, clientName }: Props) {
  const [text, setText] = useState<CreativeText>(initial);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  useEffect(() => setText(initial), [initial, open]);

  const update = (key: keyof CreativeText, idx: number, value: string) => {
    setText((t) => {
      const arr = [...(t[key] as string[])];
      arr[idx] = value;
      return { ...t, [key]: arr };
    });
  };
  const add = (key: 'primary_texts' | 'headlines' | 'descriptions') => {
    setText((t) => {
      if (t[key].length >= MAX) return t;
      return { ...t, [key]: [...t[key], ''] };
    });
  };
  const remove = (key: 'primary_texts' | 'headlines' | 'descriptions', idx: number) => {
    setText((t) => ({ ...t, [key]: t[key].filter((_, i) => i !== idx) }));
  };

  const generate = async () => {
    setGenerating(true);
    const { data, error } = await supabase.functions.invoke('generate-ad-copy', {
      body: { client_name: clientName, count: 3 },
    });
    setGenerating(false);
    if (error) {
      toast({ title: 'Generatie mislukt', description: error.message, variant: 'destructive' });
      return;
    }
    setText((t) => ({
      ...t,
      primary_texts: data.primary_texts?.length ? data.primary_texts.slice(0, MAX) : t.primary_texts,
      headlines: data.headlines?.length ? data.headlines.slice(0, MAX) : t.headlines,
      descriptions: data.descriptions?.length ? data.descriptions.slice(0, MAX) : t.descriptions,
    }));
  };

  const renderList = (
    key: 'primary_texts' | 'headlines' | 'descriptions',
    label: string,
    multiline = false,
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button type="button" variant="ghost" size="sm" onClick={() => add(key)} disabled={text[key].length >= MAX}>
          <Plus className="h-3 w-3" /> Variatie
        </Button>
      </div>
      {text[key].map((v, i) => (
        <div key={i} className="flex gap-2 items-start">
          {multiline ? (
            <Textarea value={v} onChange={(e) => update(key, i, e.target.value)} rows={2} />
          ) : (
            <Input value={v} onChange={(e) => update(key, i, e.target.value)} />
          )}
          {text[key].length > 1 && (
            <Button type="button" variant="ghost" size="icon" onClick={() => remove(key, i)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Advertentie teksten</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-5">
          <Button type="button" variant="outline" size="sm" onClick={generate} disabled={generating}>
            <Sparkles className="h-4 w-4" /> {generating ? 'Genereren...' : 'AI Generate'}
          </Button>
          {renderList('primary_texts', 'Primary text (max 5)', true)}
          {renderList('headlines', 'Headline (max 5)')}
          {renderList('descriptions', 'Description (max 5)')}
          <div className="space-y-2">
            <Label>Call to Action</Label>
            <Select value={text.cta} onValueChange={(v) => setText((t) => ({ ...t, cta: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CTA_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Website URL (optioneel)</Label>
            <Input value={text.link_url} onChange={(e) => setText((t) => ({ ...t, link_url: e.target.value }))} placeholder="http://fb.me/" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
            <Button onClick={() => { onSave(text); onOpenChange(false); }}>Opslaan</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
