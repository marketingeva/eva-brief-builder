import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { BookOpen, FileText, Palette, Radio, LayoutDashboard, Bot } from 'lucide-react';
import OverviewTab from '@/pages/client-workspace/OverviewTab';
import LearningTab from '@/pages/client-workspace/LearningTab';
import BriefingsTab from '@/pages/client-workspace/BriefingsTab';
import CreativesCopyTab from '@/pages/client-workspace/CreativesCopyTab';
import LiveAdsTab from '@/pages/client-workspace/LiveAdsTab';
import AITeamTab from '@/pages/client-workspace/AITeamTab';

interface Client {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  care_type: string | null;
  website_url: string | null;
  mission: string | null;
  vision: string | null;
}

const tabs = [
  { key: 'overview', label: 'Overzicht', icon: LayoutDashboard },
  { key: 'learning', label: 'Learning', icon: BookOpen },
  { key: 'briefings', label: 'Briefings', icon: FileText },
  { key: 'creatives', label: 'Creatives & Copy', icon: Palette },
  { key: 'live-ads', label: 'Live Ads', icon: Radio },
  { key: 'ai-team', label: 'AI Team', icon: Bot },
] as const;

type TabKey = typeof tabs[number]['key'];

export default function ClientWorkspace() {
  const { slug, tab } = useParams<{ slug: string; tab?: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [learningScore, setLearningScore] = useState<number>(0);

  const activeTab = (tab as TabKey) || 'overview';

  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      setLoading(true);
      // Try by slug first, then by id
      let { data } = await supabase
        .from('clients')
        .select('id, name, slug, description, care_type, website_url, mission, vision')
        .eq('slug', slug)
        .single();

      if (!data) {
        const res = await supabase
          .from('clients')
          .select('id, name, slug, description, care_type, website_url, mission, vision')
          .eq('id', slug)
          .single();
        data = res.data;
      }

      setClient(data as Client | null);
      setLoading(false);
    };
    load();
  }, [slug]);

  const setTab = (t: TabKey) => {
    if (!slug) return;
    if (t === 'overview') {
      navigate(`/client/${slug}`);
    } else {
      navigate(`/client/${slug}/${t}`);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Laden...</div>;
  if (!client) return <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Client niet gevonden</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Client header */}
      <div className="bg-card px-8 pt-6 pb-3 border-b">
        <div className="flex items-center gap-4 mb-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-lg font-bold shadow-soft ring-4 ring-primary/10">
            {client.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-foreground leading-tight">{client.name}</h1>
            {client.care_type && (
              <span className="inline-flex items-center mt-1 px-2.5 py-0.5 rounded-full bg-muted text-[11px] text-muted-foreground font-medium">
                {client.care_type}
              </span>
            )}
          </div>
          {/* Learning status pill */}
          <div className={cn(
            'ml-auto flex items-center gap-2 rounded-full pl-3 pr-4 py-1.5 text-xs font-medium shadow-soft',
            learningScore >= 80 ? 'bg-success/15 text-success' :
            learningScore >= 40 ? 'bg-warning/15 text-warning' :
            'bg-muted text-muted-foreground'
          )}>
            <span className={cn(
              'h-2 w-2 rounded-full',
              learningScore >= 80 ? 'bg-success' :
              learningScore >= 40 ? 'bg-warning' :
              'bg-muted-foreground/40'
            )} />
            <BookOpen className="h-3 w-3" />
            {learningScore >= 80 ? 'Getraind' : learningScore >= 40 ? 'In opbouw' : 'Incompleet'}
          </div>
        </div>

        {/* Pill segmented tabs */}
        <div className="flex gap-1 p-1 rounded-full bg-muted/60 w-fit max-w-full overflow-x-auto">
          {tabs.map(({ key, label, icon: Icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-full transition-all whitespace-nowrap',
                  active
                    ? 'bg-card text-foreground shadow-soft'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && <OverviewTab client={client} learningScore={learningScore} />}
        {activeTab === 'learning' && <LearningTab clientId={client.id} onScoreChange={setLearningScore} />}
        {activeTab === 'briefings' && <BriefingsTab clientId={client.id} clientName={client.name} />}
        {activeTab === 'creatives' && <CreativesCopyTab clientId={client.id} />}
        {activeTab === 'live-ads' && <LiveAdsTab clientName={client.name} clientId={client.id} />}
        {activeTab === 'ai-team' && <AITeamTab clientId={client.id} clientName={client.name} />}
      </div>
    </div>
  );
}
