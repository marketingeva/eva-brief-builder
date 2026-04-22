import { useCallback, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export default function CreativeUploadZone({ onFiles, disabled }: Props) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        /^(image\/(jpeg|png|webp)|video\/mp4)$/i.test(f.type),
      );
      if (files.length) onFiles(files);
    },
    [onFiles, disabled],
  );

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors',
        dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/30 hover:bg-muted/50',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <Upload className="h-8 w-8 text-muted-foreground mb-3" />
      <p className="text-sm font-medium">Sleep bestanden hierheen of klik om te uploaden</p>
      <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP of MP4</p>
      <input
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,video/mp4"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) onFiles(files);
          e.target.value = '';
        }}
      />
    </label>
  );
}
