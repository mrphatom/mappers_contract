# Architecture

Mappers operates through three tightly coupled layers. This page describes each layer, the on-chain account architecture, the job lifecycle state machine, and the security properties of the escrow program. It is derived from the [whitepaper](../../mappers_whitepaper.md) (sections 3–6, 10) and the root [`README.md`](../../README.md).

---

## System Overview

```
Client (Next.js 14 App Router — Solana Wallet Adapter)
      │ initialize_job (on-chain tx)
      ▼
On-Chain Escrow Engine (Anchor 0.30 / Rust)
  ├─ GigEscrow PDA  — job state
  └─ Vault PDA      — locked SOL custody
      │ Helius gRPC event stream
      ▼
Oracle Middleware (Node.js — Helius/QuickNode gRPC listener)
      │ Event Detection → Artifact Ingestion → Verification Request
      ▼
Dual-Model AI Consensus Loop (Manus AI Pro orchestrator)
  Gemini API (Primary Pass) ──┐
                              ├─ structured JSON consensus check
  Anthropic Claude (Cross-Validator) ──┘
      │ release_payment / cancel_job (tx)
      ▼
On-Chain Program Execution
```

---

## Layer 1 — On-Chain Escrow Engine (Anchor / Rust)

Tracks job lifecycle state and holds client funds inside dual Program Derived Address (PDA) vaults — one for metadata, one for lamports. All state transitions are irreversible and publicly auditable on-chain.

### Program Derived Address Architecture

Mappers uses **two separate PDAs per job**, a pattern critical for security and for enabling the System Program's native lamport transfer CPI:

**GigEscrow Account** — stores all job metadata and lifecycle state.
```
seeds = ["gig-escrow", client_pubkey, job_id]
```

**Vault Account** — a data-less, System Program-owned account that holds the client's locked SOL.
```
seeds = ["vault", client_pubkey, job_id]
```

The separation is non-trivial: the vault must be owned by the System Program for native lamport transfers to work. If the vault and escrow were merged into one account, Anchor's ownership model would conflict with the System Program's signer authority requirements during CPI.

Both bumps — `escrow_bump` and `vault_bump` — are stored on the `GigEscrow` state account at initialization. This eliminates `find_program_address` calls on every `release_payment` and `cancel_job` instruction, saving approximately 25,000 compute units per bump lookup (~50,000 CU total per resolution transaction).

### GigEscrow State Schema

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

Space breakdown:
```
GigEscrow::MAXIMUM_SPACE = 151 bytes
8  (discriminator) + 32 (client) + 32 (freelancer) + 32 (oracle)
+ 8 (amount) + 4 (string prefix) + 32 (job_id) + 1 (status)
+ 1 (escrow_bump) + 1 (vault_bump)
```

### Instruction Set

| Instruction | Caller | Effect |
|---|---|---|
| `initialize_job(job_id, amount)` | Client | Validates `job_id ≤ 32` bytes and `amount` above the rent-exempt floor, derives both PDAs and stores their canonical bumps, transfers `amount` lamports to the vault via System Program CPI, sets status to `Pending`. |
| `release_payment()` | Client (manual) or Oracle (autonomous) | Validates status is `Pending` and caller is `escrow.client` or `escrow.oracle`, transfers full vault balance to the freelancer using stored `vault_bump`, sets status to `Completed`, and closes the escrow via `close = client` (rent returned to client). |
| `cancel_job()` | Oracle only | Validates status is `Pending`, refunds full vault balance to the client, sets status to `Cancelled`, and closes the escrow (rent returned to client). |

---

## Layer 2 — Oracle Middleware (Node.js / TypeScript)

A persistent off-chain microservice that subscribes to live program events via Helius gRPC streaming. It detects `InitializeJob` events, tracks pending escrows, and bridges freelancer submission artifacts to the AI verification pipeline.

**Event Detection** — The middleware maintains a gRPC subscription to a Helius RPC node, streaming all transactions that interact with the Mappers program ID in real time (sub-second notification with full account data). On detecting an `InitializeJob` event it:
1. Deserializes the `GigEscrow` account state using the program IDL.
2. Extracts `job_id`, `freelancer`, `oracle`, and `amount`.
3. Stores a pending verification record indexed by `job_id`.

**Artifact Ingestion** — When a freelancer marks a job submitted, they attach a deliverable artifact (file hash, URL, structured JSON, or combination). The middleware retrieves it and prepares a structured verification request containing the original job description and acceptance criteria, the submitted deliverable, and the escrow metadata.

---

## Layer 3 — Dual-Model AI Consensus Loop

Manus AI Pro acts as orchestrator, dispatching verification requests to the Gemini API and Anthropic Claude API in parallel, with no knowledge sharing between models. Payment releases only when both models independently reach structured JSON consensus with confidence above defined thresholds. Divergent verdicts escalate to human arbitration.

