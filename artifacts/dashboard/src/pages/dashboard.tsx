import { Link } from "wouter";
import { useGetStats, useListJobs } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/status-badge";
import { JobCard } from "@/components/job-card";
import { formatLamports, truncatePubkey, formatDate } from "@/lib/format";

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="border border-border bg-card p-4 flex flex-col gap-1 hover:border-primary/20 transition-colors">
      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest leading-none">
        {label}
      </span>
      <span
        className={`text-2xl md:text-3xl font-bold font-mono leading-tight mt-1 ${accent ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </span>
      {sub && (
        <span className="text-[10px] text-muted-foreground font-mono">{sub}</span>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="border border-border bg-card p-4 animate-pulse">
      <div className="h-2.5 bg-muted w-16 mb-3" />
      <div className="h-7 bg-muted w-12" />
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetStats();
  const { data: jobs, isLoading: jobsLoading } = useListJobs();

  const recentJobs = jobs?.slice().reverse().slice(0, 10) ?? [];

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 md:px-8 py-4 md:py-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg md:text-xl font-bold font-mono tracking-tight">Dashboard</h1>
          <p className="text-[11px] text-muted-foreground font-mono mt-0.5 hidden sm:block">
            Mappers Protocol — Autonomous On-Chain Escrow
          </p>
        </div>
        <Link
          href="/jobs/new"
          className="shrink-0 px-3 md:px-4 py-2 text-xs font-mono font-bold bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 transition-colors"
        >
          + New Job
        </Link>
      </div>

      <div className="flex-1 p-4 md:p-8 space-y-6 md:space-y-8">
        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          {statsLoading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <StatCard label="Total Jobs" value={stats?.total ?? 0} />
              <StatCard label="Pending" value={stats?.pending ?? 0} />
              <StatCard label="Completed" value={stats?.completed ?? 0} accent />
              <StatCard label="Cancelled" value={stats?.cancelled ?? 0} />
              <StatCard
                label="Escrowed SOL"
                value={`◎ ${formatLamports(stats?.totalEscrowedLamports ?? "0")}`}
                sub="in active escrow"
                accent
              />
            </>
          )}
        </div>

        {/* Program ID pill */}
        <div className="border border-border bg-card px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 overflow-hidden">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest shrink-0">
            Program ID
          </span>
          <span className="text-[11px] font-mono text-primary break-all leading-relaxed">
            52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu
          </span>
          <span className="hidden sm:block ml-auto text-[10px] font-mono text-muted-foreground shrink-0">
            DEVNET
          </span>
        </div>

        {/* Recent jobs */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-widest">
              Recent Jobs
            </h2>
            <Link href="/jobs" className="text-xs font-mono text-primary hover:underline">
              View all →
            </Link>
          </div>

          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            {jobsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="border border-border bg-card p-4 animate-pulse h-28" />
              ))
            ) : recentJobs.length === 0 ? (
              <div className="border border-border bg-card px-4 py-10 text-center">
                <p className="text-sm text-muted-foreground font-mono">No jobs yet.</p>
                <Link href="/jobs/new" className="text-xs text-primary font-mono mt-2 inline-block">
                  Create your first escrow →
                </Link>
              </div>
            ) : (
              recentJobs.map((job) => <JobCard key={job.id} job={job} />)
            )}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {["Job ID", "Client", "Freelancer", "Amount", "Status", "Created"].map((h) => (
                      <th
                        key={h}
                        className="text-left text-muted-foreground font-normal px-4 py-2 uppercase tracking-widest whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jobsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-3 bg-muted animate-pulse w-20" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : recentJobs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                        No jobs yet — create your first escrow to get started.
                      </td>
                    </tr>
                  ) : (
                    recentJobs.map((job) => (
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
                        <td className="px-4 py-3">◎ {formatLamports(job.amountLamports)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {formatDate(job.createdAt)}
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
    </div>
  );
}
