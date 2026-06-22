import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { formatLamports, truncatePubkey, formatDate } from "@/lib/format";

interface Job {
  id: number;
  jobId: string;
  clientPubkey: string;
  freelancerPubkey: string;
  amountLamports: string;
  status: string;
  description?: string | null;
  createdAt: string;
}

export function JobCard({ job }: { job: Job }) {
  return (
    <Link href={`/jobs/${job.jobId}`}>
      <div className="group relative glass rounded-2xl p-5 glass-hover transition-all duration-300 cursor-pointer hover:shadow-[0_8px_32px_rgba(20,241,149,0.08)] hover:-translate-y-0.5 overflow-hidden">
        {/* Subtle gradient accent line */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <div className="flex items-start justify-between gap-3 mb-3">
          <span className="text-sm font-mono font-bold text-emerald-400 leading-tight tracking-tight">
            {job.jobId}
          </span>
          <StatusBadge status={job.status} />
        </div>

        {job.description && (
          <p className="text-xs text-muted-foreground mb-4 line-clamp-2 leading-relaxed">
            {job.description}
          </p>
        )}

        <div className="grid grid-cols-2 gap-y-2 text-xs font-mono">
          <span className="text-muted-foreground/60">Client</span>
          <span className="text-right text-foreground/80" title={job.clientPubkey}>
            {truncatePubkey(job.clientPubkey)}
          </span>
          <span className="text-muted-foreground/60">Freelancer</span>
          <span className="text-right text-foreground/80" title={job.freelancerPubkey}>
            {truncatePubkey(job.freelancerPubkey)}
          </span>
          <span className="text-muted-foreground/60">Amount</span>
          <span className="text-right font-semibold text-emerald-400">
            ◎ {formatLamports(job.amountLamports)}
          </span>
        </div>

        <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground/50 font-mono">{formatDate(job.createdAt)}</span>
          <span className="flex items-center gap-1 text-[11px] text-emerald-400/70 group-hover:text-emerald-400 font-mono transition-colors duration-200">
            View <ArrowUpRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}
