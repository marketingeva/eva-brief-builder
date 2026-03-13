import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LogOut, Search, Plus, Menu, X, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import AddClientDialog from '@/components/AddClientDialog';

interface ClientListItem {
  id: string;
  name: string;
  slug: string | null;
  care_type: string | null;
}

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { slug } = useParams();
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [search, setSearch] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadClients = async () => {
    const { data } = await supabase
      .from('clients')
      .select('id, name, slug, care_type')
      .order('name');
    setClients(data || []);
    setLoading(false);
  };

  useEffect(() => { loadClients(); }, []);

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const getClientSlug = (client: ClientListItem) => client.slug || client.id;

  const handleClientClick = (client: ClientListItem) => {
    navigate(`/client/${getClientSlug(client)}`);
    setMobileOpen(false);
  };

  const handleClientCreated = (client: { id: string; slug: string | null }) => {
    loadClients();
    navigate(`/client/${client.slug || client.id}`);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/20 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:relative',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
              <span className="text-sm font-bold text-sidebar-primary-foreground">E</span>
            </div>
            <span className="font-semibold text-sm">Eva AI</span>
          </div>
          <button onClick={() => setMobileOpen(false)} className="lg:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sidebar-foreground/40" />
            <Input
              placeholder="Zoek client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-sidebar-accent/50 border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus-visible:ring-sidebar-ring"
            />
          </div>
        </div>

        {/* Client list */}
        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          <div className="mb-1 flex items-center justify-between px-2 pt-1">
            <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/40 font-medium">Clients</span>
            <button
              onClick={() => setAddOpen(true)}
              className="flex h-5 w-5 items-center justify-center rounded text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="px-3 py-6 text-xs text-sidebar-foreground/40">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <Building2 className="mx-auto mb-2 h-6 w-6 text-sidebar-foreground/20" />
              <p className="text-xs text-sidebar-foreground/40">
                {search ? 'Geen resultaten' : 'Nog geen clients'}
              </p>
              {!search && (
                <button
                  onClick={() => setAddOpen(true)}
                  className="mt-2 text-xs text-sidebar-primary hover:underline"
                >
                  Voeg eerste client toe
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((client) => {
                const clientSlug = getClientSlug(client);
                const isActive = slug === clientSlug;
                return (
                  <button
                    key={client.id}
                    onClick={() => handleClientClick(client)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                    )}
                  >
                    <div className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
                      isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'bg-sidebar-accent text-sidebar-foreground/60'
                    )}>
                      {client.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{client.name}</p>
                      {client.care_type && (
                        <p className="truncate text-[10px] text-sidebar-foreground/40">{client.care_type}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-2">
          <div className="mb-1 truncate px-2.5 py-1 text-[10px] text-sidebar-foreground/40">
            {user?.email}
          </div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Uitloggen</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-14 items-center gap-3 border-b px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold text-sm">Eva AI Marketeer</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <AddClientDialog open={addOpen} onOpenChange={setAddOpen} onCreated={handleClientCreated} />
    </div>
  );
}
