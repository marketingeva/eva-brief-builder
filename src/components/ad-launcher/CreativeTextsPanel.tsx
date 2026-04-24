import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Plus, Trash2, Copy, ClipboardPaste } from 'lucide-react';
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
type ListKey = 'primary_texts' | 'headlines' | 'descriptions';

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
  const add = (key: ListKey) => {
    setText((t) => {
      if (t[key].length >= MAX) return t;
      return { ...t, [key]: [...t[key], ''] };
    });
  };
  const remove = (key: ListKey, idx: number) => {
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

  const renderList = (key: ListKey, label: string, multiline = false) => {
    const items = text[key];
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">{label}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {items.length} OF {MAX}
          </span>
        </div>
        <div className="space-y-2">
          {items.map((v, i) => (
            <div key={i} className="flex gap-2 items-start">
              {multiline ? (
                <Textarea value={v} onChange={(e) => update(key, i, e.target.value)} rows={3} className="resize-none" />
              ) : (
                <Input value={v} onChange={(e) => update(key, i, e.target.value)} />
              )}
              {items.length > 1 && (
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(key, i)} className="shrink-0">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
        {items.length < MAX && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => add(key)}
            className="w-full border-dashed"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Variation
          </Button>
        )}
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Edit creative texts
          </SheetTitle>
        </SheetHeader>

        {/* Toolbar */}
        <div className="mt-4 flex items-center gap-1.5 flex-wrap pb-4 border-b">
          <Button type="button" variant="outline" size="sm" disabled>
            <Copy className="h-3.5 w-3.5 mr-1" /> Copy From
          </Button>
          <Button type="button" variant="outline" size="sm" disabled>
            <ClipboardPaste className="h-3.5 w-3.5 mr-1" /> Copy to All
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={generate} disabled={generating} className="ml-auto">
            <Sparkles className="h-3.5 w-3.5 mr-1" /> {generating ? 'Generating...' : 'Generate'}
          </Button>
        </div>

        <div className="mt-5 space-y-6">
          {renderList('primary_texts', 'Primary text', true)}
          {renderList('headlines', 'Headline')}
          {renderList('descriptions', 'Description')}

          <div className="space-y-2">
            <span className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">Call to Action</span>
            <Select value={text.cta} onValueChange={(v) => setText((t) => ({ ...t, cta: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CTA_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-background pb-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
            <Button onClick={() => { onSave(text); onOpenChange(false); }}>Opslaan</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
