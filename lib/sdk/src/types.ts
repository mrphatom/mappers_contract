import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

// ─── ON-CHAIN TYPES ───────────────────────────────────────────────────────────

export type JobStatus =
  | { pending: Record<string, never> }
  | { completed: Record<string, never> }
  | { cancelled: Record<string, never> };

export function isJobPending(status: JobStatus): boolean {
  return "pending" in status;
}

export function isJobCompleted(status: JobStatus): boolean {
  return "completed" in status;
}

export function isJobCancelled(status: JobStatus): boolean {
  return "cancelled" in status;
}

export interface GigEscrowAccount {
  client: PublicKey;
  freelancer: PublicKey;
  oracle: PublicKey;
  amount: BN;
  jobId: string;
  status: JobStatus;
  escrowBump: number;
  vaultBump: number;
}

export interface FetchedEscrow {
  publicKey: PublicKey;
  account: GigEscrowAccount;
}

// ─── INSTRUCTION PARAMS ───────────────────────────────────────────────────────

export interface InitializeJobParams {
  jobId: string;
  amount: BN | number | bigint;
  freelancer: PublicKey;
  oracle: PublicKey;
}

export interface ReleasePaymentParams {
  escrowPubkey: PublicKey;
  escrow: GigEscrowAccount;
}

export interface CancelJobParams {
  escrowPubkey: PublicKey;
  escrow: GigEscrowAccount;
}

// ─── ORACLE HTTP API TYPES ────────────────────────────────────────────────────

export type DeliverableType = "url" | "ipfs" | "text" | "json";

export interface SubmitRequest {
  jobId: string;
  description: string;
  acceptanceCriteria: string[];
  deliverable: string;
  deliverableType: DeliverableType;
}

export type ConsensusOutcome = "RELEASE" | "REFUND" | "ESCALATE";

export interface SubmitResponse {
  success: boolean;
  jobId: string;
  outcome?: ConsensusOutcome;
  txSig?: string;
  error?: string;
}

export interface OracleHealthResponse {
  status: string;
  pendingJobs: number;
  timestamp: string;
}

export interface OracleJobResponse {
  jobId: string;
  escrowPubkey: string;
  client: string;
  freelancer: string;
  amount: string;
  status: "pending" | "completed" | "cancelled";
  detectedAt: number;
}
