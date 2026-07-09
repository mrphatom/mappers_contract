import { PublicKey } from "@solana/web3.js";
import { StoredJob, GigEscrow } from "./types";

class JobStore {
  private readonly jobs = new Map<string, StoredJob>();
  private readonly inflight = new Set<string>();

  /**
   * Upsert a job keyed by the escrow account's base58 pubkey.
   * Using the escrow pubkey (not bare jobId) eliminates (client, jobId)
   * collisions where two clients reuse the same job ID string.
   */
  upsert(escrowKey: string, escrowPubkey: PublicKey, escrow: GigEscrow): void {
    this.jobs.set(escrowKey, {
      escrowPubkey,
      escrow,
      detectedAt: this.jobs.get(escrowKey)?.detectedAt ?? Date.now(),
    });
  }

  get(escrowKey: string): StoredJob | undefined {
    return this.jobs.get(escrowKey);
  }

  remove(escrowKey: string): void {
    this.jobs.delete(escrowKey);
    this.inflight.delete(escrowKey);
  }

  hasPending(escrowKey: string): boolean {
    const job = this.jobs.get(escrowKey);
    if (!job) return false;
    return "pending" in job.escrow.status;
  }

  allPending(): StoredJob[] {
    return Array.from(this.jobs.values()).filter(
      (j) => "pending" in j.escrow.status
    );
  }

  /**
   * Acquire a per-job in-flight lock.
   * Returns true if the lock was acquired, false if already locked.
   * This prevents two concurrent /submit calls from both running paid
   * AI consensus for the same escrow.
   */
  lock(escrowKey: string): boolean {
    if (this.inflight.has(escrowKey)) return false;
    this.inflight.add(escrowKey);
    return true;
  }

  unlock(escrowKey: string): void {
    this.inflight.delete(escrowKey);
  }

  size(): number {
    return this.jobs.size;
  }
}

export const store = new JobStore();
