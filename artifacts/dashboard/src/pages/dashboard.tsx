import { Link } from "wouter";
import { useGetStats, useListJobs } from "@workspace/api-client-react";
import { formatLamports, truncatePubkey, formatDate } from "@/lib/format";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
    completed: "text-primary border-primary/30 bg-primary/10",
    cancelled: "text-destructive border-destructive/30 bg-destructive/10",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border ${colors[status] ?? "text-muted-foreground border-border bg-muted"}`}
    >
      {status.toUpperCase()}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border border-border bg-card p-5 flex flex-col gap-1 hover:border-primary/30 transition-colors">
      <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{label}</span>
      <span className="text-3xl font-bold font-mono text-foreground">{value}</span>
      {sub && <span className="text-xs text-muted-foreground font-mono">{sub}</span>}
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetStats();
  const { data: jobs, isLoading: jobsLoading } = useListJobs();

  const recentJobs = jobs?.slice().reverse().slice(0, 10) ?? [];

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-border px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-mono tracking-tight">Dashboard</h1>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            Mappers Protocol — Autonomous On-Chain Escrow
          </p>
        </div>
        <Link
          href="/jobs/new"
          className="px-4 py-2 text-xs font-mono font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + NEW JOB
        </Link>
      </div>

      <div className="flex-1 p-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {statsLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="border border-border bg-card p-5 animate-pulse h-24" />
            ))
          ) : (
            <>
              <StatCard label="Total Jobs" value={stats?.total ?? 0} />
              <StatCard label="Pending" value={stats?.pending ?? 0} />
              <StatCard label="Completed" value={stats?.completed ?? 0} />
              <StatCard label="Cancelled" value={stats?.cancelled ?? 0} />
              <StatCard
                label="Escrowed SOL"
                value={`◎ ${formatLamports(stats?.totalEscrowedLamports ?? "0")}`}
                sub="in active escrow"
              />
            </>
          )}
        </div>

        {/* Program info */}
        <div className="border border-border bg-card px-5 py-3 flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground">PROGRAM ID</span>
          <span className="text-xs font-mono text-primary">
            52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu
          </span>
          <span className="ml-auto text-xs font-mono text-muted-foreground">DEVNET</span>
        </div>

        {/* Recent Jobs */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-mono font-bold text-muted-foreground uppercase tracking-widest">
              Recent Jobs
            </h2>
            <Link
              href="/jobs"
              className="text-xs font-mono text-primary hover:underline"
            >
              View all →
            </Link>
          </div>

          <div className="border border-border overflow-hidden">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left text-muted-foreground font-normal px-4 py-2 uppercase tracking-widest">Job ID</th>
                  <th className="text-left text-muted-foreground font-normal px-4 py-2 uppercase tracking-widest">Client</th>
                  <th className="text-left text-muted-foreground font-normal px-4 py-2 uppercase tracking-widest">Freelancer</th>
                  <th className="text-left text-muted-foreground font-normal px-4 py-2 uppercase tracking-widest">Amount</th>
                  <th className="text-left text-muted-foreground font-normal px-4 py-2 uppercase tracking-widest">Status</th>
                  <th className="text-left text-muted-foreground font-normal px-4 py-2 uppercase tracking-widest">Created</th>
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
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No jobs yet — create your first escrow to get started.
                    </td>
                  </tr>
                ) : (
                  recentJobs.map((job) => (
                    <tr
                      key={job.id}
                      className="border-b border-border hover:bg-accent/30 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <Link href={`/jobs/${job.jobId}`} className="text-primary hover:underline">
                          {job.jobId}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{truncatePubkey(job.clientPubkey)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{truncatePubkey(job.freelancerPubkey)}</td>
                      <td className="px-4 py-3">◎ {formatLamports(job.amountLamports)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(job.createdAt)}</td>
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
