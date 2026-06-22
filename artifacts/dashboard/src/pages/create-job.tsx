import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Plus, Trash2, Wallet, ExternalLink, Loader2 } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { useCreateJob } from "@workspace/api-client-react";
import { useMappersClient } from "@/hooks/use-mappers-client";
import { WalletButton } from "@/components/wallet-button";

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

type TxPhase = "idle" | "signing" | "confirming" | "done";

export default function CreateJob() {
  const [, navigate] = useLocation();
  const createJob = useCreateJob();
  const { publicKey, connected } = useWallet();
  const mappersClient = useMappersClient();

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
  const [txPhase, setTxPhase] = useState<TxPhase>("idle");
  const [txSig, setTxSig] = useState<string | null>(null);
  const [onChain, setOnChain] = useState(false);

  useEffect(() => {
    if (publicKey && !form.clientPubkey) {
      setForm((f) => ({ ...f, clientPubkey: publicKey.toBase58() }));
    }
  }, [publicKey]);

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const addCriterion = () => setCriteria((c) => [...c, ""]);
  const removeCriterion = (i: number) =>
    setCriteria((c) => c.filter((_, idx) => idx !== i));
  const setCriterion = (i: number, val: string) =>
    setCriteria((c) => c.map((v, idx) => (idx === i ? val : v)));

  function validate(): { amountLamports: number; acceptanceCriteria: string[] } | null {
    const amountLamports = Math.round(parseFloat(form.amountSol) * 1e9);
    if (isNaN(amountLamports) || amountLamports <= 0) {
      setError("Enter a valid positive SOL amount.");
      return null;
    }
    if (!form.jobId.trim()) { setError("Job ID is required."); return null; }
    if (form.jobId.trim().length > 32) { setError("Job ID must be ≤ 32 characters."); return null; }
    if (!form.clientPubkey.trim()) { setError("Client public key is required."); return null; }
    if (!form.freelancerPubkey.trim()) { setError("Freelancer public key is required."); return null; }
    if (!form.oraclePubkey.trim()) { setError("Oracle public key is required."); return null; }
    return { amountLamports, acceptanceCriteria: criteria.filter((c) => c.trim() !== "") };
  }

  function registerInDb(sig?: string) {
    const result = validate();
    if (!result) return;
    const { amountLamports, acceptanceCriteria } = result;

    const desc = [
      form.description.trim() || undefined,
      sig ? `on-chain tx: ${sig}` : undefined,
    ]
      .filter(Boolean)
      .join(" | ");

    createJob.mutate(
      {
        data: {
          jobId: form.jobId.trim(),
          clientPubkey: form.clientPubkey.trim(),
          freelancerPubkey: form.freelancerPubkey.trim(),
          oraclePubkey: form.oraclePubkey.trim(),
          amountLamports: amountLamports.toString(),
          description: desc || undefined,
          acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : undefined,
        },
      },
      {
        onSuccess: (job) => navigate(`/jobs/${job.jobId}`),
        onError: (err) =>
          setError(err instanceof Error ? err.message : "Failed to register job."),
      }
    );
  }

  const handleRegisterOnly = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOnChain(false);
    registerInDb();
  };

  const handleInitOnChain = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOnChain(true);

    if (!mappersClient || !publicKey) {
      setError("Connect your wallet first.");
      return;
    }

    const result = validate();
    if (!result) return;
    const { amountLamports } = result;

    let sig: string;
    try {
      const { PublicKey } = await import("@solana/web3.js");
      setTxPhase("signing");

      sig = await mappersClient.initializeJob({
        jobId: form.jobId.trim(),
        amount: new BN(amountLamports),
        freelancer: new PublicKey(form.freelancerPubkey.trim()),
        oracle: new PublicKey(form.oraclePubkey.trim()),
      });

      setTxPhase("confirming");
      setTxSig(sig);
    } catch (err) {
      setTxPhase("idle");
      setError(
        err instanceof Error
          ? err.message.replace(/\n/g, " ").slice(0, 200)
          : "Transaction failed."
      );
      return;
    }

    setTxPhase("done");
    registerInDb(sig);
  };

  const busy = createJob.isPending || txPhase === "signing" || txPhase === "confirming";

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-border px-4 md:px-8 py-4 md:py-5">
        <h1 className="text-lg md:text-xl font-bold font-mono tracking-tight">Create Job</h1>
        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
          Initialize an on-chain escrow and register in the protocol database
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-xl mx-auto space-y-6">

          {/* Wallet status banner */}
          <div className={`border px-4 py-3 text-[11px] font-mono leading-relaxed border-l-2 ${
            connected
              ? "border-primary/20 bg-primary/5 border-l-primary/50 text-muted-foreground"
              : "border-amber-500/20 bg-amber-500/5 border-l-amber-500/50 text-amber-400/80"
          }`}>
            {connected ? (
              <span>
                Wallet connected —{" "}
                <span className="text-primary">{publicKey?.toBase58().slice(0, 8)}…{publicKey?.toBase58().slice(-6)}</span>
                . Use <strong className="text-foreground">Register + Init On-Chain</strong> to sign the{" "}
                <code className="text-primary/80">initialize_gig</code> instruction on devnet.
              </span>
            ) : (
              <span>
                Connect your Phantom wallet to sign the on-chain escrow transaction. Or use{" "}
                <strong>Register Only</strong> to save to the database without an on-chain tx.
              </span>
            )}
          </div>

          {!connected && (
            <div className="flex justify-start">
              <div className="w-48">
                <WalletButton />
              </div>
            </div>
          )}

          {/* Tx status */}
          {txPhase !== "idle" && (
            <div className={`border px-4 py-3 text-[11px] font-mono space-y-1 ${
              txPhase === "done"
                ? "border-primary/30 bg-primary/5"
                : "border-border bg-accent/20"
            }`}>
              {txPhase === "signing" && (
                <div className="flex items-center gap-2 text-amber-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Waiting for wallet signature…
                </div>
              )}
              {txPhase === "confirming" && (
                <div className="flex items-center gap-2 text-primary">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Confirming on devnet…
                </div>
              )}
              {txPhase === "done" && txSig && (
                <>
                  <div className="text-primary font-bold">✓ On-chain escrow initialized</div>
                  <a
                    href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary/70 hover:text-primary transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View on Solana Explorer
                  </a>
                </>
              )}
            </div>
          )}

          <form className="space-y-5">
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
              <Field label="Client Public Key" hint={connected ? "Auto-filled from wallet." : "Base58 Solana address."}>
                <div className="relative">
                  <input
                    className={`${INPUT} ${connected ? "pr-8" : ""}`}
                    placeholder="6LUVzT…rFq9W"
                    value={form.clientPubkey}
                    onChange={set("clientPubkey")}
                    required
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                  {connected && (
                    <Wallet className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary/60 pointer-events-none" />
                  )}
                </div>
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

            <Field label="Amount (SOL)" hint="Escrowed SOL. Minimum ~0.000890880 SOL (rent-exempt).">
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
              {connected && mappersClient && (
                <button
                  type="submit"
                  disabled={busy}
                  onClick={handleInitOnChain}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 text-xs font-mono font-bold bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[48px]"
                >
                  {txPhase === "signing" ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Awaiting signature…</>
                  ) : txPhase === "confirming" ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Confirming…</>
                  ) : createJob.isPending && onChain ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                  ) : (
                    "Register + Init On-Chain"
                  )}
                </button>
              )}

              <button
                type="submit"
                disabled={busy}
                onClick={handleRegisterOnly}
                className={`flex-1 sm:flex-none px-5 py-3 text-xs font-mono font-bold transition-colors min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed ${
                  connected && mappersClient
                    ? "border border-border text-muted-foreground hover:text-foreground hover:border-border/80 active:bg-accent/30"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80"
                }`}
              >
                {createJob.isPending && !onChain ? "Registering…" : "Register Only"}
              </button>

              <a
                href="/jobs"
                className="flex-1 sm:flex-none px-5 py-3 text-xs font-mono text-center border border-border text-muted-foreground hover:text-foreground hover:border-border/80 active:bg-accent/30 transition-colors min-h-[48px] flex items-center justify-center"
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
