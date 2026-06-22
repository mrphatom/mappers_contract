import { useState } from "react";
import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Activity, LayoutDashboard, List, PlusCircle, X, Menu, Hexagon } from "lucide-react";
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
    <div className="flex items-center gap-3">
      <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/20 to-purple-500/20 rounded-xl blur-sm" />
        <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-400 flex items-center justify-center shadow-[0_0_16px_rgba(20,241,149,0.3)]">
          <Hexagon className="w-4 h-4 text-black fill-black/20" strokeWidth={2.5} />
        </div>
      </div>
      <div>
        <div className="font-bold text-[13px] tracking-tight leading-none text-white">Mappers</div>
        <div className="text-[9px] text-emerald-400/60 font-mono leading-none mt-0.5 uppercase tracking-widest">Protocol</div>
      </div>
    </div>
  );
}

function DesktopSidebar({ location }: { location: string }) {
  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 min-h-screen relative">
      {/* Glass sidebar */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-2xl border-r border-white/[0.06]" />
      {/* Gradient accent */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />

      <div className="relative z-10 flex flex-col h-full">
        <div className="h-16 flex items-center px-5 border-b border-white/[0.05]">
          <Logo />
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = location === href || (href === "/jobs" && location.startsWith("/jobs/") && location !== "/jobs/new");
            return (
              <Link
                key={href}
                href={href}
                className={`group flex items-center gap-3 px-3 py-2.5 text-sm font-mono rounded-xl transition-all duration-200 ${
                  active
                    ? "bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 text-emerald-400 border border-emerald-500/20 shadow-[0_0_20px_rgba(20,241,149,0.05)]"
                    : "text-white/40 hover:text-white/80 hover:bg-white/[0.04] border border-transparent"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 transition-all ${active ? "text-emerald-400" : "group-hover:text-white/70"}`} />
                {label}
                {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(20,241,149,0.8)]" />}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-4 pt-2 border-t border-white/[0.05] space-y-3">
          <WalletButton />
          <div className="glass rounded-xl px-3 py-2.5 space-y-1">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(20,241,149,0.8)]" />
              <span className="text-[9px] font-mono text-emerald-400/80 uppercase tracking-widest">Devnet</span>
            </div>
            <div className="text-[9px] font-mono text-white/30 truncate">52yt1g…KX2Mu</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function MobileHeader({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="md:hidden flex items-center justify-between h-14 px-4 border-b border-white/[0.06] bg-black/40 backdrop-blur-2xl shrink-0 gap-2 relative z-30">
      <Logo />
      <div className="flex items-center gap-2">
        <WalletButton compact />
        <button
          onClick={onMenu}
          className="w-9 h-9 flex items-center justify-center text-white/40 hover:text-white/80 glass rounded-xl transition-all duration-200 active:scale-95"
          aria-label="Open menu"
        >
          <Menu className="w-4.5 h-4.5" />
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
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-72 max-w-[85vw] bg-black/80 backdrop-blur-2xl border-r border-white/[0.07] flex flex-col shadow-[4px_0_32px_rgba(0,0,0,0.6)] animate-in slide-in-from-left-4 duration-200">
        <div className="h-14 flex items-center justify-between px-5 border-b border-white/[0.06]">
          <Logo />
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white/80 glass rounded-lg transition-all active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={`group flex items-center gap-3 px-3 py-3 text-sm font-mono rounded-xl transition-all duration-200 ${
                  active
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                    : "text-white/40 hover:text-white/80 hover:bg-white/[0.04] border border-transparent"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-white/[0.05] space-y-3">
          <WalletButton />
          <div className="text-[9px] font-mono text-white/30 space-y-0.5">
            <div className="text-emerald-400/60 font-medium uppercase tracking-widest">Solana Devnet</div>
            <div className="break-all text-[8.5px] leading-relaxed">
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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex border-t border-white/[0.06] bg-black/70 backdrop-blur-2xl">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = location === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] transition-all duration-200 ${
              active ? "text-emerald-400" : "text-white/30 hover:text-white/60"
            }`}
          >
            <Icon className={`w-5 h-5 transition-all ${active ? "drop-shadow-[0_0_6px_rgba(20,241,149,0.6)]" : ""}`} strokeWidth={active ? 2.5 : 2} />
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
    <div className="flex min-h-dvh w-full">
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
