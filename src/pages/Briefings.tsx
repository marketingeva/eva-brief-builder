import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Plus, ArrowRight } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type CampaignRequest = Tables<'campaign_requests'>;
type Client = Tables<'clients'>;

interface RequestWithClient extends CampaignRequest {
  clients: Pick<Client, 'name'> | null;
}

export default function Briefings() {
  const [requests, setRequests] = useState<RequestWithClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('campaign_requests')
      .select('*, clients(name)')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setRequests((data as unknown as RequestWithClient[]) || []);
        setLoading(false);
      });
  }, []);

  const statusColor = (s: string | null) => {
    switch (s) {
      case 'generated': return 'default';
      case 'approved': return 'default';
      case 'pending': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Briefings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Campaign requests and generated briefings</p>
        </div>
        <Button asChild>
          <Link to="/campaigns/new"><Plus className="mr-2 h-4 w-4" />New Campaign Request</Link>
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No campaign requests yet</p>
            <p className="mt-1 text-xs text-muted-foreground/70">Create your first campaign request to generate a briefing</p>
            <Button className="mt-4" asChild>
              <Link to="/campaigns/new"><Plus className="mr-2 h-4 w-4" />New Campaign Request</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => (
            <Link
              key={req.id}
              to={req.status === 'generated' ? `/briefings/generate/${req.id}` : `/briefings/generate/${req.id}`}
              className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {req.role_title || 'Untitled'} {req.region ? `— ${req.region}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {req.clients?.name || 'Unknown client'} · {new Date(req.created_at).toLocaleDateString('nl-NL')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={statusColor(req.status)}>{req.status || 'draft'}</Badge>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
