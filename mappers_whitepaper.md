# Mappers Protocol
## Whitepaper v1.0

**Autonomous, On-Chain Freelance Settlement Infrastructure  
Powered by Cross-Validated AI Oracles on Solana**

---

*Published by the Mappers Core Team*  
*Solana Mainnet-Beta Target: Q4 2026*

---

## Abstract

The global freelance economy processes over $1.5 trillion in annual contract labor, yet the infrastructure that settles those agreements remains broken. Payments are delayed by platform intermediaries, withheld arbitrarily, or locked in dispute queues that take weeks to resolve. The 59 million independent workers globally bear all the risk and none of the leverage.

Mappers is a decentralized freelance settlement protocol built natively on Solana. It replaces platform intermediaries with a three-layer system: a gas-optimized on-chain escrow engine, an autonomous AI oracle middleware, and a dual-model consensus verification loop. When a freelancer delivers work, an AI system evaluates the output and triggers a cryptographic payment release — with no human approvals, no platform fees, and no counterparty risk.

The Mappers Protocol is being open-sourced as a reusable SDK. Any developer building a task marketplace, a DAO contributor payment system, or a bounty protocol can integrate the escrow engine and oracle middleware directly, without rebuilding the trust layer from scratch.

---

## 1. The Problem

### 1.1 Platform Intermediaries Extract Disproportionate Value

Platforms like Upwork, Fiverr, and Toptal charge service fees between 5% and 20% of gross contract value. These fees don't compensate for a particularly sophisticated service — they compensate for the trust layer the platform provides. Clients trust that funds are held securely. Freelancers trust that delivered work will result in payment. The platform is a middleman whose only function is to be trusted.

Blockchain removes the need for that middleman entirely. A smart contract can hold funds with stronger guarantees than any centralized platform, and it can release them on programmable conditions. The problem, historically, has been that verifying "work was done" is a real-world judgment call that blockchains cannot make natively. Mappers solves this.

### 1.2 Dispute Resolution Is Slow, Expensive, and Arbitrary

When a client disputes a payment on a traditional platform, the process is slow by design. Human reviewers evaluate submissions, adjudicate disagreements, and make judgment calls that often satisfy neither party. Resolution can take days or weeks. During that window, the freelancer is unpaid and the client's funds are in limbo. The platform charges for this service and bears no liability for getting it wrong.

### 1.3 Permissioned Infrastructure Creates Fragility

Every freelance platform is a closed ecosystem. Reputation is non-portable. Payment history is siloed. A freelancer with five years of verified delivery history on one platform starts from zero on another. The infrastructure that powers freelance work should be permissionless, composable, and available to anyone who wants to build on it — not locked inside proprietary databases.

---

## 2. The Mappers Solution

Mappers introduces three components that together eliminate the need for a trusted intermediary:

1. **On-Chain Escrow Engine** — A gas-optimized Anchor program that holds client funds in a deterministic Program Derived Address vault, enforces job lifecycle state transitions, and executes programmatic token releases.

2. **Oracle Middleware** — An off-chain microservice that monitors on-chain events via high-speed gRPC streaming, ingests freelancer submission artifacts, and bridges them to the AI verification pipeline.

3. **Dual-Model AI Consensus Loop** — A multi-model verification system that cross-validates deliverable quality using independent passes through two large language model APIs, releasing funds only when both models reach structured consensus.

Together, these layers create a trust infrastructure that is faster, cheaper, and more consistent than any human arbitration system.

---

## 3. Protocol Architecture

### 3.1 System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                         │
│          Next.js 14 App Router — Solana Wallet Adapter      │
└────────────────────────────┬────────────────────────────────┘
                             │  initialize_job (on-chain tx)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    ON-CHAIN ESCROW ENGINE                    │
│       Anchor 0.30 / Rust — Solana Mainnet-Beta              │
│                                                             │
│  ┌─────────────────┐    ┌──────────────────┐               │
│  │  GigEscrow PDA  │    │   Vault PDA       │               │
│  │  (State Account)│    │   (SOL Custody)   │               │
│  └─────────────────┘    └──────────────────┘               │
└────────────────────────────┬────────────────────────────────┘
                             │  gRPC event stream (Helius)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                   ORACLE MIDDLEWARE LAYER                    │
│           Node.js — Helius/QuickNode gRPC Listener          │
│                                                             │
│  Event Detection → Artifact Ingestion → Verification Req    │
└────────────────────────────┬────────────────────────────────┘
                             │  parallel API calls
                             ▼
