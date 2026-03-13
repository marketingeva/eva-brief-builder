import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, FileText, BookOpen, Plus, ArrowRight } from 'lucide-react';

interface Client {
  id: string;
  name: string;
  care_type: string | null;
  updated_at: string;
}

export default function Dashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientCount, setClientCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data, count } = await supabase
        .from('clients')
        .select('*', { count: 'exact' })
        .order('updated_at', { ascending: false })
        .limit(5);
      setClients(data || []);
      setClientCount(count || 0);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Welcome to Eva AI Marketeer</p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{clientCount}</p>
              <p className="text-xs text-muted-foreground">Clients</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
              <FileText className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">0</p>
              <p className="text-xs text-muted-foreground">Briefings</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <BookOpen className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">0</p>
              <p className="text-xs text-muted-foreground">Learnings</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/clients/new"><Plus className="mr-2 h-4 w-4" />Add client</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/campaigns/new"><FileText className="mr-2 h-4 w-4" />New campaign request</Link>
          </Button>
        </div>
      </div>

      {/* Recent clients */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Recent clients</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/clients">View all <ArrowRight className="ml-1 h-3 w-3" /></Link>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : clients.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No clients yet</p>
              <p className="mt-1 text-xs text-muted-foreground/70">Add your first client to get started</p>
              <Button variant="outline" size="sm" className="mt-4" asChild>
                <Link to="/clients/new">Add client</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {clients.map((client) => (
                <Link
                  key={client.id}
                  to={`/clients/${client.id}`}
                  className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary">
                      {client.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{client.name}</p>
                      {client.care_type && (
                        <p className="text-xs text-muted-foreground">{client.care_type}</p>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
