import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  field: 'hook' | 'usps' | 'omschrijving';
  clientId: string;
  functies: string[];
  locaties: string[];
  rows?: number;
}

export default function AIFieldTextarea({ value, onChange, onBlur, placeholder, field, clientId, functies, locaties, rows = 3 }: Props) {
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-briefing-row-field', {
        body: { client_id: clientId, field, functies, locaties, context: value },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.text) {
        onChange(data.text);
        onBlur?.();
        toast({ title: 'AI tekst gegenereerd' });
      }
    } catch (e: any) {
      toast({ title: 'AI mislukt', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <Textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={rows}
        className="text-xs resize-none pr-7 min-h-[60px]"
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={generate}
        disabled={loading}
        title="Genereer met AI"
        className="absolute top-1 right-1 h-5 w-5 text-accent hover:text-accent hover:bg-accent/10"
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
      </Button>
    </div>
  );
}
