import { useState } from "react";
import { useParams } from "wouter";
import {
  useGetJob,
  useSubmitDeliverable,
  useUpdateJob,
  getGetJobQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatLamports, truncatePubkey, formatDate } from "@/lib/format";

type DeliverableType = "url" | "ipfs" | "text" | "json";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
    completed: "text-primary border-primary/30 bg-primary/10",
    cancelled: "text-destructive border-destructive/30 bg-destructive/10",
  };
  return (
    <span className={`inline-flex items-center px-3 py-1 text-sm font-mono border ${colors[status] ?? "text-muted-foreground border-border"}`}>
      {status.toUpperCase()}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return null;
  const colors: Record<string, string> = {
    RELEASE: "text-primary border-primary/30 bg-primary/10",
    REFUND: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
    ESCALATE: "text-secondary border-secondary/30 bg-secondary/10",
  };
  return (
    <div className={`border px-6 py-4 text-center font-mono ${colors[outcome] ?? "border-border"}`}>
      <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Oracle Verdict</div>
      <div className="text-2xl font-bold">{outcome}</div>
      {outcome === "RELEASE" && <div className="text-xs mt-1 text-muted-foreground">Payment released to freelancer</div>}
      {outcome === "REFUND" && <div className="text-xs mt-1 text-muted-foreground">Funds returned to client</div>}
      {outcome === "ESCALATE" && <div className="text-xs mt-1 text-muted-foreground">Models diverged — human arbitration required</div>}
    </div>
  );
}

