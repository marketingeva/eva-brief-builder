import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import Login from "@/pages/Login";
import ClientWorkspace from "@/pages/ClientWorkspace";
import AdLauncherPage from "@/pages/AdLauncherPage";
import BriefingsPage from "@/pages/BriefingsPage";
import AdsManagerPage from "@/pages/AdsManagerPage";
import AdsDashboardsPage from "@/pages/AdsDashboardsPage";
import AdsInspirationPage from "@/pages/AdsInspirationPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading...</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/" element={<div className="flex items-center justify-center h-full text-muted-foreground text-sm">Select a client from the sidebar to get started</div>} />
                <Route path="/ad-launcher" element={<AdLauncherPage />} />
                <Route path="/briefings" element={<BriefingsPage />} />
                <Route path="/ads-manager" element={<AdsManagerPage />} />
                <Route path="/ads-manager/dashboards" element={<AdsDashboardsPage />} />
                <Route path="/client/:slug" element={<ClientWorkspace />} />
                <Route path="/client/:slug/:tab" element={<ClientWorkspace />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
