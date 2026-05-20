import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, CheckCircle2, AlertCircle, Loader2, Plus, Unlink, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AspectRatio } from '@/lib/ad-bundle';
import { KNOWN_RATIOS } from '@/lib/ad-bundle';

export interface BundleVariant {
  ratio: AspectRatio | null;
  file: File;
  preview_url: string;
  storage_path?: string;
  uploading: boolean;
  upload_error?: string;
}

interface Props {
  baseName: string;
  variants: BundleVariant[];
  textCounts: { p: number; h: number; d: number };
  launchStatus?: 'pending' | 'success' | 'failed';
  launchError?: string;
  onEditTexts: () => void;
  onRemove: () => void;
  onUnbundle?: () => void;
  onAddVariant: (files: File[]) => void;
  onRetryFailed?: () => void;
}

// Aspect-class voor de grote preview-frame.
const RATIO_CLASS: Record<AspectRatio, string> = {
  '1:1': 'aspect-square',
  '4:5': 'aspect-[4/5]',
  '9:16': 'aspect-[9/16]',
  '16:9': 'aspect-video',
};

export default function BundlePreviewCard({
  baseName,
  variants,
  textCounts,
  launchStatus,
  launchError,
  onEditTexts,
  onRemove,
  onUnbundle,
  onAddVariant,
  onRetryFailed,
}: Props) {
  // Sorteer varianten op KNOWN_RATIOS volgorde; onbekenden achteraan.
  const sorted = [...variants].sort((a, b) => {
    const ai = a.ratio ? KNOWN_RATIOS.indexOf(a.ratio) : 99;
    const bi = b.ratio ? KNOWN_RATIOS.indexOf(b.ratio) : 99;
    return ai - bi;
  });

  const [activeIdx, setActiveIdx] = useState(0);
  const active = sorted[Math.min(activeIdx, sorted.length - 1)];
  const isVideo = active?.file.type.startsWith('video');
  const totalSizeMb = (variants.reduce((s, v) => s + v.file.size, 0) / (1024 * 1024)).toFixed(2);
  const ready =
    variants.every((v) => !v.uploading && !v.upload_error) && !launchStatus;
  const anyUploading = variants.some((v) => v.uploading);
  const missingRatios = KNOWN_RATIOS.filter((r) => !variants.some((v) => v.ratio === r));
  const isBundle = variants.length > 1;
  const anyFailed = variants.some((v) => v.upload_error);

  return (
    <div className="border rounded-xl p-4 bg-card space-y-3">
      <div className="flex items-start gap-4">
        {/* Grote preview */}
        <div
          className={cn(
            'shrink-0 rounded-lg overflow-hidden bg-muted border w-40',
            active?.ratio ? RATIO_CLASS[active.ratio] : 'aspect-square',
          )}
        >
          {active && (isVideo ? (
            <video src={active.preview_url} className="w-full h-full object-cover" controls={false} muted />
          ) : (
            <img src={active.preview_url} alt={active.file.name} className="w-full h-full object-cover" />
          ))}
        </div>

        {/* Info + acties */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{baseName}</p>
              <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                <span>
                  {variants.length} formaat{variants.length === 1 ? '' : 'en'}
                </span>
                <span>·</span>
                <span>{totalSizeMb} MB</span>
                {anyUploading && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Uploaden
                    </span>
                  </>
                )}
                {ready && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1 text-success">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" /> Ready
                    </span>
                  </>
                )}
                {launchStatus === 'pending' && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Lanceren
                    </span>
                  </>
                )}
                {launchStatus === 'success' && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1 text-success">
                      <CheckCircle2 className="h-3 w-3" /> Aangemaakt (gepauzeerd)
                    </span>
                  </>
                )}
                {launchStatus === 'failed' && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertCircle className="h-3 w-3" /> {launchError}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {([
                ['P', textCounts.p, 'Primary texts'],
                ['H', textCounts.h, 'Headlines'],
                ['D', textCounts.d, 'Descriptions'],
              ] as const).map(([label, count, title]) => (
                <span
                  key={label}
                  title={`${title}: ${count}`}
                  className={cn(
                    'inline-flex items-center justify-center h-7 w-7 rounded-full text-[11px] font-semibold border',
                    count > 0
                      ? 'bg-success/15 text-success border-success/30'
                      : 'bg-muted text-muted-foreground border-transparent',
                  )}
                >
                  {label}
                </span>
              ))}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEditTexts} title="Teksten bewerken">
                <Pencil className="h-4 w-4" />
              </Button>
              {anyFailed && onRetryFailed && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRetryFailed} title="Mislukte uploads opnieuw proberen">
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
              {isBundle && onUnbundle && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onUnbundle} title="Bundle splitsen">
                  <Unlink className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRemove} title="Verwijderen">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Tabs per ratio */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {sorted.map((v, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                  i === activeIdx
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/50 text-foreground border-border hover:bg-muted',
                )}
                title={v.file.name}
              >
                {v.file.type.startsWith('video') ? (
                  <video src={v.preview_url} className="h-5 w-5 rounded object-cover" muted />
                ) : (
                  <img src={v.preview_url} alt="" className="h-5 w-5 rounded object-cover" />
                )}
                <span>{v.ratio ?? 'auto'}</span>
                {v.uploading && <Loader2 className="h-3 w-3 animate-spin" />}
                {v.upload_error && <AlertCircle className="h-3 w-3 text-destructive" />}
              </button>
            ))}
            {missingRatios.length > 0 && (
              <label
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-dashed border-border text-muted-foreground hover:bg-muted/40 cursor-pointer"
                title={`Mist nog: ${missingRatios.join(', ')}`}
              >
                <Plus className="h-3 w-3" /> Voeg formaat toe
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,video/mp4"
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length) onAddVariant(files);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
