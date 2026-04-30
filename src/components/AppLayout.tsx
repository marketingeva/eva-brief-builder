import { Outlet, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LogOut, Search, Plus, Menu, X, Building2, Rocket, PanelLeftClose, PanelLeft, FileText, BarChart3 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import AddClientDialog from '@/components/AddClientDialog';
import evaLogo from '@/assets/eva-logo.png';
import evaIcon from '@/assets/eva-icon.png';
import ThemeToggle from '@/components/ThemeToggle';

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
  const isAdsManager = location.pathname.startsWith('/ads-manager');
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
    <div className="flex h-screen overflow-hidden bg-aurora">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col glass-dark text-sidebar-foreground transition-all duration-300 lg:relative lg:my-3 lg:ml-3 lg:rounded-3xl',
          collapsed ? 'w-16' : 'w-64',
          mobileOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Header with Eva logo */}
        <div className={cn('flex h-16 items-center', collapsed ? 'justify-center px-2' : 'justify-between px-4')}>
          {!collapsed && (
            <div className="flex items-center gap-3">
              <img src={evaIcon} alt="Eva" className="h-9 w-9 rounded-xl shadow-soft" />
              <div className="flex flex-col leading-tight">
                <span className="font-bold text-sm text-sidebar-foreground">Eva AI</span>
                <span className="text-[10px] text-sidebar-foreground/50 font-medium uppercase tracking-wider">Marketeer</span>
              </div>
            </div>
          )}
          {collapsed && <img src={evaIcon} alt="Eva" className="h-9 w-9 rounded-xl shadow-soft" />}
          <button onClick={() => setMobileOpen(false)} className="lg:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground">
            <X className="h-5 w-5" />
          </button>
          <button
            onClick={toggleCollapsed}
            className={cn(
              'hidden lg:flex h-7 w-7 items-center justify-center rounded-full text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
              collapsed && 'absolute -right-3 top-5 bg-sidebar border border-sidebar-border shadow-soft'
            )}
            title={collapsed ? 'Zijbalk uitklappen' : 'Zijbalk inklappen'}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        {/* Tools */}
        <div className={cn('pt-2 pb-1 space-y-1.5', collapsed ? 'px-2' : 'px-3')}>
          {!collapsed && (
            <span className="block px-2 pb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/40 font-semibold">Tools</span>
          )}
          {[
            { key: 'ad-launcher', label: 'Ad Launcher', icon: Rocket, path: '/ad-launcher', active: isAdLauncher },
            { key: 'briefings', label: 'Briefings', icon: FileText, path: '/briefings', active: isBriefings },
            { key: 'ads-manager', label: 'Ads Manager', icon: BarChart3, path: '/ads-manager', active: isAdsManager },
          ].map(({ key, label, icon: Icon, path, active }) => (
            <button
              key={key}
              onClick={() => { navigate(path); setMobileOpen(false); }}
              className={cn(
                'group flex w-full items-center rounded-2xl text-sm transition-all relative',
                collapsed ? 'justify-center p-2' : 'gap-3 p-1.5 pr-3',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-soft'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )}
              title={label}
            >
              <span className={cn(
                'flex shrink-0 items-center justify-center rounded-xl transition-all',
                collapsed ? 'h-8 w-8' : 'h-9 w-9',
                active
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-soft'
                  : 'bg-sidebar-accent/60 text-sidebar-foreground/70 group-hover:bg-sidebar-accent'
              )}>
                <Icon className="h-4 w-4" />
              </span>
              {!collapsed && <span>{label}</span>}
            </button>
          ))}
        </div>

        {/* Search */}
        {!collapsed && (
          <div className="px-3 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sidebar-foreground/40" />
              <Input
                placeholder="Zoek client..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-9 text-xs rounded-full bg-sidebar-accent/50 border-transparent text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus-visible:ring-1 focus-visible:ring-sidebar-ring"
              />
            </div>
          </div>
        )}

        {/* Client list */}
        <nav className={cn('flex-1 overflow-y-auto pb-2', collapsed ? 'px-2 pt-2' : 'px-3')}>
          {!collapsed && (
            <div className="mb-1.5 flex items-center justify-between px-2 pt-1">
              <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/40 font-semibold">Clients</span>
              <button
                onClick={() => setAddOpen(true)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-sidebar-foreground/50 hover:text-sidebar-primary hover:bg-sidebar-accent transition-colors"
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
            <div className="space-y-1">
              {filtered.map((client) => {
                const clientSlug = getClientSlug(client);
                const isActive = slug === clientSlug;
                return (
                  <button
                    key={client.id}
                    onClick={() => handleClientClick(client)}
                    title={collapsed ? client.name : undefined}
                    className={cn(
                      'group flex w-full items-center rounded-2xl text-left text-sm transition-all',
                      collapsed ? 'justify-center p-1.5' : 'gap-3 p-1.5 pr-3',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-soft'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                    )}
                  >
                    <div className={cn(
                      'flex shrink-0 items-center justify-center rounded-xl text-xs font-bold transition-colors',
                      collapsed ? 'h-8 w-8' : 'h-9 w-9',
                      isActive
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground ring-2 ring-sidebar-primary/30 shadow-soft'
                        : 'bg-sidebar-accent/60 text-sidebar-foreground/70 group-hover:bg-sidebar-accent'
                    )}>
                      {client.name.charAt(0)}
                    </div>
                    {!collapsed && (
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm leading-tight">{client.name}</p>
                        {client.care_type && (
                          <p className="truncate text-[10px] text-sidebar-foreground/40 mt-0.5">{client.care_type}</p>
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
        <div className="mt-auto p-3">
          <div className={cn(
            'rounded-2xl bg-sidebar-accent/40 p-2',
            collapsed && 'bg-transparent p-0'
          )}>
            <ThemeToggle collapsed={collapsed} />
            {!collapsed && (
              <div className="mb-1 truncate px-2 pt-1 text-[10px] text-sidebar-foreground/50">
                {user?.email}
              </div>
            )}
            <button
              onClick={handleSignOut}
              title={collapsed ? 'Uitloggen' : undefined}
              className={cn(
                'flex w-full items-center rounded-xl text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
                collapsed ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'
              )}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Uitloggen</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-14 items-center gap-3 border-b border-border/60 px-4 lg:hidden glass">
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
