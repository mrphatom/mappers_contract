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
  description:        string;         // Original job brief
  acceptanceCriteria: string[];       // Criteria the deliverable must meet
  deliverable:        string;         // URL, IPFS hash, text content, or JSON payload
  deliverableType:    "url" | "ipfs" | "text" | "json";
  submittedAt:        number;         // unix ms
}

// ─── AI VERIFICATION ─────────────────────────────────────────────────────────

export type Verdict = "APPROVED" | "REJECTED";

export interface ModelVerdict {
  model:        string;
  verdict:      Verdict;
  confidence:   number;
  reasoning:    string;
  criteriaMet:  string[];
  criteriaFailed: string[];
}

export type ConsensusOutcome = "RELEASE" | "REFUND" | "ESCALATE";

export interface ConsensusResult {
  outcome:      ConsensusOutcome;
  geminiVerdict: ModelVerdict;
  claudeVerdict: ModelVerdict;
  reasoning:    string;
  processedAt:  number;
}

// ─── HTTP API ─────────────────────────────────────────────────────────────────

export interface SubmitRequest {
  jobId:              string;
  description:        string;
  acceptanceCriteria: string[];
  deliverable:        string;
  deliverableType:    SubmissionArtifact["deliverableType"];
}

export interface SubmitResponse {
  success:   boolean;
  jobId:     string;
  outcome?:  ConsensusOutcome;
  txSig?:    string;
  error?:    string;
}
