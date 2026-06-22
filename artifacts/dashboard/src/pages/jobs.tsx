import { useState } from "react";
import { Link } from "wouter";
import { Search } from "lucide-react";
import { useListJobs } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/status-badge";
import { JobCard } from "@/components/job-card";
import { formatLamports, truncatePubkey, formatDate } from "@/lib/format";

type StatusFilter = "all" | "pending" | "completed" | "cancelled";

const STATUS_TABS: StatusFilter[] = ["all", "pending", "completed", "cancelled"];

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

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 md:px-8 py-4 md:py-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg md:text-xl font-bold font-mono tracking-tight">All Jobs</h1>
          <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
            {filtered.length} job{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/jobs/new"
          className="shrink-0 px-3 md:px-4 py-2 text-xs font-mono font-bold bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 transition-colors"
        >
          + New Job
        </Link>
      </div>

      {/* Filters */}
      <div className="border-b border-border px-4 md:px-8 py-3 space-y-3">
        {/* Status tabs — scrollable on small screens */}
        <div className="flex overflow-x-auto gap-0 border border-border w-fit max-w-full scrollbar-none">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`shrink-0 px-3 md:px-4 py-2 text-[10px] md:text-xs font-mono uppercase tracking-widest border-r border-border last:border-r-0 transition-colors min-h-[36px] ${
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
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Search job ID or pubkey…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-input border border-border text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 transition-colors min-h-[40px]"
          />
        </div>
      </div>

      {/* Mobile: card list */}
      <div className="md:hidden flex-1 p-4 space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="border border-border bg-card p-4 animate-pulse h-32" />
          ))
        ) : filtered.length === 0 ? (
          <div className="border border-border bg-card px-4 py-16 text-center">
            <p className="text-sm text-muted-foreground font-mono">No jobs found.</p>
            <Link href="/jobs/new" className="text-xs text-primary font-mono mt-2 inline-block">
              Create a new escrow job →
            </Link>
          </div>
        ) : (
          filtered.map((job) => <JobCard key={job.id} job={job} />)
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block flex-1 p-8">
        <div className="border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {["Job ID", "Client", "Freelancer", "Oracle", "Amount (SOL)", "Status", "Created", ""].map(
                    (h, i) => (
                      <th
                        key={i}
                        className={`font-normal px-4 py-2 uppercase tracking-widest text-muted-foreground whitespace-nowrap ${
                          h === "Amount (SOL)" ? "text-right" : "text-left"
                        }`}
                      >
                        {h}
                      </th>
                    )
                  )}
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
                      <div className="text-muted-foreground mb-2">No jobs match your filter.</div>
                      <Link
                        href="/jobs/new"
                        className="text-primary text-xs hover:underline"
                      >
                        Create a new escrow job
                      </Link>
                    </td>
                  </tr>
                ) : (
                  filtered.map((job) => (
                    <tr
                      key={job.id}
                      className="border-b border-border last:border-b-0 hover:bg-accent/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/jobs/${job.jobId}`}
                          className="text-primary hover:underline"
                        >
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
                      <td className="px-4 py-3 text-right">
                        ◎ {formatLamports(job.amountLamports)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(job.createdAt)}
                      </td>
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
    </div>
  );
}
