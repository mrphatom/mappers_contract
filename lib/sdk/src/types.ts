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
  client:      PublicKey;
  freelancer:  PublicKey;
  oracle:      PublicKey;
  amount:      BN;
  jobId:       string;
  status:      JobStatus;
  escrowBump:  number;
  vaultBump:   number;
  deadline:    BN; // unix timestamp (i64) as BN
}

export interface FetchedEscrow {
  publicKey: PublicKey;
  account:   GigEscrowAccount;
}

/**
 * Returns true if the escrow's deadline has already passed as of now.
 * Pass the on-chain `deadline` field (BN of unix seconds).
 */
export function isDeadlinePassed(escrow: GigEscrowAccount): boolean {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return escrow.deadline.toNumber() <= nowSeconds;
}

// ─── INSTRUCTION PARAMS ───────────────────────────────────────────────────────

export interface InitializeJobParams {
  jobId:           string;
  amount:          BN | number | bigint;
  durationSeconds: number; // 3600–15_552_000 (1 hour – 180 days)
  freelancer:      PublicKey;
  oracle:          PublicKey;
}

export interface ReleasePaymentParams {
  escrowPubkey: PublicKey;
  escrow:       GigEscrowAccount;
}

export interface CancelJobParams {
  escrowPubkey: PublicKey;
  escrow:       GigEscrowAccount;
}

export interface RefundAfterTimeoutParams {
  escrowPubkey: PublicKey;
  escrow:       GigEscrowAccount;
  payer?:       PublicKey; // defaults to provider wallet
}

// ─── ORACLE HTTP API TYPES ────────────────────────────────────────────────────

export type DeliverableType = "url" | "ipfs" | "text" | "json";

export type ConsensusOutcome = "RELEASE" | "REFUND" | "ESCALATE";

export interface SubmitRequest {
  escrowPubkey:       string;
  description:        string;
  acceptanceCriteria: string[];
  deliverable:        string;
  deliverableType:    DeliverableType;
  signature:          string; // base58 ed25519 signature
  timestamp:          number; // unix seconds
}

export interface SubmitResponse {
  success:      boolean;
  escrowPubkey: string;
  outcome?:     ConsensusOutcome;
  txSig?:       string;
  error?:       string;
}

export interface OracleHealthResponse {
  status:      string;
  pendingJobs: number;
  timestamp:   string;
}

export interface OracleJobResponse {
  escrowPubkey: string;
  jobId:        string;
  client:       string;
  freelancer:   string;
  amount:       string;
  status:       "pending" | "completed" | "cancelled";
  detectedAt:   number;
}
