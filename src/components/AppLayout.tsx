import { Outlet, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LogOut, Search, Plus, Menu, X, Building2, Rocket, PanelLeftClose, PanelLeft, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import AddClientDialog from '@/components/AddClientDialog';
import evaLogo from '@/assets/eva-logo.png';
import evaIcon from '@/assets/eva-icon.png';

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
  const location = useLocation();
  const isAdLauncher = location.pathname.startsWith('/ad-launcher');
  const isBriefings = location.pathname.startsWith('/briefings');
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [search, setSearch] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sidebar-collapsed') === '1';
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', next ? '1' : '0');
      return next;
    });
  };

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
        <div className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col text-sidebar-foreground transition-all duration-200 lg:relative',
          'bg-gradient-to-b from-[hsl(272_55%_22%/0.72)] via-[hsl(272_50%_18%/0.68)] to-[hsl(272_60%_14%/0.78)]',
          'backdrop-blur-2xl backdrop-saturate-150 border-r border-white/10 shadow-[inset_-1px_0_0_0_hsl(0_0%_100%/0.06),0_8px_30px_-12px_hsl(272_60%_10%/0.5)]',
          collapsed ? 'w-14' : 'w-64',
          mobileOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Header with Eva logo */}
        <div className={cn('flex h-16 items-center border-b border-sidebar-border', collapsed ? 'justify-center px-2' : 'justify-between px-4')}>
          {!collapsed && (
            <div className="flex items-center gap-3">
              <img src={evaIcon} alt="Eva" className="h-8 w-8 rounded-lg" />
              <div className="flex flex-col">
                <span className="font-bold text-sm text-sidebar-foreground">Eva AI</span>
                <span className="text-[10px] text-sidebar-foreground/50 font-medium">Marketeer</span>
              </div>
            </div>
          )}
          {collapsed && <img src={evaIcon} alt="Eva" className="h-8 w-8 rounded-lg" />}
          <button onClick={() => setMobileOpen(false)} className="lg:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground">
            <X className="h-5 w-5" />
          </button>
          <button
            onClick={toggleCollapsed}
            className={cn(
              'hidden lg:flex h-7 w-7 items-center justify-center rounded text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors',
              collapsed && 'absolute -right-3 top-5 bg-sidebar border border-sidebar-border shadow-sm'
            )}
            title={collapsed ? 'Zijbalk uitklappen' : 'Zijbalk inklappen'}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        {/* Tools */}
        <div className={cn('pt-3 pb-1 space-y-0.5', collapsed ? 'px-2' : 'px-2')}>
          <button
            onClick={() => { navigate('/ad-launcher'); setMobileOpen(false); }}
            className={cn(
              'flex w-full items-center rounded-lg text-sm transition-all',
              collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-2.5 py-2',
              isAdLauncher
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            )}
            title="Ad Launcher"
          >
            <Rocket className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Ad Launcher</span>}
          </button>
          <button
            onClick={() => { navigate('/briefings'); setMobileOpen(false); }}
            className={cn(
              'flex w-full items-center rounded-lg text-sm transition-all',
              collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-2.5 py-2',
              isBriefings
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            )}
            title="Briefings"
          >
            <FileText className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Briefings</span>}
          </button>
        </div>

        {/* Search */}
        {!collapsed && (
          <div className="px-3 pt-2 pb-2">
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
        )}

        {/* Client list */}
        <nav className={cn('flex-1 overflow-y-auto pb-2', collapsed ? 'px-2 pt-2' : 'px-2')}>
          {!collapsed && (
            <div className="mb-1 flex items-center justify-between px-2 pt-1">
              <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/40 font-medium">Clients</span>
              <button
                onClick={() => setAddOpen(true)}
                className="flex h-5 w-5 items-center justify-center rounded text-sidebar-foreground/40 hover:text-sidebar-primary hover:bg-sidebar-accent/50 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {loading ? (
            !collapsed && <div className="px-3 py-6 text-xs text-sidebar-foreground/40">Loading...</div>
          ) : filtered.length === 0 ? (
            !collapsed && (
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
            )
          ) : (
            <div className="space-y-0.5">
              {filtered.map((client) => {
                const clientSlug = getClientSlug(client);
                const isActive = slug === clientSlug;
                return (
                  <button
                    key={client.id}
                    onClick={() => handleClientClick(client)}
                    title={collapsed ? client.name : undefined}
                    className={cn(
                      'flex w-full items-center rounded-lg text-left text-sm transition-all',
                      collapsed ? 'justify-center p-1.5' : 'gap-2.5 px-2.5 py-2',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                    )}
                  >
                    <div className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors',
                      isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'bg-sidebar-accent text-sidebar-foreground/60'
                    )}>
                      {client.name.charAt(0)}
                    </div>
                    {!collapsed && (
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{client.name}</p>
                        {client.care_type && (
                          <p className="truncate text-[10px] text-sidebar-foreground/40">{client.care_type}</p>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-2">
          {!collapsed && (
            <div className="mb-1 truncate px-2.5 py-1 text-[10px] text-sidebar-foreground/40">
              {user?.email}
            </div>
          )}
          <button
            onClick={handleSignOut}
            title={collapsed ? 'Uitloggen' : undefined}
            className={cn(
              'flex w-full items-center rounded-lg text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors',
              collapsed ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Uitloggen</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-14 items-center gap-3 border-b px-4 lg:hidden bg-card">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <img src={evaIcon} alt="Eva" className="h-6 w-6 rounded" />
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
