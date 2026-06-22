import { RefreshCw, Activity, Cpu, Network, BarChart3 } from "lucide-react";
import { useGetOracleHealth, useGetStats } from "@workspace/api-client-react";
import { formatLamports } from "@/lib/format";

function StatusOrb({ ok, loading }: { ok: boolean | null; loading: boolean }) {
  if (loading) return (
    <div className="relative">
      <div className="w-3 h-3 rounded-full bg-white/20 animate-pulse" />
    </div>
  );
  if (ok === null) return (
    <div className="relative">
      <div className="absolute inset-0 rounded-full bg-amber-400/30 animate-ping" />
      <div className="w-3 h-3 rounded-full bg-amber-400" />
    </div>
  );
  return (
    <div className="relative">
      {ok && <div className="absolute inset-0 rounded-full bg-emerald-400/40 animate-ping" />}
      <div className={`w-3 h-3 rounded-full ${ok ? "bg-emerald-400 shadow-[0_0_10px_rgba(20,241,149,0.6)]" : "bg-rose-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"}`} />
    </div>
  );
}

function GlassPanel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-white/[0.05] bg-white/[0.02] flex items-center gap-2.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-white/30" />}
        <span className="text-[9px] font-mono text-white/30 uppercase tracking-[0.15em]">{title}</span>
      </div>
      <div className="divide-y divide-white/[0.04]">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
  mono = true,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-6 px-5 py-3.5 group hover:bg-white/[0.02] transition-colors">
      <span className="text-[9px] font-mono text-white/25 uppercase tracking-widest shrink-0 sm:w-36 sm:pt-0.5">
        {label}
      </span>
      <span
        className={`text-xs break-all leading-relaxed ${mono ? "font-mono" : ""} ${
          accent ? "text-emerald-400" : "text-white/60"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default function Oracle() {
  const {
    data: health,
    isLoading: healthLoading,
    error: healthError,
    refetch,
    isFetching,
  } = useGetOracleHealth({
    query: { refetchInterval: 15_000, queryKey: ["oracle-health"] },
  });
  const { data: stats } = useGetStats();

  const isUp = health?.status === "ok" || health?.status === "healthy";
  const isUnreachable = !!healthError || health?.status === "unreachable";

  const statusLabel = healthLoading
    ? "Checking…"
    : isUnreachable
    ? "Unreachable"
    : isUp
    ? "Online"
    : "Degraded";

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="relative px-5 md:px-8 py-6 md:py-7 border-b border-white/[0.05] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/[0.03] via-transparent to-emerald-500/[0.02]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Oracle Status</h1>
            <p className="text-[10px] text-white/30 font-mono mt-1">
              AI consensus middleware · Gemini + Claude dual-model verification
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="group flex items-center gap-2 px-4 py-2.5 text-xs font-mono glass rounded-xl text-white/40 hover:text-white/80 hover:border-white/15 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-300"}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        <div className="max-w-2xl mx-auto space-y-5">

          {/* Big status card */}
          <div className={`relative glass rounded-2xl overflow-hidden transition-all duration-500 ${
            isUp ? "hover:shadow-[0_8px_40px_rgba(20,241,149,0.1)]" : ""
          }`}>
            {isUp && <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />}
            {isUnreachable && <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rose-500/40 to-transparent" />}

            <div className="px-5 py-3.5 border-b border-white/[0.05] bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Activity className="w-3.5 h-3.5 text-white/30" />
                <span className="text-[9px] font-mono text-white/30 uppercase tracking-[0.15em]">Oracle Middleware</span>
              </div>
              <div className="flex items-center gap-2.5">
                <StatusOrb
                  ok={healthLoading ? null : isUnreachable ? false : isUp ? true : null}
                  loading={healthLoading}
                />
                <span className={`text-[10px] font-mono font-semibold uppercase tracking-wide ${
                  healthLoading ? "text-white/25"
                  : isUnreachable ? "text-rose-400"
                  : isUp ? "text-emerald-400"
                  : "text-amber-400"
                }`}>
                  {statusLabel}
                </span>
              </div>
            </div>
            <div className="divide-y divide-white/[0.04]">
              <Row label="Status" value={statusLabel} accent={isUp} />
              <Row
                label="Pending Jobs"
                value={healthLoading ? "—" : (health?.pendingJobs?.toString() ?? "—")}
                accent={(health?.pendingJobs ?? 0) > 0}
              />
              <Row
                label="Last Checked"
                value={health?.timestamp ? new Date(health.timestamp).toLocaleString() : "—"}
              />
            </div>
          </div>

          {/* Offline banner */}
          {isUnreachable && (
            <div className="glass rounded-2xl overflow-hidden border-rose-500/20">
              <div className="px-5 py-3.5 border-b border-rose-500/20 bg-rose-500/[0.06]">
                <p className="text-xs font-mono font-bold text-rose-400">Oracle not reachable</p>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-xs font-mono text-rose-400/60">
                  Start the oracle middleware to enable AI verification:
                </p>
                <pre className="bg-black/40 rounded-xl px-4 py-4 text-[10px] font-mono text-white/40 overflow-x-auto leading-relaxed border border-white/[0.05]">
{`cd oracle
npm install
cp .env.example .env
# Fill SOLANA_RPC_URL, PROGRAM_ID,
# ORACLE_PRIVATE_KEY, HELIUS_GRPC_ENDPOINT,
# HELIUS_API_KEY, GEMINI_API_KEY,
# ANTHROPIC_API_KEY
npm run dev`}
                </pre>
              </div>
            </div>
          )}

          {/* Protocol info */}
          <GlassPanel title="Protocol" icon={Network}>
            <Row label="Program ID" value="52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu" accent />
            <Row label="Network" value="Solana Devnet" />
            <Row label="Framework" value="Anchor 0.30 / SBF" />
            <Row label="PDA Seeds" value='"gig-escrow" (escrow)  ·  "vault" (vault)' />
          </GlassPanel>

          {/* Consensus thresholds */}
          <GlassPanel title="Consensus Thresholds" icon={Cpu}>
            <Row label="Release" value="Both models ≥ 0.80 approval score" accent />
            <Row label="Refund" value="Both models ≥ 0.75 rejection score" />
            <Row label="Escalate" value="Divergent scores → human arbitration" />
            <Row label="Models" value="Gemini (Google) + Claude (Anthropic) — no knowledge sharing" />
          </GlassPanel>

          {/* Oracle endpoints */}
          <GlassPanel title="Oracle Endpoints" icon={Activity}>
            <Row label="GET /health" value="Liveness + pending job count" />
            <Row label="GET /jobs/:id" value="Fetch tracked job state" />
            <Row label="POST /submit" value="Trigger AI verification for a deliverable" />
          </GlassPanel>

          {/* Protocol stats */}
          {stats && (
            <GlassPanel title="Protocol Stats" icon={BarChart3}>
              <Row label="Total Jobs" value={stats.total.toString()} />
              <Row label="Pending" value={stats.pending.toString()} />
              <Row label="Completed" value={stats.completed.toString()} accent />
              <Row label="Cancelled" value={stats.cancelled.toString()} />
              <Row
                label="Escrowed SOL"
                value={`◎ ${formatLamports(stats.totalEscrowedLamports)}`}
                accent
              />
            </GlassPanel>
          )}
        </div>
      </div>
    </div>
  );
}
