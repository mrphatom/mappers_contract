import { Link } from "wouter";
import { ArrowUpRight, Zap } from "lucide-react";
import { useGetStats, useListJobs } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/status-badge";
import { JobCard } from "@/components/job-card";
import { formatLamports, truncatePubkey, formatDate } from "@/lib/format";

function StatCard({
  label,
  value,
  sub,
  accent,
  gradient,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  gradient?: "green" | "purple";
}) {
  const glowColor =
    gradient === "green"
      ? "hover:shadow-[0_8px_32px_rgba(20,241,149,0.12)] hover:border-emerald-500/25"
      : gradient === "purple"
      ? "hover:shadow-[0_8px_32px_rgba(153,69,255,0.12)] hover:border-purple-500/25"
      : "hover:shadow-[0_4px_24px_rgba(255,255,255,0.04)]";

  const topBorder =
    gradient === "green"
      ? "from-transparent via-emerald-500/40 to-transparent"
      : gradient === "purple"
      ? "from-transparent via-purple-500/40 to-transparent"
      : "from-transparent via-white/10 to-transparent";

  return (
    <div className={`group relative glass rounded-2xl p-5 transition-all duration-300 cursor-default hover:-translate-y-0.5 ${glowColor} overflow-hidden`}>
      {/* Top accent line */}
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${topBorder}`} />

      <span className="text-[9px] font-mono text-white/35 uppercase tracking-[0.15em] leading-none block mb-3">
        {label}
      </span>
      <span
        className={`text-2xl md:text-3xl font-bold font-mono leading-none block ${
          gradient === "green"
            ? "text-emerald-400"
            : gradient === "purple"
            ? "text-purple-400"
            : accent
            ? "text-emerald-400"
            : "text-white"
        }`}
      >
        {value}
      </span>
      {sub && (
        <span className="text-[9px] text-white/30 font-mono mt-2 block">{sub}</span>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="glass rounded-2xl p-5 shimmer">
      <div className="h-2 bg-white/[0.05] rounded-full w-14 mb-4" />
      <div className="h-7 bg-white/[0.08] rounded-full w-10" />
    </div>
  );
}

function PageHeader() {
  return (
    <div className="relative px-5 md:px-8 py-6 md:py-8 border-b border-white/[0.05] overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/[0.03] via-transparent to-purple-500/[0.03]" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[9px] font-mono text-emerald-400/70 uppercase tracking-widest">Live</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white leading-tight">
            Protocol Overview
          </h1>
          <p className="text-xs text-white/35 font-mono mt-1">
            Mappers — Autonomous On-Chain Escrow · Devnet
          </p>
        </div>
        <Link
          href="/jobs/new"
          className="shrink-0 group relative flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-bold rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 text-black hover:from-emerald-400 hover:to-emerald-300 active:scale-[0.97] transition-all duration-200 shadow-[0_0_24px_rgba(20,241,149,0.25)] hover:shadow-[0_0_32px_rgba(20,241,149,0.4)]"
        >
          <span>+ New Job</span>
        </Link>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetStats();
  const { data: jobs, isLoading: jobsLoading } = useListJobs();

  const recentJobs = Array.isArray(jobs) ? jobs.slice().reverse().slice(0, 10) : [];

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader />

      <div className="flex-1 p-5 md:p-8 space-y-8">
        {/* Stats grid */}
        <div>
          <p className="text-[9px] font-mono text-white/25 uppercase tracking-widest mb-4">Protocol Stats</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {statsLoading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
            ) : (
              <>
                <StatCard label="Total Jobs" value={stats?.total ?? 0} />
                <StatCard label="Pending" value={stats?.pending ?? 0} accent />
                <StatCard label="Completed" value={stats?.completed ?? 0} gradient="green" />
                <StatCard label="Cancelled" value={stats?.cancelled ?? 0} />
                <StatCard
                  label="Escrowed SOL"
                  value={`◎ ${formatLamports(stats?.totalEscrowedLamports ?? "0")}`}
                  sub="in active vaults"
                  gradient="purple"
                />
              </>
            )}
          </div>
        </div>

        {/* Program ID pill */}
        <div className="glass rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 overflow-hidden group hover:border-white/[0.12] transition-all duration-300">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(20,241,149,0.8)]" />
            <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">Program</span>
          </div>
          <span className="text-[11px] font-mono text-emerald-400/80 break-all leading-relaxed flex-1">
            52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu
          </span>
          <a
            href="https://explorer.solana.com/address/52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu?cluster=devnet"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1 text-[9px] font-mono text-white/20 hover:text-emerald-400/60 transition-colors shrink-0"
          >
            DEVNET <ArrowUpRight className="w-3 h-3" />
          </a>
        </div>

        {/* Recent jobs */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[9px] font-mono text-white/25 uppercase tracking-widest">Recent Jobs</p>
            <Link href="/jobs" className="flex items-center gap-1 text-[10px] font-mono text-emerald-400/60 hover:text-emerald-400 transition-colors">
              View all <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            {jobsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass rounded-2xl p-5 shimmer h-32" />
              ))
            ) : recentJobs.length === 0 ? (
              <div className="glass rounded-2xl px-6 py-12 text-center">
                <p className="text-sm text-white/30 font-mono mb-3">No jobs yet.</p>
                <Link href="/jobs/new" className="text-xs text-emerald-400 font-mono hover:text-emerald-300 transition-colors inline-flex items-center gap-1">
                  Create your first escrow <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
            ) : (
              recentJobs.map((job) => <JobCard key={job.id} job={job} />)
            )}
          </div>

          {/* Desktop: glass table */}
          <div className="hidden md:block glass rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/[0.05] bg-white/[0.02]">
                    {["Job ID", "Client", "Freelancer", "Amount", "Status", "Created"].map((h) => (
                      <th
                        key={h}
                        className="text-left text-[9px] text-white/25 font-normal px-5 py-3 uppercase tracking-[0.12em] whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jobsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-white/[0.04]">
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j} className="px-5 py-4">
                            <div className="h-2.5 bg-white/[0.05] rounded-full animate-pulse w-20" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : recentJobs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-14 text-center text-white/25">
                        No jobs yet — create your first escrow to get started.
                      </td>
                    </tr>
                  ) : (
                    recentJobs.map((job) => (
                      <tr
                        key={job.id}
                        className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.03] transition-colors group"
                      >
                        <td className="px-5 py-4">
                          <Link
                            href={`/jobs/${job.jobId}`}
                            className="text-emerald-400/80 hover:text-emerald-400 transition-colors inline-flex items-center gap-1 group-hover:gap-1.5"
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
                        <td className="px-5 py-4 text-emerald-400/70">◎ {formatLamports(job.amountLamports)}</td>
                        <td className="px-5 py-4">
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="px-5 py-4 text-white/25 whitespace-nowrap">
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
