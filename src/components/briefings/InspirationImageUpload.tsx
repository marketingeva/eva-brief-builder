import { useRef, useState, useEffect } from 'react';
import { Upload, X, Loader2, ImageIcon, Maximize2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface Props {
  paths: string[];
  onChange: (paths: string[]) => void;
  clientId: string;
  readOnly?: boolean;
}

export default function InspirationImageUpload({ paths, onChange, clientId, readOnly = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const map: Record<string, string> = {};
    paths.forEach(p => {
      const { data } = supabase.storage.from('briefing-assets').getPublicUrl(p);
      map[p] = data.publicUrl;
    });
    setUrls(map);
  }, [paths]);

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (arr.length === 0) return;
    setUploading(true);
    const newPaths: string[] = [];
    try {
      for (const file of arr) {
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

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (readOnly) return;
    handleFiles(e.dataTransfer.files);
  };

  return (
    <>
      <div
        onDragOver={(e) => { if (!readOnly) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          'space-y-1.5 rounded-md p-1 transition-colors',
          dragOver && 'bg-primary/5 ring-2 ring-primary/40 ring-inset'
        )}
      >
        <div className="flex flex-wrap gap-1.5">
          {paths.map(p => (
            <div key={p} className="relative group h-16 w-16 rounded-md border border-border/60 overflow-hidden bg-muted shadow-sm">
              {urls[p] ? (
                <button
                  type="button"
                  onClick={() => setPreviewUrl(urls[p])}
                  className="block h-full w-full"
                >
                  <img src={urls[p]} alt="inspiratie" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/30 transition-colors flex items-center justify-center">
                    <Maximize2 className="h-4 w-4 text-background opacity-0 group-hover:opacity-100" />
                  </div>
                </button>
              ) : (
                <div className="flex h-full w-full items-center justify-center"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); remove(p); }}
                  className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-foreground/80 text-background opacity-0 group-hover:opacity-100 transition flex items-center justify-center hover:bg-destructive"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className={cn(
                'h-16 w-16 rounded-md border-2 border-dashed flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors',
                uploading && 'opacity-50',
                dragOver && 'border-primary text-primary bg-primary/10'
              )}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <>
                  <Upload className="h-3.5 w-3.5" />
                  <span className="text-[9px]">Drop</span>
                </>
              )}
            </button>
          )}
        </div>
        {!readOnly && (
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        )}
      </div>

      <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl p-2 bg-background/95 backdrop-blur">
          {previewUrl && (
            <img src={previewUrl} alt="preview" className="w-full h-auto max-h-[85vh] object-contain rounded" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
