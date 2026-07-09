import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

// ─── ON-CHAIN STATE ───────────────────────────────────────────────────────────

export interface GigEscrow {
  client:      PublicKey;
  freelancer:  PublicKey;
  oracle:      PublicKey;
  amount:      BN;
  jobId:       string;
  status:      { pending?: Record<string, never> } | { completed?: Record<string, never> } | { cancelled?: Record<string, never> };
  escrowBump:  number;
  vaultBump:   number;
  deadline:    BN; // i64 unix timestamp
}

// ─── ORACLE JOB STORE ────────────────────────────────────────────────────────

export interface StoredJob {
  escrowPubkey: PublicKey;
  escrow:       GigEscrow;
  detectedAt:   number; // unix ms
}

// ─── SUBMISSION ARTIFACT ─────────────────────────────────────────────────────

export interface SubmissionArtifact {
  jobId:              string;
  description:        string;
  acceptanceCriteria: string[];
  deliverable:        string;
  deliverableType:    "url" | "ipfs" | "text" | "json";
  submittedAt:        number;
}

// ─── AI VERIFICATION ─────────────────────────────────────────────────────────

export type Verdict = "APPROVED" | "REJECTED";

export interface ModelVerdict {
  model:          string;
  verdict:        Verdict;
  confidence:     number;
  reasoning:      string;
  criteriaMet:    string[];
  criteriaFailed: string[];
}

export type ConsensusOutcome = "RELEASE" | "REFUND" | "ESCALATE";

export interface ConsensusResult {
  outcome:       ConsensusOutcome;
  geminiVerdict: ModelVerdict;
  claudeVerdict: ModelVerdict;
  reasoning:     string;
  processedAt:   number;
}

// ─── HTTP API ─────────────────────────────────────────────────────────────────

export interface SubmitRequest {
  escrowPubkey:       string;
  description:        string;
  acceptanceCriteria: string[];
  deliverable:        string;
  deliverableType:    SubmissionArtifact["deliverableType"];
  signature:          string; // base58 ed25519 signature over the canonical message
  timestamp:          number; // unix seconds; server rejects if drift > 300s
}

export interface SubmitResponse {
  success:      boolean;
  escrowPubkey: string;
  outcome?:     ConsensusOutcome;
  txSig?:       string;
  error?:       string;
}
