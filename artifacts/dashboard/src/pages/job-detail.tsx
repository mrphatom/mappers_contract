import { useState } from "react";
import { useParams, Link } from "wouter";
import { ChevronLeft, ExternalLink, Plus, Trash2, CheckCircle2, XCircle, AlertTriangle, FileCode2, Globe } from "lucide-react";
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
  "w-full px-4 py-3 text-sm font-mono glass rounded-xl text-white/80 placeholder:text-white/20 outline-none focus:border-emerald-500/40 focus:shadow-[0_0_16px_rgba(20,241,149,0.06)] transition-all duration-200 min-h-[44px] bg-transparent";

const DELIVERABLE_ICONS: Record<DeliverableType, React.ElementType> = {
  url: Globe,
  ipfs: FileCode2,
  text: FileCode2,
  json: FileCode2,
};

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return null;

  const config: Record<string, { icon: React.ElementType; color: string; glow: string; desc: string }> = {
    RELEASE: {
      icon: CheckCircle2,
      color: "text-emerald-400 border-emerald-500/25 bg-emerald-500/[0.06]",
      glow: "shadow-[0_0_40px_rgba(20,241,149,0.12)]",
      desc: "Payment released to freelancer",
    },
    REFUND: {
      icon: XCircle,
      color: "text-amber-400 border-amber-500/25 bg-amber-500/[0.06]",
      glow: "shadow-[0_0_40px_rgba(251,191,36,0.1)]",
      desc: "Funds returned to client",
    },
    ESCALATE: {
      icon: AlertTriangle,
      color: "text-purple-400 border-purple-500/25 bg-purple-500/[0.06]",
      glow: "shadow-[0_0_40px_rgba(153,69,255,0.1)]",
      desc: "Models diverged — human arbitration required",
    },
  };

  const c = config[outcome];
  if (!c) return null;
  const Icon = c.icon;

  return (
    <div className={`glass rounded-2xl px-6 py-8 text-center border ${c.color} ${c.glow}`}>
      <Icon className="w-8 h-8 mx-auto mb-3 opacity-80" />
      <div className="text-[9px] text-white/30 uppercase tracking-widest mb-2 font-mono">Oracle Verdict</div>
      <div className="text-2xl font-bold font-mono">{outcome}</div>
      <div className="text-xs mt-2 opacity-50 font-mono">{c.desc}</div>
    </div>
  );
}

function GlassSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-white/[0.05] bg-white/[0.02]">
        <span className="text-[9px] font-mono text-white/30 uppercase tracking-[0.15em]">{title}</span>
      </div>
      {children}
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
    <div className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-6 py-3.5 px-5 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02] transition-colors">
      <span className="text-[9px] font-mono text-white/25 uppercase tracking-widest shrink-0 sm:w-24 sm:pt-0.5">
        {label}
      </span>
      <span className="text-xs font-mono text-white/60 break-all flex items-start gap-1.5">
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400/70 hover:text-emerald-400 flex items-center gap-1.5 transition-colors"
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
    query: { enabled: !!jobId, queryKey: ["job", jobId] },
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
      <div className="flex-1 p-5 md:p-8 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`glass rounded-2xl shimmer`} style={{ height: `${64 + i * 8}px` }} />
        ))}
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="glass rounded-2xl px-8 py-12 max-w-sm">
          <p className="text-white/30 text-sm font-mono mb-4">Job not found.</p>
          <Link href="/jobs" className="text-emerald-400 text-xs font-mono hover:text-emerald-300 transition-colors inline-flex items-center gap-1">
            <ChevronLeft className="w-3 h-3" /> Back to all jobs
          </Link>
        </div>
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
      <div className="relative px-5 md:px-8 py-6 md:py-7 border-b border-white/[0.05] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/[0.02] via-transparent to-purple-500/[0.02]" />
        <div className="relative">
          <Link
            href="/jobs"
            className="flex items-center gap-1.5 text-[10px] font-mono text-white/25 hover:text-white/60 mb-3 w-fit transition-colors"
          >
            <ChevronLeft className="w-3 h-3" /> All Jobs
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white font-mono">{job.jobId}</h1>
            <StatusBadge status={job.status} />
          </div>
          <p className="text-[10px] text-white/25 font-mono mt-2">
            Created {formatDate(job.createdAt)} · Updated {formatDate(job.updatedAt)}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        <div className="max-w-3xl mx-auto space-y-5">

          {/* Action buttons */}
          {job.status === "pending" && (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() =>
                  updateJob.mutate(
                    { jobId: jobId ?? "", data: { status: "completed" } },
                    { onSuccess: invalidate }
                  )
                }
                disabled={updateJob.isPending}
                className="flex-1 py-3 px-5 text-xs font-mono font-bold rounded-xl glass text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/10 hover:border-emerald-500/40 hover:shadow-[0_0_20px_rgba(20,241,149,0.1)] active:scale-[0.97] disabled:opacity-50 transition-all duration-200 min-h-[48px]"
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
                className="flex-1 py-3 px-5 text-xs font-mono font-bold rounded-xl glass text-rose-400 border-rose-500/25 hover:bg-rose-500/10 hover:border-rose-500/40 active:scale-[0.97] disabled:opacity-50 transition-all duration-200 min-h-[48px]"
              >
                Cancel Job
              </button>
            </div>
          )}

          {/* Verdict */}
          {outcome && <OutcomeBadge outcome={outcome} />}

          {/* Escrow details */}
          <GlassSection title="Escrow Details">
            <div>
              <InfoRow label="Job ID" value={job.jobId} />
              <InfoRow label="Amount" value={<span className="text-emerald-400">◎ {formatLamports(job.amountLamports)} SOL</span>} />
              <InfoRow
                label="Client"
                value={
                  <span className="flex flex-col gap-0.5">
                    <span className="text-white/70">{truncatePubkey(job.clientPubkey)}</span>
                    <span className="text-[9px] text-white/25 break-all hidden sm:block">{job.clientPubkey}</span>
                  </span>
                }
              />
              <InfoRow
                label="Freelancer"
                value={
                  <span className="flex flex-col gap-0.5">
                    <span className="text-white/70">{truncatePubkey(job.freelancerPubkey)}</span>
                    <span className="text-[9px] text-white/25 break-all hidden sm:block">{job.freelancerPubkey}</span>
                  </span>
                }
              />
              <InfoRow label="Oracle" value={truncatePubkey(job.oraclePubkey)} />
              {job.txSig && (
                <InfoRow
                  label="Tx Sig"
                  value={truncatePubkey(job.txSig)}
                  link={`https://explorer.solana.com/tx/${job.txSig}?cluster=devnet`}
                />
              )}
            </div>
          </GlassSection>

          {/* Description */}
          {job.description && (
            <GlassSection title="Description">
              <p className="px-5 py-4 text-sm text-white/60 leading-relaxed">{job.description}</p>
            </GlassSection>
          )}

          {/* Acceptance criteria */}
          {parsedCriteria.length > 0 && (
            <GlassSection title="Acceptance Criteria">
              <ul className="px-5 py-4 space-y-3">
                {parsedCriteria.map((c, i) => (
                  <li key={i} className="text-sm font-mono flex gap-3 items-start text-white/60">
                    <span className="text-emerald-400/50 shrink-0 mt-0.5 font-bold">›</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </GlassSection>
          )}

          {/* Submit deliverable */}
          {job.status === "pending" && !submitted && (
            <GlassSection title="Submit Deliverable">
              <form onSubmit={handleSubmit} className="p-5 space-y-5">
                {/* Type selector */}
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-mono text-white/25 uppercase tracking-[0.15em]">Deliverable Type</label>
                  <div className="flex gap-2 flex-wrap">
                    {(["url", "ipfs", "text", "json"] as DeliverableType[]).map((t) => {
                      const Icon = DELIVERABLE_ICONS[t];
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setDeliverableType(t)}
                          className={`flex items-center gap-1.5 px-3.5 py-2 text-[10px] font-mono rounded-full border transition-all duration-200 ${
                            deliverableType === t
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-[0_0_12px_rgba(20,241,149,0.1)]"
                              : "glass text-white/30 border-white/[0.07] hover:text-white/60 hover:border-white/15"
                          }`}
                        >
                          <Icon className="w-3 h-3" />
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-mono text-white/25 uppercase tracking-[0.15em]">
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
                  <label className="text-[9px] font-mono text-white/25 uppercase tracking-[0.15em]">Description (for oracle)</label>
                  <textarea
                    className={`${INPUT} resize-none`}
                    rows={2}
                    placeholder={job.description ?? "Describe the deliverable…"}
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-mono text-white/25 uppercase tracking-[0.15em]">Acceptance Criteria</label>
                  <div className="space-y-2.5">
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
                            className="w-11 h-11 flex items-center justify-center glass rounded-xl text-rose-400/50 hover:text-rose-400 hover:border-rose-400/30 active:scale-95 transition-all duration-200 shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addCriterion}
                      className="flex items-center gap-1.5 text-xs font-mono text-white/25 hover:text-emerald-400 transition-colors py-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add criterion
                    </button>
                  </div>
                </div>

                {submitError && (
                  <div className="glass rounded-xl px-4 py-3 text-xs font-mono text-rose-400 border-rose-500/20 bg-rose-500/[0.05]">
                    {submitError}
                  </div>
                )}

                <div className="border-t border-white/[0.05] pt-5 space-y-4">
                  <p className="text-[10px] font-mono text-white/25 leading-relaxed">
                    Sends this deliverable to the Gemini + Claude dual-model consensus engine.
                    Both models must independently agree above threshold to release or refund escrow.
                  </p>
                  <button
                    type="submit"
                    disabled={submitDeliverable.isPending}
                    className="w-full py-3.5 text-xs font-mono font-bold rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 text-black hover:from-emerald-400 hover:to-emerald-300 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-[0_0_24px_rgba(20,241,149,0.2)] hover:shadow-[0_0_32px_rgba(20,241,149,0.35)] min-h-[48px]"
                  >
                    {submitDeliverable.isPending
                      ? "Verifying via Oracle…"
                      : "Submit for AI Verification"}
                  </button>
                </div>
              </form>
            </GlassSection>
          )}

          {submitted && outcome && (
            <button
              onClick={() => {
                setSubmitted(false);
                setOutcome(null);
                setDeliverable("");
              }}
              className="text-xs font-mono text-white/25 hover:text-white/60 transition-colors flex items-center gap-1.5"
            >
              <ChevronLeft className="w-3 h-3" /> Submit another deliverable
            </button>
          )}

          {job.status !== "pending" && (
            <div className="glass rounded-2xl px-6 py-8 text-center font-mono text-sm text-white/25">
              This job is <StatusBadge status={job.status} /> — no further deliverables can be submitted.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
