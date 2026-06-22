import { useState } from "react";
import { Link } from "wouter";
import { useListJobs } from "@workspace/api-client-react";
import { formatLamports, truncatePubkey, formatDate } from "@/lib/format";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
    completed: "text-primary border-primary/30 bg-primary/10",
    cancelled: "text-destructive border-destructive/30 bg-destructive/10",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border ${colors[status] ?? "text-muted-foreground border-border"}`}>
      {status.toUpperCase()}
    </span>
  );
}

type StatusFilter = "all" | "pending" | "completed" | "cancelled";

export default function Jobs() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const { data: jobs, isLoading } = useListJobs(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );

  const filtered = (jobs ?? []).filter((job) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      job.jobId.toLowerCase().includes(q) ||
      job.clientPubkey.toLowerCase().includes(q) ||
      job.freelancerPubkey.toLowerCase().includes(q)
    );
  });

  const statusTabs: StatusFilter[] = ["all", "pending", "completed", "cancelled"];

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-border px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-mono tracking-tight">All Jobs</h1>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            {filtered.length} job{filtered.length !== 1 ? "s" : ""} found
          </p>
        </div>
        <Link
          href="/jobs/new"
          className="px-4 py-2 text-xs font-mono font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + NEW JOB
        </Link>
      </div>

      <div className="px-8 py-4 border-b border-border flex items-center gap-4 flex-wrap">
        {/* Status tabs */}
        <div className="flex border border-border">
          {statusTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-4 py-1.5 text-xs font-mono uppercase tracking-widest border-r border-border last:border-r-0 transition-colors ${
                statusFilter === tab
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="search"
          placeholder="Search job ID or pubkey..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 text-xs font-mono bg-input border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 w-72 transition-colors"
        />
      </div>

      <div className="flex-1 p-8">
        <div className="border border-border overflow-hidden">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left text-muted-foreground font-normal px-4 py-2 uppercase tracking-widest">Job ID</th>
                <th className="text-left text-muted-foreground font-normal px-4 py-2 uppercase tracking-widest">Client</th>
                <th className="text-left text-muted-foreground font-normal px-4 py-2 uppercase tracking-widest">Freelancer</th>
                <th className="text-left text-muted-foreground font-normal px-4 py-2 uppercase tracking-widest">Oracle</th>
                <th className="text-right text-muted-foreground font-normal px-4 py-2 uppercase tracking-widest">Amount (SOL)</th>
                <th className="text-left text-muted-foreground font-normal px-4 py-2 uppercase tracking-widest">Status</th>
                <th className="text-left text-muted-foreground font-normal px-4 py-2 uppercase tracking-widest">Created</th>
                <th className="text-left text-muted-foreground font-normal px-4 py-2 uppercase tracking-widest"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-3 bg-muted animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="text-muted-foreground">No jobs match your filter.</div>
                    <Link href="/jobs/new" className="text-primary text-xs mt-2 inline-block hover:underline">
                      Create a new escrow job
                    </Link>
                  </td>
                </tr>
              ) : (
                filtered.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-border hover:bg-accent/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/jobs/${job.jobId}`} className="text-primary hover:underline">
                        {job.jobId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" title={job.clientPubkey}>
                      {truncatePubkey(job.clientPubkey)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" title={job.freelancerPubkey}>
                      {truncatePubkey(job.freelancerPubkey)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" title={job.oraclePubkey}>
                      {truncatePubkey(job.oraclePubkey)}
                    </td>
                    <td className="px-4 py-3 text-right">◎ {formatLamports(job.amountLamports)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(job.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/jobs/${job.jobId}`}
                        className="text-muted-foreground hover:text-primary transition-colors"
                      >
                        →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
