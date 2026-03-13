import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Building2 } from 'lucide-react';
import ClientOverviewTab from '@/components/client-tabs/ClientOverviewTab';
import ClientBrandTab from '@/components/client-tabs/ClientBrandTab';
import ClientLocationsTab from '@/components/client-tabs/ClientLocationsTab';
import ClientRolesTab from '@/components/client-tabs/ClientRolesTab';
import ClientAudienceTab from '@/components/client-tabs/ClientAudienceTab';
import ClientLearningsTab from '@/components/client-tabs/ClientLearningsTab';

interface Client {
  id: string;
  name: string;
  description: string | null;
  care_type: string | null;
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        setClient(data);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading...</div>;
  if (!client) return <div className="p-8 text-sm text-muted-foreground">Client not found</div>;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto animate-fade-in">
      <Button variant="ghost" size="sm" className="mb-4" asChild>
        <Link to="/clients"><ArrowLeft className="mr-2 h-4 w-4" />Back to clients</Link>
      </Button>

      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
          {client.name.charAt(0)}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{client.name}</h1>
          {client.care_type && <p className="text-sm text-muted-foreground">{client.care_type}</p>}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="brand">Brand</TabsTrigger>
          <TabsTrigger value="locations">Locations</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="audience">Audience</TabsTrigger>
          <TabsTrigger value="learnings">Learnings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><ClientOverviewTab client={client} /></TabsContent>
        <TabsContent value="brand"><ClientBrandTab clientId={client.id} /></TabsContent>
        <TabsContent value="locations"><ClientLocationsTab clientId={client.id} /></TabsContent>
        <TabsContent value="roles"><ClientRolesTab clientId={client.id} /></TabsContent>
        <TabsContent value="audience"><ClientAudienceTab clientId={client.id} /></TabsContent>
        <TabsContent value="learnings"><ClientLearningsTab clientId={client.id} /></TabsContent>
      </Tabs>
    </div>
  );
}
