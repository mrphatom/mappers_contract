import { Link } from "wouter";
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
      <div className="border border-border bg-card p-4 hover:border-primary/30 hover:bg-accent/20 active:bg-accent/40 transition-all cursor-pointer">
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className="text-sm font-mono font-bold text-primary leading-tight">{job.jobId}</span>
          <StatusBadge status={job.status} />
        </div>
        {job.description && (
          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{job.description}</p>
        )}
        <div className="grid grid-cols-2 gap-y-1.5 text-xs font-mono">
          <span className="text-muted-foreground">Client</span>
          <span className="text-right" title={job.clientPubkey}>{truncatePubkey(job.clientPubkey)}</span>
          <span className="text-muted-foreground">Freelancer</span>
          <span className="text-right" title={job.freelancerPubkey}>{truncatePubkey(job.freelancerPubkey)}</span>
          <span className="text-muted-foreground">Amount</span>
          <span className="text-right font-semibold">◎ {formatLamports(job.amountLamports)}</span>
        </div>
        <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground font-mono">{formatDate(job.createdAt)}</span>
          <span className="text-xs text-primary font-mono">View →</span>
        </div>
      </div>
    </Link>
  );
}
