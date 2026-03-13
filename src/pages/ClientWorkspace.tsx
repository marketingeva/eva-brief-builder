import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { BookOpen, FileText, Upload, MessageSquare, Radio, LayoutDashboard } from 'lucide-react';
import OverviewTab from '@/pages/client-workspace/OverviewTab';
import LearningTab from '@/pages/client-workspace/LearningTab';
import BriefingsTab from '@/pages/client-workspace/BriefingsTab';
import UploadsTab from '@/pages/client-workspace/UploadsTab';
import CopySuggestionsTab from '@/pages/client-workspace/CopySuggestionsTab';
import LiveAdsTab from '@/pages/client-workspace/LiveAdsTab';

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
  { key: 'uploads', label: 'Uploads', icon: Upload },
  { key: 'copy', label: 'Copy Suggesties', icon: MessageSquare },
  { key: 'live-ads', label: 'Live Ads', icon: Radio },
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
      <div className="border-b bg-card px-6 pt-5 pb-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-lg font-bold text-primary">
            {client.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{client.name}</h1>
            {client.care_type && <p className="text-xs text-muted-foreground">{client.care_type}</p>}
          </div>
          {/* Learning status badge */}
          <div className={cn(
            'ml-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
            learningScore >= 80 ? 'bg-success/10 text-success' :
            learningScore >= 40 ? 'bg-warning/10 text-warning' :
            'bg-muted text-muted-foreground'
          )}>
            <BookOpen className="h-3 w-3" />
            {learningScore >= 80 ? 'Getraind' : learningScore >= 40 ? 'In opbouw' : 'Incompleet'}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 -mb-px overflow-x-auto">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                activeTab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && <OverviewTab client={client} learningScore={learningScore} />}
        {activeTab === 'learning' && <LearningTab clientId={client.id} onScoreChange={setLearningScore} />}
        {activeTab === 'briefings' && <BriefingsTab clientId={client.id} clientName={client.name} />}
        {activeTab === 'uploads' && <UploadsTab clientId={client.id} />}
        {activeTab === 'copy' && <CopySuggestionsTab clientId={client.id} />}
        {activeTab === 'live-ads' && <LiveAdsTab />}
      </div>
    </div>
  );
}