┌─────────────────────────────────────────────────────────────┐
│               DUAL-MODEL AI CONSENSUS LOOP                  │
│         Manus AI Pro (Orchestrator)                         │
│                                                             │
│   ┌─────────────────┐         ┌──────────────────┐         │
│   │   Gemini API    │         │  Anthropic Claude │         │
│   │  (Primary Pass) │         │ (Cross-Validator) │         │
│   └────────┬────────┘         └────────┬─────────┘         │
│            │    Structured JSON        │                    │
│            └──────────┬────────────────┘                    │
│                       │ consensus check                     │
└───────────────────────┼─────────────────────────────────────┘
                        │  release_payment / cancel_job (tx)
                        ▼
              On-Chain Program Execution
```

### 3.2 Job Lifecycle State Machine

Every job on Mappers moves through a deterministic state graph enforced entirely on-chain:

```
PENDING ──── (oracle or client approves) ────▶ COMPLETED
   │
   └──── (oracle arbitrates) ───────────────▶ CANCELLED
```

State transitions are irreversible. Once a job is `COMPLETED` or `CANCELLED`, the escrow account is closed and rent is returned to the client. There is no re-open path, no appeal layer, and no mutable state after resolution.

---

## 4. On-Chain Escrow Engine

### 4.1 Program Derived Address Architecture

Mappers uses two separate PDAs per job, a pattern critical for security and for enabling the System Program's native lamport transfer CPI:

**GigEscrow Account** — Stores all job metadata and lifecycle state. Derived deterministically from:
```
seeds = ["gig-escrow", client_pubkey, job_id]
```

**Vault Account** — A data-less, System Program-owned account that holds the client's locked SOL. Derived from:
```
seeds = ["vault", client_pubkey, job_id]
```

The separation is non-trivial. The vault must be owned by the System Program for native lamport transfers to work. If the vault and escrow were merged into one account, Anchor's ownership model would conflict with the System Program's signer authority requirements during CPI.

Both bumps — `escrow_bump` and `vault_bump` — are stored on the `GigEscrow` state account at initialization. This eliminates `find_program_address` calls on every `release_payment` and `cancel_job` instruction, saving approximately 25,000 compute units per bump lookup, roughly 50,000 CU total per resolution transaction.

### 4.2 GigEscrow State Schema

```rust
pub struct GigEscrow {
    pub client:      Pubkey,    // 32 bytes — original funder, refund target
    pub freelancer:  Pubkey,    // 32 bytes — payment recipient
    pub oracle:      Pubkey,    // 32 bytes — authorized AI middleware key
    pub amount:      u64,       // 8 bytes  — locked lamports
    pub job_id:      String,    // 36 bytes — max 32-char identifier + 4-byte prefix
    pub status:      JobStatus, // 1 byte   — Pending / Completed / Cancelled
    pub escrow_bump: u8,        // 1 byte   — GigEscrow PDA canonical bump
    pub vault_bump:  u8,        // 1 byte   — Vault PDA canonical bump
}
// Total allocated space: 151 bytes (including 8-byte Anchor discriminator)
```

### 4.3 Instruction Set

**`initialize_job(job_id, amount)`**

Called by the client to create the escrow and deposit funds. The instruction:
- Validates `job_id` is ≤ 32 bytes
- Validates `amount` exceeds the System Program's rent-exempt minimum for a zero-data account (~890,880 lamports)
- Derives both PDAs and stores their canonical bumps
- Transfers `amount` lamports from the client's wallet to the vault via System Program CPI
- Sets status to `Pending`

**`release_payment()`**

Callable by either the client (manual approval) or the oracle (autonomous approval). The instruction:
- Validates job status is `Pending`
- Validates the caller is either `escrow.client` or `escrow.oracle`
- Transfers the full vault balance to the freelancer using stored `vault_bump` for PDA signing
- Sets status to `Completed`
- Closes the `GigEscrow` account via Anchor's `close = client` constraint, returning ~1.44M lamports of rent to the client

**`cancel_job()`**

Callable exclusively by the oracle. The instruction:
- Validates job status is `Pending`
- Transfers the full vault balance back to the client
- Sets status to `Cancelled`
- Closes the `GigEscrow` account, returning rent to the client

### 4.4 Security Properties

**Reentrancy Mitigation** — All escrow state fields (`client`, `oracle`, `amount`, `vault_bump`, `job_id`, `status`) are read from the account and cached as stack variables before any mutable borrow or CPI is executed. This prevents cross-program invocation attacks that attempt to re-read modified state mid-execution.

**Rent Lock Prevention** — Both resolution instructions carry `close = client` on the escrow account. Post-resolution, zero lamports remain permanently locked in program-owned accounts. This is enforced at the account constraint level, not the instruction level, making it impossible to skip.

**Double-Spend Prevention** — The `JobNotPending` guard (`require!(status == JobStatus::Pending)`) is checked before any transfer. Because Solana transactions are atomic and account state is locked during execution, there is no race condition between concurrent `release_payment` and `cancel_job` calls for the same escrow.

**Signer Forgery Prevention** — All authority checks use `has_one` constraints at the account validation layer, not inside instruction logic. `has_one = freelancer`, `has_one = oracle`, and `has_one = client` constraints verify that the accounts passed in the transaction match the public keys stored on-chain before any instruction code runs.

---

## 5. Oracle Middleware

### 5.1 Event Detection

The oracle middleware is a persistent Node.js process that maintains a gRPC subscription to a Helius RPC node, streaming all transactions that interact with the Mappers program ID in real time. Helius provides sub-second transaction notification with full account data.

On detection of an `InitializeJob` event, the middleware:
1. Deserializes the `GigEscrow` account state using the program IDL
2. Extracts `job_id`, `freelancer`, `oracle`, and `amount`
3. Stores a pending verification record indexed by `job_id`

### 5.2 Artifact Ingestion

When a freelancer marks a job as submitted (via the frontend or direct API call), they attach a deliverable artifact — a file hash, a URL, a structured JSON payload, or a combination. The oracle middleware retrieves this artifact and prepares a structured verification request containing:

- The original job description and acceptance criteria
- The submitted deliverable artifact
- The escrow metadata (amount, parties, job ID)

### 5.3 Verification Pipeline

The artifact package is dispatched to Manus AI Pro, which acts as the orchestration layer. Manus executes two independent verification passes in parallel:

**Pass A — Gemini API (Primary Evaluator)**
Receives the job description and deliverable. Returns a structured JSON verdict:
```json
{
  "verdict": "APPROVED" | "REJECTED",
  "confidence": 0.0-1.0,
  "reasoning": "string",
  "criteria_met": ["list of passed criteria"],
  "criteria_failed": ["list of failed criteria"]
}
```

**Pass B — Anthropic Claude API (Cross-Validator)**
Receives the same inputs independently, with no knowledge of Pass A's result. Returns an identical schema.

### 5.4 Consensus Resolution

Manus compares the two verdicts. The resolution logic is:

| Pass A | Pass B | Action |
|--------|--------|--------|
| APPROVED | APPROVED | `release_payment` → freelancer |
| REJECTED | REJECTED | `cancel_job` → refund client |
| APPROVED | REJECTED | Escalate to human arbitration |
| REJECTED | APPROVED | Escalate to human arbitration |

Consensus-driven releases and cancellations are fully autonomous. Divergent verdicts trigger a human arbitration queue, where the oracle's designated authority keypair (a multisig in production) makes the final call and signs the appropriate instruction.

This design means the majority of straightforward job completions are settled in seconds with no human involvement. Edge cases and contested submissions are the only path to human arbitration, dramatically reducing the operational burden compared to traditional platforms.

---

## 6. Dual-Model Verification Rationale

### 6.1 Why Two Models

Using a single AI model to gate payments creates a single point of failure — both technically and philosophically. If one model has a systematic bias toward certain deliverable types, or is manipulated through prompt injection in the artifact, all payments are compromised.

Two independent models with different training data, architectures, and API implementations must reach the same conclusion for funds to move. This raises the bar for manipulation significantly: an attacker would need to simultaneously exploit both models' verification logic with a crafted artifact, which is qualitatively harder than exploiting one.

### 6.2 Confidence Thresholds

Both models return a confidence score alongside their verdict. The oracle middleware applies minimum confidence thresholds before accepting a verdict:

- Approvals require confidence ≥ 0.80 from both models
- Rejections require confidence ≥ 0.75 from both models
- Sub-threshold verdicts are escalated regardless of verdict agreement

This prevents uncertain or low-signal evaluations from autonomously moving funds.

### 6.3 Prompt Injection Defense

Deliverable artifacts submitted by freelancers are sanitized before being included in verification prompts. String-based artifacts are escaped and framed with explicit XML delimiters that instruct the model to treat enclosed content as data, not instructions. This is a standard defense against prompt injection attacks that attempt to manipulate the AI into returning a false `APPROVED` verdict.

---

## 7. Frontend Interface

The client-facing application is built as a single-page application using Vite, React 19, TanStack Query, Tailwind CSS, and shadcn/ui. The API layer is consumed via auto-generated TanStack Query hooks (produced by orval from the OpenAPI spec). It provides:

**Job Overview Dashboard** — Displays all escrow jobs with real-time status badges, escrowed amounts in SOL, and filterable views by status or client address. The interface fetches data from the REST API server, which mirrors on-chain state in PostgreSQL for efficient querying.

**Job Details** — Full metadata view including wallet addresses, exact lamport amounts, transaction signatures (linked to Solana Explorer), descriptions, and acceptance criteria.

**Statistics** — Aggregate view showing total jobs, breakdown by status, total SOL in escrow, and oracle health status.

**Submission Interface** — Freelancers attach deliverable artifacts and trigger the oracle verification pipeline. The submission is proxied through the API server to the oracle middleware.

---

## 8. SDK & Public Infrastructure Vision

### 8.1 The Reusable Layer

The Mappers escrow engine and oracle middleware are being open-sourced as a composable SDK. The target interface:

```typescript
import { MappersEscrow, MappersOracle } from "@mappers-protocol/sdk";

