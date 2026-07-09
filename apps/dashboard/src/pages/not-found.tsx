import { Link } from "wouter";
import { AlertCircle, ChevronLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="glass rounded-2xl px-8 py-14 max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-5">
          <AlertCircle className="w-7 h-7 text-rose-400" />
        </div>
        <div className="text-[9px] font-mono text-rose-400/60 uppercase tracking-widest mb-2">404</div>
        <h1 className="text-xl font-bold text-white mb-3 tracking-tight">Page Not Found</h1>
        <p className="text-xs text-white/35 font-mono mb-8 leading-relaxed">
          This route doesn't exist. Check the URL or head back to the dashboard.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          <ChevronLeft className="w-3 h-3" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
