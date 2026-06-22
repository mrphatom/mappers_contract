import { RefreshCw } from "lucide-react";
import { useGetOracleHealth, useGetStats } from "@workspace/api-client-react";
import { formatLamports } from "@/lib/format";

function StatusDot({ ok, loading }: { ok: boolean | null; loading: boolean }) {
  if (loading) return <div className="w-2 h-2 bg-muted animate-pulse rounded-none" />;
  if (ok === null) return <div className="w-2 h-2 bg-yellow-400" />;
  return (
    <div
      className={`w-2 h-2 ${ok ? "bg-primary animate-[pulse_2s_ease-in-out_infinite]" : "bg-destructive"}`}
    />
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border bg-card">
      <div className="px-4 py-2.5 border-b border-border bg-muted/30">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
          {title}
        </span>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 px-4 py-3">
      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest shrink-0 sm:w-40 sm:pt-0.5">
        {label}
      </span>
      <span
        className={`text-sm font-mono break-all leading-relaxed ${accent ? "text-primary" : "text-foreground"}`}
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

  const isUp =
    health?.status === "ok" || health?.status === "healthy";
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
      <div className="border-b border-border px-4 md:px-8 py-4 md:py-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg md:text-xl font-bold font-mono tracking-tight">Oracle Status</h1>
          <p className="text-[11px] text-muted-foreground font-mono mt-0.5 hidden sm:block">
            AI consensus middleware · Gemini + Claude dual-model verification
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono border border-border text-muted-foreground hover:text-foreground hover:border-border/80 active:bg-accent/30 disabled:opacity-50 transition-colors min-h-[40px]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Oracle health card */}
          <div className="border border-border bg-card">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                Oracle Middleware
              </span>
              <div className="flex items-center gap-2">
                <StatusDot
                  ok={healthLoading ? null : isUnreachable ? false : isUp ? true : null}
                  loading={healthLoading}
                />
                <span
                  className={`text-[10px] font-mono uppercase ${
                    healthLoading
                      ? "text-muted-foreground"
                      : isUnreachable
                      ? "text-destructive"
                      : isUp
                      ? "text-primary"
                      : "text-yellow-400"
                  }`}
                >
                  {statusLabel}
                </span>
              </div>
            </div>
            <div className="divide-y divide-border">
              <Row label="Status" value={statusLabel} accent={isUp} />
              <Row
                label="Pending Jobs"
                value={
                  healthLoading ? "—" : (health?.pendingJobs?.toString() ?? "—")
                }
                accent={(health?.pendingJobs ?? 0) > 0}
              />
              <Row
                label="Last Checked"
                value={
                  health?.timestamp
                    ? new Date(health.timestamp).toLocaleString()
                    : "—"
                }
              />
            </div>
          </div>

          {/* Offline banner */}
          {isUnreachable && (
            <div className="border border-destructive/30 bg-destructive/10 p-4 space-y-3">
              <p className="text-sm font-mono font-bold text-destructive">Oracle not reachable</p>
              <p className="text-xs font-mono text-destructive/80">
                Start the oracle middleware to enable AI verification:
              </p>
              <pre className="bg-background/50 border border-destructive/20 px-3 py-3 text-[10px] font-mono text-muted-foreground overflow-x-auto leading-relaxed">
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
          )}

          {/* Protocol info */}
          <Section title="Protocol">
            <Row label="Program ID" value="52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu" accent />
            <Row label="Network" value="Solana Devnet" />
            <Row label="Framework" value="Anchor 0.30 / SBF" />
            <Row label="PDA Seeds" value='"gig-escrow" (escrow)  ·  "vault" (vault)' />
          </Section>

          {/* Consensus thresholds */}
          <Section title="Consensus Thresholds">
            <Row label="Release" value="Both models ≥ 0.80 approval score" accent />
            <Row label="Refund" value="Both models ≥ 0.75 rejection score" />
            <Row label="Escalate" value="Divergent scores → human arbitration" />
            <Row label="Models" value="Gemini (Google) + Claude (Anthropic) — no knowledge sharing" />
          </Section>

          {/* Oracle endpoints */}
          <Section title="Oracle Endpoints">
            <Row label="GET /health" value="Liveness + pending job count" />
            <Row label="GET /jobs/:id" value="Fetch tracked job state" />
            <Row label="POST /submit" value="Trigger AI verification for a submitted deliverable" />
          </Section>

          {/* Protocol stats */}
          {stats && (
            <Section title="Protocol Stats">
              <Row label="Total Jobs" value={stats.total.toString()} />
              <Row label="Pending" value={stats.pending.toString()} />
              <Row label="Completed" value={stats.completed.toString()} accent />
              <Row label="Cancelled" value={stats.cancelled.toString()} />
              <Row
                label="Escrowed SOL"
                value={`◎ ${formatLamports(stats.totalEscrowedLamports)}`}
                accent
              />
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
