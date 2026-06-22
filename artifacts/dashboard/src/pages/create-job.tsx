import { useState } from "react";
import { useLocation } from "wouter";
import { Plus, Trash2 } from "lucide-react";
import { useCreateJob } from "@workspace/api-client-react";

const INPUT =
  "w-full px-3 py-3 text-sm font-mono bg-input border border-border text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 transition-colors min-h-[44px]";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest">
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">{hint}</p>
      )}
    </div>
  );
}

export default function CreateJob() {
  const [, navigate] = useLocation();
  const createJob = useCreateJob();

  const [form, setForm] = useState({
    jobId: "",
    clientPubkey: "",
    freelancerPubkey: "",
    oraclePubkey: "",
    amountSol: "",
    description: "",
  });
  const [criteria, setCriteria] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const addCriterion = () => setCriteria((c) => [...c, ""]);
  const removeCriterion = (i: number) =>
    setCriteria((c) => c.filter((_, idx) => idx !== i));
  const setCriterion = (i: number, val: string) =>
    setCriteria((c) => c.map((v, idx) => (idx === i ? val : v)));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountLamports = Math.round(parseFloat(form.amountSol) * 1e9);
    if (isNaN(amountLamports) || amountLamports <= 0) {
      setError("Enter a valid positive SOL amount.");
      return;
    }

    const acceptanceCriteria = criteria.filter((c) => c.trim() !== "");

    createJob.mutate(
      {
        data: {
          jobId: form.jobId.trim(),
          clientPubkey: form.clientPubkey.trim(),
          freelancerPubkey: form.freelancerPubkey.trim(),
          oraclePubkey: form.oraclePubkey.trim(),
          amountLamports: amountLamports.toString(),
          description: form.description.trim() || undefined,
          acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : undefined,
        },
      },
      {
        onSuccess: (job) => navigate(`/jobs/${job.jobId}`),
        onError: (err) =>
          setError(err instanceof Error ? err.message : "Failed to register job."),
      }
    );
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 md:px-8 py-4 md:py-5">
        <h1 className="text-lg md:text-xl font-bold font-mono tracking-tight">Create Job</h1>
        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
          Register a new escrow job in the protocol database
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-xl mx-auto space-y-6">
          {/* Info banner */}
          <div className="border border-primary/20 bg-primary/5 px-4 py-3 text-[11px] font-mono text-muted-foreground leading-relaxed border-l-2 border-l-primary/50">
            This registers the job in our database. The on-chain escrow transaction requires a
            connected Solana wallet — wallet adapter integration coming soon.
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Field label="Job ID" hint="Max 32 characters. Use a short unique identifier (e.g. gig-001).">
              <input
                className={INPUT}
                placeholder="gig-001"
                value={form.jobId}
                onChange={set("jobId")}
                maxLength={32}
                required
                autoComplete="off"
                autoCapitalize="none"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Client Public Key" hint="Base58 Solana address.">
                <input
                  className={INPUT}
                  placeholder="6LUVzT…rFq9W"
                  value={form.clientPubkey}
                  onChange={set("clientPubkey")}
                  required
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
              <Field label="Freelancer Public Key" hint="Base58 Solana address.">
                <input
                  className={INPUT}
                  placeholder="9Kx2bP…uMn3R"
                  value={form.freelancerPubkey}
                  onChange={set("freelancerPubkey")}
                  required
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
            </div>

            <Field label="Oracle Public Key" hint="The AI oracle keypair that will adjudicate this escrow.">
              <input
                className={INPUT}
                placeholder="52yt1g…KX2Mu"
                value={form.oraclePubkey}
                onChange={set("oraclePubkey")}
                required
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>

            <Field label="Amount (SOL)" hint="Escrow amount in SOL. Converted to lamports on submit.">
              <input
                className={INPUT}
                type="number"
                step="0.000000001"
                min="0.000000001"
                inputMode="decimal"
                placeholder="1.5"
                value={form.amountSol}
                onChange={set("amountSol")}
                required
              />
            </Field>

            <Field label="Description" hint="Optional: describe the work being commissioned.">
              <textarea
                className={`${INPUT} resize-none`}
                rows={3}
                placeholder="Build a Solana token staking UI…"
                value={form.description}
                onChange={set("description")}
              />
            </Field>

            <Field
              label="Acceptance Criteria"
              hint="Each criterion the AI oracle will evaluate against."
            >
              <div className="space-y-2">
                {criteria.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className={`${INPUT} flex-1`}
                      placeholder={`Criterion ${i + 1}…`}
                      value={c}
                      onChange={(e) => setCriterion(i, e.target.value)}
                    />
                    {criteria.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCriterion(i)}
                        className="w-11 h-11 flex items-center justify-center border border-destructive/30 text-destructive hover:bg-destructive/10 active:bg-destructive/20 transition-colors shrink-0"
                        aria-label="Remove criterion"
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
            </Field>

            {error && (
              <div className="border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs font-mono text-destructive">
                {error}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="submit"
                disabled={createJob.isPending}
                className="flex-1 sm:flex-none px-6 py-3 text-xs font-mono font-bold bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[48px]"
              >
                {createJob.isPending ? "Registering…" : "Register Job"}
              </button>
              <a
                href="/jobs"
                className="flex-1 sm:flex-none px-6 py-3 text-xs font-mono text-center border border-border text-muted-foreground hover:text-foreground hover:border-border/80 active:bg-accent/30 transition-colors min-h-[48px] flex items-center justify-center"
              >
                Cancel
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
