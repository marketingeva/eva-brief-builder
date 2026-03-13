import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, FileText, Upload, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  client: {
    id: string;
    name: string;
    description: string | null;
    care_type: string | null;
    website_url: string | null;
    mission: string | null;
    vision: string | null;
  };
  learningScore: number;
}

export default function OverviewTab({ client, learningScore }: Props) {
  const [briefingCount, setBriefingCount] = useState(0);
  const [uploadCount, setUploadCount] = useState(0);

  useEffect(() => {
    Promise.all([
      supabase.from('briefing_requests').select('id', { count: 'exact', head: true }).eq('client_id', client.id),
      supabase.from('creative_uploads').select('id', { count: 'exact', head: true }).eq('client_id', client.id),
    ]).then(([b, u]) => {
      setBriefingCount(b.count || 0);
      setUploadCount(u.count || 0);
    });
  }, [client.id]);

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in space-y-6">
      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg',
              learningScore >= 80 ? 'bg-success/10' : learningScore >= 40 ? 'bg-warning/10' : 'bg-muted'
            )}>
              <BookOpen className={cn('h-4 w-4', learningScore >= 80 ? 'text-success' : learningScore >= 40 ? 'text-warning' : 'text-muted-foreground')} />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{learningScore}%</p>
              <p className="text-xs text-muted-foreground">Learning score</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{briefingCount}</p>
              <p className="text-xs text-muted-foreground">Briefings</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
              <Upload className="h-4 w-4 text-accent" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{uploadCount}</p>
              <p className="text-xs text-muted-foreground">Uploads</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Client info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Over {client.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {client.description && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Omschrijving</p>
              <p className="text-sm text-foreground">{client.description}</p>
            </div>
          )}
          {client.mission && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Missie</p>
              <p className="text-sm text-foreground">{client.mission}</p>
            </div>
          )}
          {client.vision && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Visie</p>
              <p className="text-sm text-foreground">{client.vision}</p>
            </div>
          )}
          {client.website_url && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Website</p>
              <a href={client.website_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                {client.website_url} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
          {!client.description && !client.mission && !client.vision && !client.website_url && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nog geen client informatie ingevuld. Ga naar het <span className="font-medium text-foreground">Learning</span> tabblad om te beginnen.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
