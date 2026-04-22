import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Rocket, Settings } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import AdLauncherTab from '@/pages/client-workspace/AdLauncherTab';
import MetaSettingsDialog from '@/components/ad-launcher/MetaSettingsDialog';

interface ClientItem { id: string; name: string; slug: string | null }

export default function AdLauncherPage() {
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('client') || '';
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    supabase.from('clients').select('id, name, slug').order('name').then(({ data }) => {
      setClients(data || []);
    });
  }, []);

  const selected = clients.find((c) => c.id === selectedId);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-card px-6 py-4 shadow-sm">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Ad Launcher</h1>
              <p className="text-xs text-muted-foreground">Upload creatives en lanceer direct naar Meta</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Klant:</span>
            <Select
              value={selectedId}
              onValueChange={(v) => setSearchParams(v ? { client: v } : {})}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Selecteer klant" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={!selected}
              onClick={() => setSettingsOpen(true)}
              title="Meta-instellingen voor deze klant"
            >
              <Settings className="h-4 w-4 mr-1" />
              Meta-instellingen
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <AdLauncherTab key={refreshKey} clientId={selected.id} clientName={selected.name} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Selecteer een klant om te starten
          </div>
        )}
      </div>

      {selected && (
        <MetaSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          clientId={selected.id}
          clientName={selected.name}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
