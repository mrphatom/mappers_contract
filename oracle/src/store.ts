import { PublicKey } from "@solana/web3.js";
import { StoredJob, GigEscrow } from "./types";

class JobStore {
  private readonly jobs = new Map<string, StoredJob>();

  upsert(jobId: string, escrowPubkey: PublicKey, escrow: GigEscrow): void {
    this.jobs.set(jobId, {
      escrowPubkey,
      escrow,
      detectedAt: this.jobs.get(jobId)?.detectedAt ?? Date.now(),
    });
  }

  get(jobId: string): StoredJob | undefined {
    return this.jobs.get(jobId);
  }

  remove(jobId: string): void {
    this.jobs.delete(jobId);
  }

  hasPending(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    return "pending" in job.escrow.status;
  }

  allPending(): StoredJob[] {
    return Array.from(this.jobs.values()).filter(
      (j) => "pending" in j.escrow.status
    );
  }

  size(): number {
    return this.jobs.size;
  }
}

// Singleton — shared across listener and HTTP handlers
export const store = new JobStore();
