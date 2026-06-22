import { useState, useRef, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Wallet, ChevronDown, LogOut, Copy, Check } from "lucide-react";

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
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
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
        className={`flex items-center gap-2 font-mono text-xs border border-primary/40 text-primary hover:bg-primary/10 active:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          compact
            ? "px-3 py-1.5 min-h-[36px]"
            : "w-full px-3 py-2.5 min-h-[40px]"
        }`}
      >
        <Wallet className="w-3.5 h-3.5 shrink-0" />
        {connecting ? "Connecting…" : compact ? "Connect" : "Connect Wallet"}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 font-mono text-xs border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 active:bg-primary/30 transition-colors ${
          compact
            ? "px-3 py-1.5 min-h-[36px]"
            : "w-full px-3 py-2.5 min-h-[40px]"
        }`}
      >
        <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
        <span className="truncate">{truncate(publicKey!.toBase58())}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border shadow-xl z-50 py-1 min-w-[180px]">
          <div className="px-3 py-2 border-b border-border">
            <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mb-0.5">Connected</div>
            <div className="text-[11px] font-mono text-foreground break-all">{publicKey!.toBase58()}</div>
          </div>
          <button
            onClick={handleCopy}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy address"}
          </button>
          <button
            onClick={() => { disconnect().catch(() => {}); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
