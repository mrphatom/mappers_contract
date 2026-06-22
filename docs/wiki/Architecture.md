# Architecture

Mappers operates through five integrated layers: an on-chain escrow engine, an oracle middleware, a dual-model AI consensus loop, a REST API server, and a client dashboard. This page describes the full system architecture, on-chain account design, job lifecycle, and security properties.

---

## System Overview

```
Dashboard (Vite + React 19)
      | HTTP (TanStack Query hooks)
      v
API Server (Express 5 + Drizzle ORM + PostgreSQL)
      | fetch() to oracle
      v
Oracle Middleware (Node.js)
      | gRPC event stream (Helius)       | parallel AI calls
      v                                  v
On-Chain Escrow Engine          Dual-Model AI Consensus
  (Anchor / Rust)                 Gemini + Claude
  |-- GigEscrow PDA                    |
  |-- Vault PDA                        | consensus
      ^                                v
      |---- release_payment / cancel_job (on-chain tx) ----|
```

### Data Flow

1. **Client creates a job** — The dashboard calls the API server, which registers the job in PostgreSQL. Separately, the client signs an `initialize_job` transaction on-chain.
2. **Oracle detects the job** — The oracle middleware subscribes to Helius gRPC and detects new escrow accounts in real time.
3. **Freelancer submits a deliverable** — The dashboard sends the deliverable to the API server, which proxies it to the oracle.
4. **AI verification** — The oracle dispatches the deliverable to Gemini and Claude in parallel. Both return structured verdicts.
5. **Settlement** — If consensus is reached, the oracle signs either `release_payment` or `cancel_job` on-chain.

---

## Layer 1 — On-Chain Escrow Engine (Anchor / Rust)

Tracks job lifecycle state and holds client funds inside dual Program Derived Address (PDA) vaults. All state transitions are irreversible and publicly auditable on-chain.

### PDA Architecture

Mappers uses **two separate PDAs per job**:

**GigEscrow Account** — stores job metadata and lifecycle state.
```
seeds = ["gig-escrow", client_pubkey, job_id]
```

**Vault Account** — a data-less, System Program-owned account holding locked SOL.
```
seeds = ["vault", client_pubkey, job_id]
```

The separation is required because the vault must be owned by the System Program for native lamport transfers to work. If the vault and escrow were merged, Anchor's ownership model would conflict with the System Program's signer authority requirements during CPI.

Both bumps (`escrow_bump` and `vault_bump`) are stored on the GigEscrow account at initialization, eliminating `find_program_address` calls on resolution instructions (~50,000 CU saved per transaction).

### GigEscrow State Schema

```rust
pub struct GigEscrow {
    pub client:      Pubkey,    // 32 bytes
    pub freelancer:  Pubkey,    // 32 bytes
    pub oracle:      Pubkey,    // 32 bytes
    pub amount:      u64,       // 8 bytes
    pub job_id:      String,    // 4 + 32 bytes (max)
    pub status:      JobStatus, // 1 byte
    pub escrow_bump: u8,        // 1 byte
    pub vault_bump:  u8,        // 1 byte
}
// Total: 151 bytes (including 8-byte Anchor discriminator)
```

### Instruction Set

| Instruction | Caller | Effect |
|---|---|---|
| `initialize_job(job_id, amount)` | Client | Validates inputs, derives PDAs, transfers SOL to vault, sets status to `Pending`. |
| `release_payment()` | Client or Oracle | Validates `Pending` status, transfers vault balance to freelancer, closes escrow (rent returned to client). |
| `cancel_job()` | Oracle only | Validates `Pending` status, refunds vault to client, closes escrow. |

---

## Layer 2 — Oracle Middleware (Node.js)

A persistent off-chain service that bridges on-chain events to the AI verification pipeline.

**Event Detection** — Maintains a gRPC subscription to Helius, streaming all transactions that touch the Mappers program ID. On detecting an `InitializeJob` event:
1. Deserializes the GigEscrow account using the program IDL.
2. Extracts job metadata (job_id, freelancer, oracle, amount).
3. Stores a pending verification record.

**Artifact Ingestion** — When a freelancer submits a deliverable (URL, IPFS hash, text, or JSON), the oracle retrieves it and packages a verification request containing the original job description, acceptance criteria, and the deliverable content.

**Endpoints:**
```
GET  /health      — liveness + pending job count
GET  /jobs/:jobId — tracked job state
POST /submit      — trigger AI verification
```

---

## Layer 3 — Dual-Model AI Consensus Loop

Manus AI Pro orchestrates verification requests to both Gemini and Claude in parallel, with no knowledge sharing between models.

### Verdict Schema (per model)

```json
{
  "verdict": "APPROVED | REJECTED",
  "confidence": 0.0-1.0,
  "reasoning": "string",
  "criteria_met": ["..."],
  "criteria_failed": ["..."]
}
```

