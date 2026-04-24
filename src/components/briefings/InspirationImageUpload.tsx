import { useRef, useState, useEffect } from 'react';
import { Upload, X, Loader2, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Props {
  paths: string[];
  onChange: (paths: string[]) => void;
  clientId: string;
}

export default function InspirationImageUpload({ paths, onChange, clientId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const map: Record<string, string> = {};
    paths.forEach(p => {
      const { data } = supabase.storage.from('briefing-assets').getPublicUrl(p);
      map[p] = data.publicUrl;
    });
    setUrls(map);
  }, [paths]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const newPaths: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop();
        const path = `${clientId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from('briefing-assets').upload(path, file, { upsert: false });
        if (error) throw error;
        newPaths.push(path);
      }
      onChange([...paths, ...newPaths]);
    } catch (e: any) {
      toast({ title: 'Upload mislukt', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = (path: string) => {
    onChange(paths.filter(p => p !== path));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {paths.map(p => (
          <div key={p} className="relative group h-14 w-14 rounded border overflow-hidden bg-muted">
            {urls[p] ? (
              <img src={urls[p]} alt="inspiratie" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>
            )}
            <button
              type="button"
              onClick={() => remove(p)}
              className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-foreground/70 text-background opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            'h-14 w-14 rounded border-2 border-dashed flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors',
            uploading && 'opacity-50'
          )}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
