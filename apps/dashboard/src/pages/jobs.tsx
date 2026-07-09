import { useState } from "react";
import { Link } from "wouter";
import { Search, ArrowUpRight, SlidersHorizontal } from "lucide-react";
import { useListJobs } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/status-badge";
import { JobCard } from "@/components/job-card";
import { formatLamports, truncatePubkey, formatDate } from "@/lib/format";

type StatusFilter = "all" | "pending" | "completed" | "cancelled";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all",       label: "All" },
  { value: "pending",   label: "Pending" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const TAB_COLORS: Record<StatusFilter, string> = {
  all:       "bg-white/10 text-white border-white/20",
  pending:   "bg-amber-400/15 text-amber-300 border-amber-400/30 shadow-[0_0_12px_rgba(251,191,36,0.1)]",
  completed: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30 shadow-[0_0_12px_rgba(20,241,149,0.1)]",
  cancelled: "bg-rose-400/15 text-rose-300 border-rose-400/30 shadow-[0_0_12px_rgba(244,63,94,0.1)]",
};

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
      <div className="relative px-5 md:px-8 py-6 md:py-7 border-b border-white/[0.05] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/[0.02] via-transparent to-emerald-500/[0.02]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">All Jobs</h1>
            <p className="text-[10px] text-white/30 font-mono mt-1">
              {isLoading ? "Loading…" : `${filtered.length} escrow${filtered.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <Link
            href="/jobs/new"
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-bold rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 text-black hover:from-emerald-400 hover:to-emerald-300 active:scale-[0.97] transition-all duration-200 shadow-[0_0_24px_rgba(20,241,149,0.2)]"
          >
            + New Job
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="px-5 md:px-8 py-4 border-b border-white/[0.05] space-y-3">
        {/* Status filter pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <SlidersHorizontal className="w-3.5 h-3.5 text-white/20 shrink-0" />
          {STATUS_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`px-3.5 py-1.5 text-[10px] font-mono font-medium tracking-wide rounded-full border transition-all duration-200 ${
                statusFilter === value
                  ? TAB_COLORS[value]
                  : "bg-white/[0.03] text-white/30 border-white/[0.07] hover:bg-white/[0.06] hover:text-white/60"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" />
          <input
            type="search"
            placeholder="Search by job ID, client, or freelancer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-xs font-mono glass rounded-xl placeholder:text-white/20 text-white/80 outline-none focus:border-emerald-500/30 focus:shadow-[0_0_16px_rgba(20,241,149,0.06)] transition-all duration-200 min-h-[40px]"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass rounded-2xl p-5 shimmer h-36" />
            ))
          ) : filtered.length === 0 ? (
            <div className="glass rounded-2xl px-6 py-14 text-center">
              <p className="text-sm text-white/30 font-mono mb-2">
                {search ? "No jobs match your search." : "No jobs yet."}
              </p>
              {!search && (
                <Link href="/jobs/new" className="text-xs text-emerald-400 font-mono hover:text-emerald-300 transition-colors inline-flex items-center gap-1">
                  Create your first escrow <ArrowUpRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          ) : (
            filtered.map((job) => <JobCard key={job.id} job={job} />)
          )}
        </div>

        {/* Desktop glass table */}
        <div className="hidden md:block glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-white/[0.05] bg-white/[0.02]">
                  {["Job ID", "Client", "Freelancer", "Amount", "Status", "Created", ""].map((h) => (
                    <th
                      key={h}
                      className="text-left text-[9px] text-white/25 font-normal px-5 py-3.5 uppercase tracking-[0.12em] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-white/[0.04]">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-5 py-4">
                          <div className="h-2.5 bg-white/[0.05] rounded-full animate-pulse" style={{ width: `${40 + (j * 17) % 40}px` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center text-white/25">
                      {search ? "No jobs match your search." : "No jobs yet — create your first escrow."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((job) => (
                    <tr
                      key={job.id}
                      className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.03] transition-colors group"
                    >
                      <td className="px-5 py-4">
                        <Link
                          href={`/jobs/${job.escrowPubkey}`}
                          className="text-emerald-400/80 hover:text-emerald-400 transition-colors font-semibold"
                        >
                          {job.jobId}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-white/35" title={job.clientPubkey}>
                        {truncatePubkey(job.clientPubkey)}
                      </td>
                      <td className="px-5 py-4 text-white/35" title={job.freelancerPubkey}>
                        {truncatePubkey(job.freelancerPubkey)}
                      </td>
                      <td className="px-5 py-4 text-emerald-400/70 font-semibold">
                        ◎ {formatLamports(job.amountLamports)}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-5 py-4 text-white/25 whitespace-nowrap">
                        {formatDate(job.createdAt)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/jobs/${job.escrowPubkey}`}
                          className="inline-flex items-center gap-1 text-[10px] text-white/20 group-hover:text-emerald-400/60 transition-colors"
                        >
                          View <ArrowUpRight className="w-3 h-3" />
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
