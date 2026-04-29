import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { BookOpen, FileText, Upload, ExternalLink, Palette, Radio, Bot, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  client: {
    id: string;
    name: string;
    slug?: string | null;
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
  const navigate = useNavigate();
  const slug = (client as any).slug || client.id;

  useEffect(() => {
    Promise.all([
      supabase.from('briefing_requests').select('id', { count: 'exact', head: true }).eq('client_id', client.id),
      supabase.from('creative_uploads').select('id', { count: 'exact', head: true }).eq('client_id', client.id),
    ]).then(([b, u]) => {
      setBriefingCount(b.count || 0);
      setUploadCount(u.count || 0);
    });
  }, [client.id]);

  const quickActions = [
    { label: 'Learning', icon: BookOpen, path: `/client/${slug}/learning`, tint: 'bg-primary/10 text-primary' },
    { label: 'Briefings', icon: FileText, path: `/client/${slug}/briefings`, tint: 'bg-accent/15 text-accent-foreground' },
    { label: 'Creatives', icon: Palette, path: `/client/${slug}/creatives`, tint: 'bg-primary/10 text-primary' },
    { label: 'Live Ads', icon: Radio, path: `/client/${slug}/live-ads`, tint: 'bg-success/15 text-success' },
    { label: 'AI Team', icon: Bot, path: `/client/${slug}/ai-team`, tint: 'bg-primary/10 text-primary' },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto animate-fade-in space-y-6">
      {/* Quick actions row — pill-stijl uit referentie */}
      <div className="flex flex-wrap gap-3">
        {quickActions.map(({ label, icon: Icon, path, tint }) => (
          <button
            key={label}
            onClick={() => navigate(path)}
            className="group flex flex-col items-center gap-2 w-[88px]"
          >
            <span className={cn('flex h-14 w-14 items-center justify-center rounded-2xl glass glass-hover group-hover:-translate-y-0.5 transition-transform', tint)}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
          </button>
        ))}
      </div>

      {/* Stats row — display-getallen */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl glass p-6">
          <div className={cn(
            'flex h-11 w-11 items-center justify-center rounded-2xl mb-4',
            learningScore >= 80 ? 'bg-success/15 text-success' :
            learningScore >= 40 ? 'bg-warning/15 text-warning' :
            'bg-muted text-muted-foreground'
          )}>
            <BookOpen className="h-5 w-5" />
          </div>
          <p className="text-3xl font-bold tracking-tight text-foreground leading-none">{learningScore}<span className="text-xl text-muted-foreground">%</span></p>
          <p className="text-xs text-muted-foreground mt-2">Learning score</p>
        </div>

        <div className="rounded-3xl glass p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
            <FileText className="h-5 w-5" />
          </div>
          <p className="text-3xl font-bold tracking-tight text-foreground leading-none">{briefingCount}</p>
          <p className="text-xs text-muted-foreground mt-2">Briefings</p>
        </div>

        <div className="rounded-3xl glass p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent-foreground mb-4">
            <Upload className="h-5 w-5" />
          </div>
          <p className="text-3xl font-bold tracking-tight text-foreground leading-none">{uploadCount}</p>
          <p className="text-xs text-muted-foreground mt-2">Uploads</p>
        </div>
      </div>

      {/* Client info */}
      <div className="rounded-3xl glass-strong p-7">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold tracking-tight">Over {client.name}</h2>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Profiel</span>
        </div>
        <div className="space-y-5">
          {client.description && (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Omschrijving</p>
              <p className="text-sm text-foreground leading-relaxed">{client.description}</p>
            </div>
          )}
          {client.mission && (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Missie</p>
              <p className="text-sm text-foreground leading-relaxed">{client.mission}</p>
            </div>
          )}
          {client.vision && (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Visie</p>
              <p className="text-sm text-foreground leading-relaxed">{client.vision}</p>
            </div>
          )}
          {client.website_url && (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Website</p>
              <a href={client.website_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                {client.website_url} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
          {!client.description && !client.mission && !client.vision && !client.website_url && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nog geen client informatie ingevuld. Ga naar het <span className="font-medium text-foreground">Learning</span> tabblad om te beginnen.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
