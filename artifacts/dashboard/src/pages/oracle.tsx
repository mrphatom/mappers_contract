import { useGetOracleHealth, useGetStats } from "@workspace/api-client-react";

function Field({ label, value, mono = true, accent = false }: { label: string; value: React.ReactNode; mono?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-border last:border-b-0">
      <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest w-44 shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm break-all ${mono ? "font-mono" : ""} ${accent ? "text-primary" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

export default function Oracle() {
  const { data: health, isLoading: healthLoading, error: healthError, refetch } = useGetOracleHealth({
    query: { refetchInterval: 15000 },
  });
  const { data: stats } = useGetStats();

  const isUp = health?.status === "ok" || health?.status === "healthy";
  const isUnreachable = !!healthError || health?.status === "unreachable";

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-border px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-mono tracking-tight">Oracle Status</h1>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            AI consensus middleware · Gemini + Claude dual-model verification
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="px-4 py-1.5 text-xs font-mono border border-border text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="flex-1 p-8 space-y-8 max-w-3xl">
        {/* Oracle health card */}
        <div className="border border-border bg-card">
          <div className="px-4 py-2 border-b border-border bg-muted/40 flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Oracle Middleware</span>
            <div className="flex items-center gap-2">
              {healthLoading ? (
                <div className="w-2 h-2 bg-muted animate-pulse" />
              ) : isUnreachable ? (
                <>
                  <div className="w-2 h-2 bg-destructive" />
                  <span className="text-xs font-mono text-destructive">OFFLINE</span>
                </>
              ) : isUp ? (
                <>
                  <div className="w-2 h-2 bg-primary animate-pulse" />
                  <span className="text-xs font-mono text-primary">ONLINE</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-yellow-400" />
                  <span className="text-xs font-mono text-yellow-400">DEGRADED</span>
                </>
              )}
            </div>
          </div>
          <div className="px-4">
            <Field
              label="Status"
              value={
                healthLoading ? "Checking..." :
                isUnreachable ? "Unreachable — start the oracle middleware" :
                health?.status ?? "Unknown"
              }
              accent={isUp}
            />
            <Field
              label="Pending Jobs"
              value={healthLoading ? "—" : health?.pendingJobs?.toString() ?? "—"}
              accent={(health?.pendingJobs ?? 0) > 0}
            />
            <Field
              label="Last Checked"
              value={health?.timestamp ? new Date(health.timestamp).toLocaleString() : "—"}
            />
          </div>
        </div>

        {isUnreachable && (
          <div className="border border-destructive/30 bg-destructive/10 px-5 py-4 text-sm font-mono text-destructive space-y-2">
            <div className="font-bold">Oracle is not reachable</div>
            <div className="text-xs text-destructive/80 space-y-1">
              <div>Start the oracle middleware to enable AI verification:</div>
              <pre className="bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs mt-2 overflow-x-auto">
{`cd oracle
npm install
cp .env.example .env
# Fill in SOLANA_RPC_URL, PROGRAM_ID, ORACLE_PRIVATE_KEY,
# HELIUS_GRPC_ENDPOINT, HELIUS_API_KEY,
# GEMINI_API_KEY, ANTHROPIC_API_KEY
npm run dev`}
              </pre>
            </div>
          </div>
        )}

        {/* Protocol info */}
        <div className="border border-border bg-card">
          <div className="px-4 py-2 border-b border-border bg-muted/40">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Protocol</span>
          </div>
          <div className="px-4">
            <Field label="Program ID" value="52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu" accent />
            <Field label="Network" value="Solana Devnet" />
            <Field label="Framework" value="Anchor 0.30 / SBF" />
            <Field label="PDA Seeds" value='"gig-escrow" (escrow)  |  "vault" (vault)' />
          </div>
        </div>

        {/* AI Consensus thresholds */}
        <div className="border border-border bg-card">
          <div className="px-4 py-2 border-b border-border bg-muted/40">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Consensus Thresholds</span>
          </div>
          <div className="px-4">
            <Field label="Release (payment)" value="Both models ≥ 0.80 approval score" />
            <Field label="Refund (reject)" value="Both models ≥ 0.75 rejection score" />
            <Field label="Escalate" value="Divergent scores → human arbitration" />
            <Field label="Models" value="Gemini (Google) + Claude (Anthropic) — no knowledge sharing" />
          </div>
        </div>

        {/* Oracle endpoints */}
        <div className="border border-border bg-card">
          <div className="px-4 py-2 border-b border-border bg-muted/40">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Oracle Endpoints</span>
          </div>
          <div className="px-4">
            <Field label="GET /health" value="Liveness + pending job count" />
            <Field label="GET /jobs/:jobId" value="Fetch tracked job state" />
            <Field label="POST /submit" value="Trigger AI verification for a submitted deliverable" />
          </div>
        </div>

        {/* Stats summary */}
        {stats && (
          <div className="border border-border bg-card">
            <div className="px-4 py-2 border-b border-border bg-muted/40">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Protocol Stats</span>
            </div>
            <div className="px-4">
              <Field label="Total Jobs" value={stats.total.toString()} />
              <Field label="Pending" value={stats.pending.toString()} />
              <Field label="Completed" value={stats.completed.toString()} accent />
              <Field label="Cancelled" value={stats.cancelled.toString()} />
              <Field label="Escrowed SOL" value={`◎ ${(Number(stats.totalEscrowedLamports) / 1e9).toFixed(4)}`} accent />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
