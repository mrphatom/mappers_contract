import { useState, useRef, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Wallet, ChevronDown, LogOut, Copy, Check, Zap } from "lucide-react";

function truncate(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { publicKey, connected, connecting, disconnect, select, wallets } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleConnect = () => {
    const phantom = wallets.find((w) => w.adapter.name === "Phantom");
    if (phantom) select(phantom.adapter.name);
    else select(wallets[0]?.adapter.name ?? null);
  };

  const handleCopy = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey.toBase58()).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  if (!connected) {
    return (
      <button
        onClick={handleConnect}
        disabled={connecting}
        className={`group relative flex items-center justify-center gap-2 font-mono text-xs rounded-xl border border-emerald-500/25 text-emerald-400/80 hover:text-emerald-300 hover:border-emerald-500/50 hover:bg-emerald-500/10 active:scale-[0.97] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed overflow-hidden ${
          compact ? "px-3 py-2 min-h-[36px]" : "w-full px-4 py-3 min-h-[44px]"
        }`}
      >
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-r from-emerald-500/5 to-transparent transition-opacity duration-300" />
        <Wallet className="w-3.5 h-3.5 shrink-0" />
        <span>{connecting ? "Connecting…" : compact ? "Connect" : "Connect Wallet"}</span>
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`group flex items-center gap-2 font-mono text-xs rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15 hover:border-emerald-500/50 active:scale-[0.97] transition-all duration-200 ${
          compact ? "px-3 py-2 min-h-[36px]" : "w-full px-4 py-3 min-h-[44px]"
        }`}
      >
        <Zap className="w-3 h-3 shrink-0 text-emerald-400" />
        <span className="truncate flex-1 text-left">{truncate(publicKey!.toBase58())}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 glass rounded-xl border border-white/10 shadow-[0_16px_48px_rgba(0,0,0,0.5)] z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <div className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-widest mb-1">Connected</div>
            <div className="text-[11px] font-mono text-foreground break-all leading-relaxed">
              {publicKey!.toBase58()}
            </div>
          </div>
          <div className="p-1">
            <button
              onClick={handleCopy}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-mono rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-all duration-150"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy address"}
            </button>
            <button
              onClick={() => { disconnect().catch(() => {}); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-mono rounded-lg text-rose-400/80 hover:text-rose-400 hover:bg-rose-400/[0.08] transition-all duration-150"
            >
              <LogOut className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