### Consensus Resolution

| Gemini | Claude | Outcome |
|---|---|---|
| APPROVED (>= 0.80) | APPROVED (>= 0.80) | `release_payment` — freelancer paid |
| REJECTED (>= 0.75) | REJECTED (>= 0.75) | `cancel_job` — client refunded |
| Divergent | -- | Escalate to human arbitration |
| Sub-threshold | -- | Escalate to human arbitration |

### Why Two Models

A single AI gating payments is a single point of failure. Two independent models with different architectures must agree before funds move. Deliverable artifacts are sanitized with XML delimiters to defend against prompt injection.

---

## Layer 4 — API Server (Express 5)

The REST API (`apps/api-server/`) provides the data layer between the dashboard and the on-chain/oracle systems.

- **Framework:** Express 5 with async route handlers
- **Database:** PostgreSQL via Drizzle ORM (`lib/db/`)
- **Validation:** Zod schemas (`lib/api-zod/`) generated from the OpenAPI spec
- **Logging:** Pino (structured JSON logs)
- **Error handling:** Global error middleware prevents stack trace leaks

The API server mirrors on-chain job state in PostgreSQL for efficient querying, filtering, and aggregation that would be impractical with direct RPC calls.

---

## Layer 5 — Dashboard (Vite + React 19)

The frontend (`apps/dashboard/`) is a single-page application providing real-time visibility into all escrow jobs.

- **Build:** Vite
- **UI:** React 19 + shadcn/ui + Tailwind CSS
- **Data fetching:** TanStack Query via generated hooks (`lib/api-client-react/`)
- **Type safety:** Shared Zod schemas ensure API responses are validated at runtime

---

## Job Lifecycle State Machine

Every job moves through a deterministic state graph enforced on-chain:

```
PENDING ---- (oracle or client approves) ----> COMPLETED
   |
   +---- (oracle arbitrates) ----------------> CANCELLED
```

State transitions are irreversible. Once a job reaches a terminal state, the escrow account is closed and rent is returned to the client. There is no re-open path.

---

## Workspace Package Graph

```
lib/api-spec          (OpenAPI spec, generates code for:)
  |-- lib/api-zod     (Zod schemas for request/response validation)
  |-- lib/api-client-react  (TanStack Query hooks + custom fetch)

lib/db                (Drizzle schema + PostgreSQL connection)
lib/sdk               (MappersClient + OracleClient)

apps/api-server       (imports: lib/db, lib/api-zod)
apps/dashboard        (imports: lib/api-client-react)
```

Code generation flows from `lib/api-spec` (via [orval](https://orval.dev/)) into both `lib/api-zod` and `lib/api-client-react`, ensuring the API contract is always in sync across the server and client.

---

## Security Properties

- **Dual Bump Storage** — Both PDA bumps stored on-chain at initialization, preventing wrong-bump CPI failures.
- **Reentrancy Mitigation** — All state fields cached to stack before any mutable borrow or CPI.
- **Rent Reclamation** — `close = client` constraint ensures zero lamports are permanently locked.
- **Rent-Exempt Floor Guard** — Deposits below ~890,880 lamports are rejected.
- **Double-Spend Prevention** — `JobNotPending` guard + Solana's atomic transactions eliminate race conditions.
- **Signer Forgery Prevention** — `has_one` constraints verify accounts match stored pubkeys before instruction logic runs.
- **Pinned Bump Constraints** — Pinned at the account validation layer, saving compute units.
- **Global Error Handler** — API server catches unhandled errors and returns generic 500 responses (no stack trace leaks).
- **Non-JSON Response Safety** — OracleClient gracefully handles non-JSON responses (e.g., proxy 502 pages) without crashing.

---

## Trust Model

**What is trustless:**
- Client funds cannot be moved by anyone other than the oracle or the client.
- The oracle cannot redirect funds to any address other than the stored freelancer or client.
- Completed escrows are fully settled — no state can be reopened post-resolution.
- All state transitions are publicly auditable on-chain.

**Trust assumptions:**
- **Oracle key security** — A compromised oracle key could arbitrarily release or cancel. Mitigation: multisig-controlled key in production.
- **AI model correctness** — Models can be wrong or manipulated. Mitigations: dual-model consensus + human arbitration fallback.
- **Artifact integrity** — Artifacts are ingested off-chain; tampering before reaching the oracle is an attack surface.

Mappers does not solve identity verification. Wallets are pseudonymous. Reputation and credentials are composable concerns layered on top.

---

See the [SDK Reference](SDK-Reference.md) for programmatic access, [API Reference](API-Reference.md) for the REST endpoints, or [Getting Started](Getting-Started.md) to run the full stack locally.
