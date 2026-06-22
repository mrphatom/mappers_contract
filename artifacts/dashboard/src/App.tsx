import { useState } from "react";
import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Activity, LayoutDashboard, List, PlusCircle, X, Menu } from "lucide-react";
import { SolanaWalletProvider } from "@/components/wallet-provider";
import { WalletButton } from "@/components/wallet-button";
import NotFound from "@/pages/not-found";

import Dashboard from "./pages/dashboard";
import Jobs from "./pages/jobs";
import CreateJob from "./pages/create-job";
import JobDetail from "./pages/job-detail";
import Oracle from "./pages/oracle";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, retry: 1 },
  },
});

const NAV = [
  { href: "/",         label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs",     label: "All Jobs",  icon: List },
  { href: "/jobs/new", label: "Create",    icon: PlusCircle },
  { href: "/oracle",   label: "Oracle",    icon: Activity },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 bg-primary flex items-center justify-center text-primary-foreground font-black text-sm font-mono shrink-0">
        M
      </div>
      <div>
        <div className="font-bold text-sm tracking-tight leading-none">Mappers</div>
        <div className="text-[10px] text-muted-foreground font-mono leading-none mt-0.5">Protocol</div>
      </div>
    </div>
  );
}

function DesktopSidebar({ location }: { location: string }) {
  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-border bg-sidebar min-h-screen">
      <div className="h-14 flex items-center px-5 border-b border-border">
        <Logo />
      </div>
      <nav className="flex-1 py-4 px-2 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = location === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm font-mono transition-all ${
                active
                  ? "bg-primary/10 text-primary border-l-2 border-primary"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent border-l-2 border-transparent"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-3 border-t border-border space-y-3">
        <WalletButton />
        <div className="text-[10px] font-mono text-muted-foreground leading-relaxed px-1">
          <div className="text-primary/80">DEVNET</div>
          <div className="truncate">52yt1g...KX2Mu</div>
        </div>
      </div>
    </aside>
  );
}

function MobileHeader({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="md:hidden flex items-center justify-between h-14 px-4 border-b border-border bg-sidebar shrink-0 gap-2">
      <Logo />
      <div className="flex items-center gap-2">
        <WalletButton compact />
        <button
          onClick={onMenu}
          className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-accent/50 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}

function MobileDrawer({
  open,
  onClose,
  location,
}: {
  open: boolean;
  onClose: () => void;
  location: string;
}) {
  if (!open) return null;
  return (
    <div className="md:hidden fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-72 max-w-[85vw] bg-sidebar border-r border-border flex flex-col shadow-2xl animate-in slide-in-from-left-4 duration-200">
        <div className="h-14 flex items-center justify-between px-5 border-b border-border">
          <Logo />
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-accent/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-3 text-sm font-mono transition-all ${
                  active
                    ? "bg-primary/10 text-primary border-l-2 border-primary"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent border-l-2 border-transparent"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-border space-y-3">
          <WalletButton />
          <div className="text-[10px] font-mono text-muted-foreground space-y-0.5">
            <div className="text-primary/80 font-medium">SOLANA DEVNET</div>
            <div className="break-all text-[9px] leading-relaxed opacity-70">
              52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileBottomNav({ location }: { location: string }) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-sidebar/95 backdrop-blur-md">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = location === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] transition-colors ${
              active ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className={`w-5 h-5 ${active ? "stroke-[2.5px]" : ""}`} />
            <span className="text-[9px] font-mono uppercase tracking-wider">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <DesktopSidebar location={location} />

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        location={location}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <MobileHeader onMenu={() => setDrawerOpen(true)} />
        <main className="flex-1 flex flex-col pb-16 md:pb-0 min-w-0">
          {children}
        </main>
      </div>

      <MobileBottomNav location={location} />
    </div>
  );
}

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/jobs" component={Jobs} />
        <Route path="/jobs/new" component={CreateJob} />
        <Route path="/jobs/:jobId" component={JobDetail} />
        <Route path="/oracle" component={Oracle} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

export default function App() {
  return (
    <SolanaWalletProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </SolanaWalletProvider>
  );
}
