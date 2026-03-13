import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Upload, Image, Trash2, FileVideo } from 'lucide-react';
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

export default function UploadsTab({ clientId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploads, setUploads] = useState<CreativeUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadUploads = async () => {
    const { data } = await supabase
      .from('creative_uploads')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    setUploads(data || []);
    setLoading(false);
  };

  useEffect(() => { loadUploads(); }, [clientId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      const filePath = `${clientId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('creative-uploads').upload(filePath, file);
      if (uploadError) {
        toast({ title: 'Upload mislukt', description: uploadError.message, variant: 'destructive' });
        continue;
      }

      const isVideo = file.type.startsWith('video/');
      await supabase.from('creative_uploads').insert({
        client_id: clientId,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type,
        creative_type: isVideo ? 'video' : 'static',
        uploaded_by: user?.id,
      });
    }

    toast({ title: 'Geüpload', description: `${files.length} bestand(en) toegevoegd` });
    setUploading(false);
    loadUploads();
    e.target.value = '';
  };

  const handleDelete = async (upload: CreativeUpload) => {
    await supabase.storage.from('creative-uploads').remove([upload.file_path]);
    await supabase.from('creative_uploads').delete().eq('id', upload.id);
    loadUploads();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-foreground">Designer Uploads</h2>
          <p className="text-xs text-muted-foreground">Upload afgewerkte creatives van de designer</p>
        </div>
        <label className={cn('cursor-pointer', uploading && 'pointer-events-none opacity-50')}>
          <Button asChild>
            <span>
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? 'Uploaden...' : 'Upload bestanden'}
            </span>
          </Button>
          <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={handleUpload} />
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Laden...</p>
      ) : uploads.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Image className="mx-auto mb-3 h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm font-medium text-muted-foreground">Nog geen uploads</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Upload afgewerkte statics of video's</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {uploads.map(u => (
            <Card key={u.id} className="overflow-hidden">
              <div className="aspect-video bg-muted flex items-center justify-center">
                {u.file_type?.startsWith('video/') ? (
                  <FileVideo className="h-8 w-8 text-muted-foreground/30" />
                ) : (
                  <Image className="h-8 w-8 text-muted-foreground/30" />
                )}
              </div>
              <CardContent className="p-3">
                <p className="text-sm font-medium text-foreground truncate">{u.file_name}</p>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{u.creative_type || 'static'}</Badge>
                    <span className="text-[10px] text-muted-foreground">{new Date(u.created_at).toLocaleDateString('nl-NL')}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(u)}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