### Verification Verdict Schema

Each model independently returns:
```json
{
  "verdict": "APPROVED" | "REJECTED",
  "confidence": 0.0-1.0,
  "reasoning": "string",
  "criteria_met": ["list of passed criteria"],
  "criteria_failed": ["list of failed criteria"]
}
```

### Consensus Resolution

| Gemini | Claude | Outcome |
|---|---|---|
| APPROVED (≥0.80) | APPROVED (≥0.80) | `release_payment` → freelancer |
| REJECTED (≥0.75) | REJECTED (≥0.75) | `cancel_job` → refund client |
| Divergent (APPROVED/REJECTED) | — | Escalate to human arbitration |
| Sub-threshold | — | Escalate to human arbitration |

- **Approvals** require confidence ≥ 0.80 from **both** models.
- **Rejections** require confidence ≥ 0.75 from **both** models.
- Sub-threshold verdicts are escalated regardless of agreement.

Consensus-driven releases and cancellations are fully autonomous. Divergent verdicts route to a human arbitration queue where the oracle's designated authority keypair (a multisig in production) makes the final call. The majority of straightforward completions settle in seconds with no human involvement.

### Why Two Models

A single AI model gating payments is a single point of failure. Two independent models with different training data, architectures, and API implementations must reach the same conclusion for funds to move — raising the bar for manipulation. Deliverable artifacts are sanitized and framed with explicit XML delimiters instructing the model to treat enclosed content as data, not instructions, as a defense against prompt injection.

---

## Job Lifecycle State Machine

Every job moves through a deterministic state graph enforced entirely on-chain:

```
PENDING ──── (oracle or client approves) ────▶ COMPLETED
   │
   └──── (oracle arbitrates) ───────────────▶ CANCELLED
```

State transitions are irreversible. Once a job is `COMPLETED` or `CANCELLED`, the escrow account is closed and rent is returned to the client. There is no re-open path, no appeal layer, and no mutable state after resolution.

---

## Smart Contract Security

The escrow program incorporates production-grade security measures validated through a full internal security audit:

- **Dual Bump Storage** — Both `escrow_bump` and `vault_bump` are stored separately on-chain at initialization, preventing the critical runtime failure of using the wrong bump when signing vault transfer CPIs (a bug that would silently revert every payout).
- **Reentrancy Mitigation** — All escrow state fields (`client`, `oracle`, `amount`, `vault_bump`, `job_id`, `status`) are cached as stack variables before any mutable borrow or CPI executes, closing cross-program invocation attack vectors that re-read modified state mid-execution.
- **Rent Reclamation** — Both `release_payment` and `cancel_job` carry Anchor's `close = client` constraint. The instant a job resolves, the escrow account is deallocated and 100% of rent-exempt lamports return to the client. Zero lamports are permanently locked post-resolution.
- **Rent-Exempt Floor Guard** — `initialize_job` enforces `amount >= Rent::get()?.minimum_balance(0)` (~890,880 lamports). Deposits below this would leave the vault susceptible to garbage collection before the freelancer can claim.
- **Double-Spend Prevention** — The `JobNotPending` guard (`require!(status == JobStatus::Pending)`) is checked before any transfer. Solana's atomic transactions and per-account state locking eliminate races between concurrent `release_payment` and `cancel_job` calls.
- **Signer Forgery Prevention** — Authority checks use `has_one` constraints (`has_one = freelancer`, `has_one = oracle`, `has_one = client`) at the account validation layer, verifying passed accounts match stored pubkeys before any instruction code runs.
- **Pinned Bump Constraints** — `bump = escrow_account.escrow_bump` and `bump = escrow_account.vault_bump` constraints are pinned at validation, eliminating two `find_program_address` calls per resolution instruction (~50,000 CU saved per transaction).

---

## Trust Model

**What is trustless:**
- Client funds cannot be moved by anyone other than the oracle or the client.
- The oracle cannot redirect funds to any address other than the stored `freelancer` or `client`.
- Completed escrows are fully settled — no state can be reopened or modified post-resolution.
- All state transitions are publicly auditable on-chain.

**Trust assumptions:**
- **Oracle key security** — A compromised oracle key could call `release_payment` or `cancel_job` arbitrarily. Mitigation: a multisig-controlled key in production.
- **AI model correctness** — Models can be wrong, hallucinate, or be manipulated. Mitigations: dual-model consensus and the human arbitration fallback.
- **Artifact integrity** — Artifacts are ingested off-chain; the oracle must retrieve the correct artifact for each job. Tampering before it reaches the oracle is an attack surface.

Mappers does **not** solve identity verification — wallets are pseudonymous. Reputation and credential attestation are composable concerns layered on top (e.g., Civic, Dialect, on-chain attestation registries).

---

See the [Glossary](Glossary.md) for definitions of every term used here, or [Getting Started](Getting-Started.md) to run the stack locally.
