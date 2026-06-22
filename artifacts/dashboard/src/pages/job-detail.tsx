import { useState } from "react";
import { useParams, Link } from "wouter";
import { ChevronLeft, ExternalLink, Plus, Trash2 } from "lucide-react";
import {
  useGetJob,
  useSubmitDeliverable,
  useUpdateJob,
  getGetJobQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { formatLamports, truncatePubkey, formatDate } from "@/lib/format";

type DeliverableType = "url" | "ipfs" | "text" | "json";

const INPUT =
  "w-full px-3 py-3 text-sm font-mono bg-input border border-border text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 transition-colors min-h-[44px]";

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return null;
  const styles: Record<string, string> = {
    RELEASE:  "text-primary border-primary/30 bg-primary/10",
    REFUND:   "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
    ESCALATE: "text-secondary border-secondary/30 bg-secondary/10",
  };
  const desc: Record<string, string> = {
    RELEASE:  "Payment released to freelancer",
    REFUND:   "Funds returned to client",
    ESCALATE: "Models diverged — human arbitration required",
  };
  return (
    <div className={`border px-5 py-5 text-center font-mono ${styles[outcome] ?? "border-border"}`}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">
        Oracle Verdict
      </div>
      <div className="text-2xl font-bold">{outcome}</div>
      <div className="text-xs mt-1 opacity-70">{desc[outcome]}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  link,
}: {
  label: string;
  value: React.ReactNode;
  link?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3 border-b border-border last:border-b-0">
      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest shrink-0 sm:w-32 sm:pt-0.5">
        {label}
      </span>
      <span className="text-sm font-mono break-all flex items-start gap-1.5">
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline flex items-center gap-1"
          >
            {value}
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        ) : (
          value
        )}
      </span>
    </div>
  );
}

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
  const removeCriterion = (i: number) =>
    setCriteria((c) => c.filter((_, idx) => idx !== i));
  const setCriterion = (i: number, val: string) =>
    setCriteria((c) => c.map((v, idx) => (idx === i ? val : v)));

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getGetJobQueryKey(jobId ?? "") });

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
          invalidate();
        },
        onError: (err) =>
          setSubmitError(err instanceof Error ? err.message : "Submission failed."),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-4 md:p-8 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted animate-pulse border border-border" />
        ))}
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center font-mono">
        <p className="text-muted-foreground text-sm mb-3">Job not found.</p>
        <Link href="/jobs" className="text-primary text-xs hover:underline flex items-center gap-1">
          <ChevronLeft className="w-3 h-3" /> Back to all jobs
        </Link>
      </div>
    );
  }

  const parsedCriteria: string[] = (() => {
    if (!job.acceptanceCriteria) return [];
    try {
      return JSON.parse(job.acceptanceCriteria) as string[];
    } catch {
      return [];
    }
  })();

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 md:px-8 py-4 md:py-5">
        <Link
          href="/jobs"
          className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground mb-2 w-fit"
        >
          <ChevronLeft className="w-3 h-3" /> All Jobs
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <h1 className="text-lg md:text-xl font-bold font-mono tracking-tight">{job.jobId}</h1>
          <StatusBadge status={job.status} />
        </div>
        <p className="text-[11px] text-muted-foreground font-mono mt-1">
          Created {formatDate(job.createdAt)} · Updated {formatDate(job.updatedAt)}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Action buttons for pending jobs */}
          {job.status === "pending" && (
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() =>
                  updateJob.mutate(
                    { jobId: jobId ?? "", data: { status: "completed" } },
                    { onSuccess: invalidate }
                  )
                }
                disabled={updateJob.isPending}
                className="flex-1 py-2.5 px-4 text-xs font-mono border border-primary/30 text-primary hover:bg-primary/10 active:bg-primary/20 disabled:opacity-50 transition-colors min-h-[44px]"
              >
                Mark Complete
              </button>
              <button
                onClick={() =>
                  updateJob.mutate(
                    { jobId: jobId ?? "", data: { status: "cancelled" } },
                    { onSuccess: invalidate }
                  )
                }
                disabled={updateJob.isPending}
                className="flex-1 py-2.5 px-4 text-xs font-mono border border-destructive/30 text-destructive hover:bg-destructive/10 active:bg-destructive/20 disabled:opacity-50 transition-colors min-h-[44px]"
              >
                Cancel Job
              </button>
            </div>
          )}

          {/* Outcome verdict */}
          {outcome && <OutcomeBadge outcome={outcome} />}

          {/* Escrow details */}
          <div className="border border-border bg-card">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                Escrow Details
              </span>
            </div>
            <div className="px-4">
              <InfoRow label="Job ID" value={job.jobId} />
              <InfoRow
                label="Amount"
                value={`◎ ${formatLamports(job.amountLamports)} SOL`}
              />
              <InfoRow
                label="Client"
                value={
                  <span title={job.clientPubkey} className="flex flex-col gap-0.5">
                    <span className="text-foreground">{truncatePubkey(job.clientPubkey)}</span>
                    <span className="text-[9px] text-muted-foreground break-all hidden sm:block">
                      {job.clientPubkey}
                    </span>
                  </span>
                }
              />
              <InfoRow
                label="Freelancer"
                value={
                  <span title={job.freelancerPubkey} className="flex flex-col gap-0.5">
                    <span className="text-foreground">{truncatePubkey(job.freelancerPubkey)}</span>
                    <span className="text-[9px] text-muted-foreground break-all hidden sm:block">
                      {job.freelancerPubkey}
                    </span>
                  </span>
                }
              />
              <InfoRow
                label="Oracle"
                value={truncatePubkey(job.oraclePubkey)}
              />
              {job.txSig && (
                <InfoRow
                  label="Tx Sig"
                  value={truncatePubkey(job.txSig)}
                  link={`https://explorer.solana.com/tx/${job.txSig}?cluster=devnet`}
                />
              )}
            </div>
          </div>

          {/* Description */}
          {job.description && (
            <div className="border border-border bg-card">
              <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                  Description
                </span>
              </div>
              <p className="px-4 py-4 text-sm leading-relaxed">{job.description}</p>
            </div>
          )}

          {/* Acceptance criteria */}
          {parsedCriteria.length > 0 && (
            <div className="border border-border bg-card">
              <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                  Acceptance Criteria
                </span>
              </div>
              <ul className="px-4 py-3 space-y-2.5">
                {parsedCriteria.map((c, i) => (
                  <li key={i} className="text-sm font-mono flex gap-2.5 items-start">
                    <span className="text-primary shrink-0 mt-0.5">›</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Submit deliverable */}
          {job.status === "pending" && !submitted && (
            <div className="border border-border bg-card">
              <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                  Submit Deliverable
                </span>
              </div>

              <form onSubmit={handleSubmit} className="p-4 md:p-5 space-y-5">
                {/* Type selector */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                    Type
                  </label>
                  <div className="flex border border-border overflow-hidden">
                    {(["url", "ipfs", "text", "json"] as DeliverableType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setDeliverableType(t)}
                        className={`flex-1 py-2.5 text-[10px] font-mono uppercase tracking-wider border-r border-border last:border-r-0 transition-colors min-h-[40px] ${
                          deliverableType === t
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/30 active:bg-accent/50"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                    {deliverableType === "url" && "Deliverable URL"}
                    {deliverableType === "ipfs" && "IPFS CID / Gateway URL"}
                    {deliverableType === "text" && "Deliverable Text"}
                    {deliverableType === "json" && "JSON Payload"}
                  </label>
                  <textarea
                    className={`${INPUT} resize-none`}
                    rows={4}
                    placeholder={
                      deliverableType === "url"
                        ? "https://github.com/…"
                        : deliverableType === "ipfs"
                        ? "Qm…"
                        : deliverableType === "json"
                        ? '{ "repo": "…", "commit": "…" }'
                        : "Describe what was delivered…"
                    }
                    value={deliverable}
                    onChange={(e) => setDeliverable(e.target.value)}
                    required
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                    Description (for oracle)
                  </label>
                  <textarea
                    className={`${INPUT} resize-none`}
                    rows={2}
                    placeholder={job.description ?? "Describe the deliverable…"}
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                    Acceptance Criteria
                  </label>
                  <div className="space-y-2">
                    {criteria.map((c, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          className={`${INPUT} flex-1`}
                          placeholder={parsedCriteria[i] ?? `Criterion ${i + 1}…`}
                          value={c}
                          onChange={(e) => setCriterion(i, e.target.value)}
                        />
                        {criteria.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeCriterion(i)}
                            className="w-11 h-11 flex items-center justify-center border border-destructive/30 text-destructive hover:bg-destructive/10 active:bg-destructive/20 transition-colors shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addCriterion}
                      className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-primary active:text-primary/80 transition-colors py-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add criterion
                    </button>
                  </div>
                </div>

                {submitError && (
                  <div className="border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs font-mono text-destructive">
                    {submitError}
                  </div>
                )}

                <div className="border-t border-border pt-4 space-y-3">
                  <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">
                    Sends this deliverable to the Gemini + Claude dual-model consensus engine.
                    Both models must agree above threshold to release or refund escrow.
                  </p>
                  <button
                    type="submit"
                    disabled={submitDeliverable.isPending}
                    className="w-full py-3 text-xs font-mono font-bold bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[48px]"
                  >
                    {submitDeliverable.isPending
                      ? "Verifying via Oracle…"
                      : "Submit for AI Verification"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {submitted && outcome && (
            <button
              onClick={() => {
                setSubmitted(false);
                setOutcome(null);
                setDeliverable("");
              }}
              className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <ChevronLeft className="w-3 h-3" /> Submit another deliverable
            </button>
          )}

          {job.status !== "pending" && (
            <div className="border border-border bg-card px-5 py-6 text-center font-mono text-sm text-muted-foreground">
              This job is <StatusBadge status={job.status} /> — no further deliverables can be
              submitted.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