function InfoRow({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-border last:border-b-0">
      <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest w-36 shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

const INPUT =
  "w-full px-3 py-2 text-sm font-mono bg-input border border-border text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 transition-colors";

export default function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const qc = useQueryClient();

  const { data: job, isLoading, error } = useGetJob(jobId ?? "", {
    query: { enabled: !!jobId },
  });

  const submitDeliverable = useSubmitDeliverable();
  const updateJob = useUpdateJob();

  const [deliverableType, setDeliverableType] = useState<DeliverableType>("url");
  const [deliverable, setDeliverable] = useState("");
  const [desc, setDesc] = useState("");
  const [criteria, setCriteria] = useState<string[]>([""]);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const addCriterion = () => setCriteria((c) => [...c, ""]);
  const removeCriterion = (i: number) => setCriteria((c) => c.filter((_, idx) => idx !== i));
  const setCriterion = (i: number, val: string) => setCriteria((c) => c.map((v, idx) => (idx === i ? val : v)));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setOutcome(null);

    submitDeliverable.mutate(
      {
        jobId: jobId ?? "",
        data: {
          description: desc || job?.description || "",
          acceptanceCriteria: criteria.filter((c) => c.trim() !== ""),
          deliverable,
          deliverableType,
        },
      },
      {
        onSuccess: (result) => {
          setOutcome(result.outcome ?? null);
          setSubmitted(true);
          qc.invalidateQueries({ queryKey: getGetJobQueryKey(jobId ?? "") });
        },
        onError: (err) => {
          setSubmitError(err instanceof Error ? err.message : "Submission failed.");
        },
      }
    );
  };

  const handleMarkComplete = () => {
    updateJob.mutate(
      { jobId: jobId ?? "", data: { status: "completed" } },
      {
        onSuccess: () => qc.invalidateQueries({ queryKey: getGetJobQueryKey(jobId ?? "") }),
      }
    );
  };

  const handleMarkCancelled = () => {
    updateJob.mutate(
      { jobId: jobId ?? "", data: { status: "cancelled" } },
      {
        onSuccess: () => qc.invalidateQueries({ queryKey: getGetJobQueryKey(jobId ?? "") }),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-8">
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted animate-pulse border border-border" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center font-mono">
          <div className="text-muted-foreground text-sm mb-2">Job not found.</div>
          <a href="/jobs" className="text-primary text-xs hover:underline">← Back to all jobs</a>
        </div>
      </div>
    );
  }

  const parsedCriteria: string[] = (() => {
    if (!job.acceptanceCriteria) return [];
    try { return JSON.parse(job.acceptanceCriteria) as string[]; } catch { return []; }
  })();

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-border px-8 py-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold font-mono tracking-tight">{job.jobId}</h1>
            <StatusBadge status={job.status} />
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            Created {formatDate(job.createdAt)} · Updated {formatDate(job.updatedAt)}
          </p>
        </div>
        {job.status === "pending" && (
          <div className="flex gap-2">
            <button
              onClick={handleMarkComplete}
              disabled={updateJob.isPending}
              className="px-3 py-1.5 text-xs font-mono border border-primary/30 text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors"
            >
              Mark Complete
            </button>
            <button
              onClick={handleMarkCancelled}
              disabled={updateJob.isPending}
              className="px-3 py-1.5 text-xs font-mono border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
            >
              Cancel Job
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left — Job info */}
        <div className="space-y-6">
          <div className="border border-border bg-card">
            <div className="px-4 py-2 border-b border-border bg-muted/40">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Escrow Details</span>
            </div>
            <div className="px-4">
              <InfoRow label="Job ID" value={job.jobId} />
              <InfoRow label="Amount" value={`◎ ${formatLamports(job.amountLamports)} SOL`} />
              <InfoRow
                label="Client"
                value={
                  <span title={job.clientPubkey}>
                    {truncatePubkey(job.clientPubkey)}
                    <span className="text-muted-foreground text-xs ml-2 hidden sm:inline">{job.clientPubkey}</span>
                  </span>
                }
              />
              <InfoRow
                label="Freelancer"
                value={
                  <span title={job.freelancerPubkey}>
                    {truncatePubkey(job.freelancerPubkey)}
                    <span className="text-muted-foreground text-xs ml-2 hidden sm:inline">{job.freelancerPubkey}</span>
                  </span>
                }
              />
              <InfoRow
                label="Oracle"
                value={
                  <span title={job.oraclePubkey}>
                    {truncatePubkey(job.oraclePubkey)}
                  </span>
                }
              />
              {job.txSig && (
                <InfoRow
                  label="Tx Sig"
                  value={
                    <a
                      href={`https://explorer.solana.com/tx/${job.txSig}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {truncatePubkey(job.txSig)}
                    </a>
                  }
                />
              )}
            </div>
          </div>

          {job.description && (
            <div className="border border-border bg-card">
              <div className="px-4 py-2 border-b border-border bg-muted/40">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Description</span>
              </div>
              <p className="px-4 py-4 text-sm text-foreground">{job.description}</p>
            </div>
          )}

          {parsedCriteria.length > 0 && (
            <div className="border border-border bg-card">
              <div className="px-4 py-2 border-b border-border bg-muted/40">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Acceptance Criteria</span>
              </div>
              <ul className="px-4 py-3 space-y-2">
                {parsedCriteria.map((c, i) => (
                  <li key={i} className="text-sm font-mono flex gap-2">
                    <span className="text-primary">›</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {outcome && <OutcomeBadge outcome={outcome} />}
        </div>

        {/* Right — Submit deliverable */}
        {job.status === "pending" && !submitted && (
          <div>
            <div className="border border-border bg-card">
              <div className="px-4 py-2 border-b border-border bg-muted/40">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Submit Deliverable</span>
              </div>
              <form onSubmit={handleSubmit} className="p-5 space-y-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Type</label>
                  <div className="flex border border-border">
                    {(["url", "ipfs", "text", "json"] as DeliverableType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setDeliverableType(t)}
                        className={`flex-1 py-1.5 text-xs font-mono uppercase border-r border-border last:border-r-0 transition-colors ${
                          deliverableType === t
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                    {deliverableType === "url" && "Deliverable URL"}
                    {deliverableType === "ipfs" && "IPFS CID / Gateway URL"}
                    {deliverableType === "text" && "Deliverable Text"}
                    {deliverableType === "json" && "JSON Payload"}
                  </label>
                  <textarea
                    className={`${INPUT} resize-none`}
                    rows={4}
                    placeholder={
                      deliverableType === "url" ? "https://github.com/..." :
                      deliverableType === "ipfs" ? "Qm..." :
                      deliverableType === "json" ? '{ "repo": "...", "commit": "..." }' :
                      "Describe what was delivered..."
                    }
                    value={deliverable}
                    onChange={(e) => setDeliverable(e.target.value)}
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                    Description (for oracle)
                  </label>
                  <textarea
                    className={`${INPUT} resize-none`}
                    rows={2}
                    placeholder={job.description ?? "Describe the deliverable..."}
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                    Acceptance Criteria
                  </label>
                  {criteria.map((c, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        className={`${INPUT} flex-1`}
                        placeholder={parsedCriteria[i] ?? `Criterion ${i + 1}`}
                        value={c}
                        onChange={(e) => setCriterion(i, e.target.value)}
                      />
                      {criteria.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCriterion(i)}
                          className="px-2 text-xs font-mono text-destructive border border-destructive/30 hover:bg-destructive/10 transition-colors"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addCriterion}
                    className="text-xs font-mono text-muted-foreground hover:text-primary transition-colors text-left"
                  >
                    + Add criterion
                  </button>
                </div>

                {submitError && (
                  <div className="border border-destructive/30 bg-destructive/10 px-4 py-2 text-xs font-mono text-destructive">
                    {submitError}
                  </div>
                )}

                <div className="pt-1 border-t border-border">
                  <div className="text-xs font-mono text-muted-foreground mb-3">
                    Submitting sends this deliverable to the Gemini + Claude dual-model consensus engine.
                    Both models must agree above threshold to release or refund escrow.
                  </div>
                  <button
                    type="submit"
                    disabled={submitDeliverable.isPending}
                    className="w-full py-2.5 text-xs font-mono font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitDeliverable.isPending ? "VERIFYING VIA ORACLE..." : "SUBMIT FOR AI VERIFICATION"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {submitted && outcome && (
          <div className="flex flex-col gap-4">
            <OutcomeBadge outcome={outcome} />
            <button
              onClick={() => { setSubmitted(false); setOutcome(null); setDeliverable(""); }}
              className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors text-left"
            >
              ← Submit another deliverable
            </button>
          </div>
        )}

        {job.status !== "pending" && (
          <div className="border border-border bg-card p-6 text-center font-mono text-sm text-muted-foreground">
            This job is <StatusBadge status={job.status} /> — no further deliverables can be submitted.
          </div>
        )}
      </div>
    </div>
  );
}
