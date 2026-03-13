import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Upload, Image, Trash2, FileVideo, Copy, RefreshCw, ThumbsUp, ThumbsDown, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  clientId: string;
}

interface CreativeUpload {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  creative_type: string | null;
  notes: string | null;
  status: string | null;
  created_at: string;
}

interface CopyGeneration {
  id: string;
  creative_upload_id: string;
  primary_text: string | null;
  headline: string | null;
  alt_headline: string | null;
  cta_suggestion: string | null;
  analysis_notes: string | null;
  status: string | null;
  created_at: string;
  feedback_rating?: string | null;
}

export default function CreativesCopyTab({ clientId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploads, setUploads] = useState<CreativeUpload[]>([]);
  const [generations, setGenerations] = useState<Record<string, CopyGeneration>>({});
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);

  const loadData = useCallback(async () => {
    const [uploadsRes, gensRes] = await Promise.all([
      supabase
        .from('creative_uploads')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false }),
      supabase
        .from('creative_copy_generations')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false }),
    ]);

    const uploadsList = (uploadsRes.data || []) as CreativeUpload[];
    setUploads(uploadsList);

    // Map latest generation per upload
    const genMap: Record<string, CopyGeneration> = {};
    for (const g of (gensRes.data || []) as CopyGeneration[]) {
      if (!genMap[g.creative_upload_id]) {
        genMap[g.creative_upload_id] = g;
      }
    }

    // Load feedback for each generation
    const genIds = Object.values(genMap).map(g => g.id);
    if (genIds.length) {
      const { data: feedbackData } = await supabase
        .from('creative_copy_feedback')
        .select('generation_id, rating')
        .in('generation_id', genIds)
        .order('created_at', { ascending: false });

      if (feedbackData) {
        const feedbackMap: Record<string, string> = {};
        for (const f of feedbackData) {
          if (!feedbackMap[f.generation_id]) feedbackMap[f.generation_id] = f.rating;
        }
        for (const key of Object.keys(genMap)) {
          genMap[key].feedback_rating = feedbackMap[genMap[key].id] || null;
        }
      }
    }

    setGenerations(genMap);

    // Load signed URLs for images
    const urls: Record<string, string> = {};
    for (const u of uploadsList) {
      if (u.file_type?.startsWith('image/')) {
        const { data } = await supabase.storage
          .from('creative-uploads')
          .createSignedUrl(u.file_path, 3600);
        if (data?.signedUrl) urls[u.id] = data.signedUrl;
      }
    }
    setImageUrls(urls);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  const processFiles = async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    if (!fileArr.length) return;
    setUploading(true);

    for (const file of fileArr) {
      const filePath = `${clientId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('creative-uploads')
        .upload(filePath, file);

      if (uploadError) {
        toast({ title: 'Upload mislukt', description: uploadError.message, variant: 'destructive' });
        continue;
      }

      const isVideo = file.type.startsWith('video/');
      const { data: insertData } = await supabase.from('creative_uploads').insert({
        client_id: clientId,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type,
        creative_type: isVideo ? 'video' : 'static',
        uploaded_by: user?.id,
      }).select().single();

      // Auto-generate copy for images
      if (insertData && !isVideo) {
        triggerGeneration(insertData.id);
      }
    }

    toast({ title: 'Geüpload', description: `${fileArr.length} bestand(en) toegevoegd` });
    setUploading(false);
    loadData();
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) processFiles(e.dataTransfer.files);
  };

  const triggerGeneration = async (uploadId: string) => {
    setGeneratingIds(prev => new Set(prev).add(uploadId));

    try {
      const { data, error } = await supabase.functions.invoke('analyze-creative', {
        body: { creative_upload_id: uploadId, client_id: clientId },
      });

      if (error) throw error;

      toast({ title: 'Copy gegenereerd', description: 'AI heeft nieuwe ad copy geschreven' });
    } catch (e: any) {
      toast({ title: 'Generatie mislukt', description: e.message || 'Probeer het opnieuw', variant: 'destructive' });
    } finally {
      setGeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(uploadId);
        return next;
      });
      loadData();
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Gekopieerd', description: 'Tekst naar klembord gekopieerd' });
  };

  const handleFeedback = async (generationId: string, rating: 'good' | 'bad') => {
    await supabase.from('creative_copy_feedback').insert({
      generation_id: generationId,
      rating,
    });
    toast({ title: rating === 'good' ? '👍 Bedankt!' : '👎 Feedback opgeslagen' });
    loadData();
  };

  const handleDelete = async (upload: CreativeUpload) => {
    await supabase.storage.from('creative-uploads').remove([upload.file_path]);
    await supabase.from('creative_uploads').delete().eq('id', upload.id);
    loadData();
  };

  const copyAllText = (gen: CopyGeneration) => {
    const parts = [
      gen.primary_text && `Primary text:\n${gen.primary_text}`,
      gen.headline && `Headline: ${gen.headline}`,
      gen.alt_headline && `Alt headline: ${gen.alt_headline}`,
      gen.cta_suggestion && `CTA: ${gen.cta_suggestion}`,
    ].filter(Boolean);
    handleCopy(parts.join('\n\n'));
  };

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center transition-all mb-8',
          dragOver
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-border hover:border-primary/40 hover:bg-muted/30',
          uploading && 'pointer-events-none opacity-60'
        )}
      >
        <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground mb-1">
          {uploading ? 'Uploaden...' : 'Sleep creatives hierheen'}
        </p>
        <p className="text-xs text-muted-foreground mb-3">of klik om bestanden te selecteren</p>
        <label className="cursor-pointer">
          <Button variant="outline" size="sm" asChild>
            <span>Selecteer bestanden</span>
          </Button>
          <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={handleUpload} />
        </label>
      </div>

      {/* Creative list */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <Card key={i} className="overflow-hidden">
              <div className="flex flex-col md:flex-row">
                <Skeleton className="h-48 md:w-64 shrink-0" />
                <div className="flex-1 p-5 space-y-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : uploads.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Image className="mx-auto mb-3 h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm font-medium text-muted-foreground">Nog geen creatives</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Upload afgewerkte statics of video's om te starten</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {uploads.map(u => {
            const gen = generations[u.id];
            const isGenerating = generatingIds.has(u.id);
            const isImage = u.file_type?.startsWith('image/');

            return (
              <Card key={u.id} className="overflow-hidden">
                <div className="flex flex-col md:flex-row">
                  {/* LEFT: Image preview */}
                  <div className="md:w-64 shrink-0 bg-muted relative group">
                    {isImage && imageUrls[u.id] ? (
                      <img
                        src={imageUrls[u.id]}
                        alt={u.file_name}
                        className="w-full h-full object-contain max-h-[20rem]"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-48 md:h-full">
                        {u.file_type?.startsWith('video/') ? (
                          <FileVideo className="h-10 w-10 text-muted-foreground/30" />
                        ) : (
                          <Image className="h-10 w-10 text-muted-foreground/30" />
                        )}
                      </div>
                    )}

                    {/* Delete overlay */}
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDelete(u)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>

                    {/* File info overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                      <p className="text-xs text-white font-medium truncate">{u.file_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-[10px] bg-white/20 text-white border-0">
                          {u.creative_type || 'static'}
                        </Badge>
                        <span className="text-[10px] text-white/70">
                          {new Date(u.created_at).toLocaleDateString('nl-NL')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: Copy output */}
                  <div className="flex-1 p-5">
                    {isGenerating ? (
                      <div className="flex flex-col items-center justify-center h-full min-h-[12rem] text-center">
                        <div className="relative mb-4">
                          <Sparkles className="h-8 w-8 text-primary animate-pulse" />
                          <Loader2 className="h-5 w-5 text-primary/60 animate-spin absolute -bottom-1 -right-1" />
                        </div>
                        <p className="text-sm font-medium text-foreground">AI schrijft ad copy...</p>
                        <p className="text-xs text-muted-foreground mt-1">Op basis van dit creative en de client data</p>
                      </div>
                    ) : gen && gen.status === 'completed' ? (
                      <div className="space-y-3">
                        {/* Analysis notes */}
                        {gen.analysis_notes && (
                          <div className="bg-muted/50 rounded-lg p-3">
                            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Analyse</p>
                            <p className="text-xs text-foreground/80">{gen.analysis_notes}</p>
                          </div>
                        )}

                        {/* Primary text */}
                        {gen.primary_text && (
                          <div>
                            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Primary text</p>
                            <p className="text-sm text-foreground leading-relaxed">{gen.primary_text}</p>
                          </div>
                        )}

                        {/* Headlines */}
                        <div className="flex flex-wrap gap-3">
                          {gen.headline && (
                            <div className="flex-1 min-w-[140px]">
                              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Headline</p>
                              <p className="text-sm font-semibold text-foreground">{gen.headline}</p>
                            </div>
                          )}
                          {gen.alt_headline && (
                            <div className="flex-1 min-w-[140px]">
                              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Alt headline</p>
                              <p className="text-sm font-semibold text-foreground">{gen.alt_headline}</p>
                            </div>
                          )}
                        </div>

                        {/* CTA */}
                        {gen.cta_suggestion && (
                          <div>
                            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">CTA</p>
                            <Badge variant="outline" className="text-xs">{gen.cta_suggestion}</Badge>
                          </div>
                        )}

                        {/* Action bar */}
                        <div className="flex items-center gap-2 pt-2 border-t">
                          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => copyAllText(gen)}>
                            <Copy className="h-3 w-3 mr-1.5" />
                            Kopieer alles
                          </Button>
                          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => triggerGeneration(u.id)}>
                            <RefreshCw className="h-3 w-3 mr-1.5" />
                            Regenereer
                          </Button>
                          <div className="ml-auto flex items-center gap-1">
                            <Button
                              variant={gen.feedback_rating === 'good' ? 'default' : 'ghost'}
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleFeedback(gen.id, 'good')}
                            >
                              <ThumbsUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant={gen.feedback_rating === 'bad' ? 'destructive' : 'ghost'}
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleFeedback(gen.id, 'bad')}
                            >
                              <ThumbsDown className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : gen && gen.status === 'error' ? (
                      <div className="flex flex-col items-center justify-center h-full min-h-[12rem] text-center">
                        <p className="text-sm text-destructive font-medium mb-2">Generatie mislukt</p>
                        <Button variant="outline" size="sm" onClick={() => triggerGeneration(u.id)}>
                          <RefreshCw className="h-3 w-3 mr-1.5" />
                          Opnieuw proberen
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full min-h-[12rem] text-center">
                        <Sparkles className="h-8 w-8 text-muted-foreground/20 mb-3" />
                        <p className="text-sm text-muted-foreground font-medium mb-1">Geen copy gegenereerd</p>
                        <p className="text-xs text-muted-foreground/70 mb-3">
                          {isImage ? 'Laat de AI passende ad copy schrijven' : 'Video-analyse komt in een volgende fase'}
                        </p>
                        {isImage && (
                          <Button variant="outline" size="sm" onClick={() => triggerGeneration(u.id)}>
                            <Sparkles className="h-3 w-3 mr-1.5" />
                            Genereer copy
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