// Initialize a job from any Solana application
const escrow = new MappersEscrow(connection, wallet);
await escrow.initializeJob({
  jobId: "uuid-here",
  freelancer: freelancerPublicKey,
  oracle: oraclePublicKey,
  amount: lamports,
});

// Configure oracle with custom verification logic
const oracle = new MappersOracle({
  programId: MAPPERS_PROGRAM_ID,
  verificationFn: async (artifact) => myCustomVerifier(artifact),
});
await oracle.start();
```

### 8.2 Target Integrations

Any protocol that needs trustless task settlement can use the Mappers SDK without deploying their own escrow program:

- **DAO Contributor Systems** — Automatically release bounty payments when AI verifies a code contribution meets acceptance criteria
- **Grant Milestone Verification** — Fund staged milestone releases based on deliverable quality scores
- **Decentralized Marketplaces** — Drop-in payment settlement layer for any peer-to-peer service exchange
- **AI Agent Economies** — Enable autonomous AI agents to commission work from human operators and pay based on verified output

### 8.3 Composability Guarantees

The SDK exposes the full instruction set and all account layouts via the published IDL. Any program can CPI into the Mappers escrow engine, enabling payment flows that are triggered by other on-chain events without requiring a centralized oracle.

---

## 9. Economic Model

### 9.1 Protocol Fees

The v1 protocol charges no fees. All lamports deposited into an escrow flow directly to the intended recipient — freelancer on completion, client on cancellation. Rent paid during escrow initialization is returned in full on account close.

This positions Mappers as genuine public infrastructure, not a fee-extraction layer. Revenue sustainability for the core team comes from grants, ecosystem incentives, and optional premium oracle tier access for high-volume integrators.

### 9.2 Gas Efficiency

A complete job lifecycle (initialize + release) costs approximately:
- `initialize_job`: ~8,000 lamports in transaction fees + ~2,039,280 lamports rent deposit (returned on close)
- `release_payment`: ~5,000 lamports in transaction fees

Total non-recoverable cost to a client and freelancer transacting through Mappers: approximately **13,000 lamports (~$0.002 at current SOL prices)**. This is two to three orders of magnitude cheaper than any centralized platform's fee structure.

### 9.3 No Token Required

Mappers does not introduce a protocol token. All settlement is in native SOL. This is an intentional design choice: adding a token layer introduces liquidity fragmentation, regulatory complexity, and speculative dynamics that are orthogonal to the protocol's goal of being practical infrastructure. A protocol token can be layered on governance in a future version if the ecosystem demands it.

---

## 10. Security Model & Trust Assumptions

### 10.1 What Is Trustless

- Client funds cannot be moved by anyone other than the oracle or the client
- The oracle cannot redirect funds to any address other than the stored `freelancer` or `client` addresses
- Completed escrows are fully settled — no state can be reopened or modified post-resolution
- All state transitions are publicly auditable on-chain

### 10.2 Trust Assumptions

- **Oracle key security** — The system assumes the oracle's private key is held securely. A compromised oracle key could call `release_payment` or `cancel_job` arbitrarily. Mitigation: oracle key is a program-derived address controlled by a multisig in production deployments.
- **AI model correctness** — The system assumes AI verification is accurate for the class of tasks submitted. Models can be wrong, hallucinate, or be manipulated. The dual-model consensus requirement and human arbitration fallback are the primary mitigations.
- **Artifact integrity** — Deliverable artifacts are ingested off-chain. The oracle must correctly retrieve and verify the right artifact for each job. Tampering with the artifact delivery channel before it reaches the oracle is an attack surface.

### 10.3 What Mappers Does Not Solve

Mappers does not solve identity verification. A freelancer's Solana wallet is pseudonymous. Reputation, credential verification, and identity attestation are separate protocol concerns that can be composed on top of Mappers via existing solutions (e.g., Civic, Dialect, on-chain attestation registries).

---

## 11. Technical Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Rust, Anchor Framework 0.30 |
| Runtime | Solana 1.18, SBF (Solana Bytecode Format) |
| API Server | Express 5, Drizzle ORM, PostgreSQL, Pino |
| Frontend | Vite, React 19, TanStack Query, Tailwind CSS, shadcn/ui |
| SDK | TypeScript, Zod, @mappers-protocol/sdk |
| Oracle Runtime | Node.js, Helius gRPC (Yellowstone Geyser) |
| RPC / Streaming | Helius (primary), QuickNode (failover) |
| AI Orchestration | Manus AI Pro |
| AI Verification | Google Gemini API, Anthropic Claude API |
| Package Manager | pnpm (workspaces) |
| Open Source License | MIT |

---

## 12. Roadmap

### Milestone 1 — Core Protocol (Weeks 1–3)
- Anchor escrow program deployed to devnet and mainnet-beta
- Full integration test suite
- Published program IDL
- TypeScript SDK alpha

**Deliverables:** Live program ID, passing test suite, SDK npm package

### Milestone 2 — Oracle Infrastructure (Weeks 4–7)
- Oracle middleware deployed with Helius gRPC integration
- Dual-model AI verification pipeline live (Gemini + Claude)
- Consensus resolution logic with human arbitration fallback
- End-to-end demo: job creation → AI verification → on-chain settlement

**Deliverables:** Running oracle node, documented API, end-to-end demo video

### Milestone 3 — Frontend & SDK Release (Weeks 8–10)
- Next.js client dashboard (job creation, status tracking, submission)
- SDK v1.0 public release with full documentation
- Integration guides for DAO tooling and marketplace use cases
- Mainnet-beta launch

**Deliverables:** Live frontend, SDK docs site, mainnet deployment

---

## 13. Team

**mrphatom** — Protocol Architect & Lead Engineer  
CS/Engineering background with full-stack Solana development experience. Responsible for smart contract architecture, oracle middleware design, and frontend implementation. Augmented by AI development tooling (Manus AI Pro for autonomous execution, Claude for architecture cross-validation) enabling solo-developer velocity comparable to a small team.

---

## 14. Conclusion

Freelance work is one of the largest and fastest-growing economic sectors globally. The infrastructure that facilitates it is extractive, centralized, and fragile. Mappers is a concrete step toward replacing that infrastructure with something open, trustless, and composable.

The protocol is not a platform. It is a primitive — a trust layer that any application can use to settle task-based agreements without a human intermediary. The on-chain escrow engine, the autonomous oracle middleware, and the dual-model AI consensus loop are each independently useful components. Together, they form the foundation for a new class of work coordination systems that don't require trusting any single party.

The code is open. The protocol is public. The infrastructure is for everyone.

---

## Appendix A — Error Reference

| Code | Name | Condition |
|------|------|-----------|
| 6000 | `JobIdTooLong` | `job_id.len() > 32` |
| 6001 | `InvalidAmount` | `amount == 0` |
| 6002 | `AmountBelowRentExemption` | `amount < rent_exempt_minimum` |
| 6003 | `JobNotPending` | `status != Pending` |
| 6004 | `UnauthorizedExecution` | Caller is not client or oracle |
| 6005 | `InvalidFreelancerTarget` | Passed freelancer ≠ stored freelancer |
| 6006 | `InvalidOracleAuthority` | Caller is not stored oracle |
| 6007 | `InvalidClientAuthority` | Passed client ≠ stored client |

---

## Appendix B — Account Space Calculation

```
GigEscrow::MAXIMUM_SPACE = 151 bytes

Breakdown:
  8   Anchor discriminator
  32  client (Pubkey)
  32  freelancer (Pubkey)
  32  oracle (Pubkey)
  8   amount (u64)
  4   job_id length prefix (String)
  32  job_id content maximum (String)
  1   status (JobStatus enum)
  1   escrow_bump (u8)
  1   vault_bump (u8)
```

---

*Mappers Protocol — Open-Source Freelance Settlement Infrastructure*  
*GitHub: github.com/mrphatom/mappers_contract*  
*License: MIT*
