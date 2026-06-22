# Mappers Protocol

**Autonomous, On-Chain Freelance Settlement Infrastructure powered by Cross-Validated AI Oracles on Solana**

---

> **⚠️ Branch Notice — `mini-test`**
> This repository is currently on the `mini-test` branch, which represents an active semi-test of the full Mappers Protocol stack. The smart contract is live on Solana Devnet, the oracle middleware is feature-complete, the API server and database are operational, and the React dashboard with Solana Wallet Adapter integration is running. This branch is used to validate the full integration end-to-end before merging to `main` and targeting Mainnet-Beta. Expect rapid iteration. Breaking changes may occur without notice between commits.

---

## Abstract

The global freelance economy processes over $1.5 trillion in annual contract labor. Platforms like Upwork, Fiverr, and Toptal extract 5–20% in service fees — not for a sophisticated service, but purely to act as a trusted intermediary. Mappers removes that intermediary entirely.

Mappers is a decentralized freelance settlement protocol built natively on Solana. It replaces platform intermediaries with three tightly coupled layers:

1. **On-Chain Escrow Engine** — A gas-optimized Anchor 0.30 / Rust program holding client funds in dual Program Derived Address vaults with production-grade security constraints.
2. **Oracle Middleware** — A persistent Node.js microservice subscribing to live Helius gRPC event streams, detecting on-chain job events and routing deliverables to the AI verification pipeline.
3. **Dual-Model AI Consensus Loop** — Gemini and Claude running in parallel, with no knowledge sharing, releasing escrow funds only when both models independently reach structured consensus above defined confidence thresholds.

When a freelancer delivers work, the AI system evaluates the output and triggers a cryptographic payment release — with no human approvals, no platform fees, and no counterparty risk.

---

## What's Built (Current State)

| Layer | Status | Details |
|---|---|---|
| Anchor/Rust escrow program | ✅ Live on Devnet | Program ID: `52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu` |
| Oracle middleware | ✅ Feature-complete | Helius gRPC listener, Gemini + Claude consensus, on-chain tx signer |
| TypeScript SDK | ✅ Built | `@mappers-protocol/sdk` — `MappersClient`, `OracleClient`, PDAs |
| Express API server | ✅ Running | PostgreSQL + Drizzle ORM, OpenAPI spec, generated Zod schemas + React Query hooks |
| React/Vite dashboard | ✅ Running | 5-page UI, mobile-first, Solana Wallet Adapter, dual-mode job creation |
| Anchor integration tests | ✅ Written | Full lifecycle test suite (localnet + devnet) |
| Mainnet-Beta deployment | 🔜 Pending | Targeting Q4 2026 |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT / DASHBOARD                      │
│         React 19 + Vite — Solana Wallet Adapter             │
│         Phantom / Backpack — Devnet                         │
└────────────────────────────┬────────────────────────────────┘
                             │  initialize_gig (on-chain tx)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                   ON-CHAIN ESCROW ENGINE                    │
│     Anchor 0.30 / Rust — SBF — Solana Devnet               │
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐        │
│  │   GigEscrow PDA      │  │     Vault PDA         │        │
│  │  seeds: "gig-escrow" │  │  seeds: "vault"       │        │
│  │  + client + job_id   │  │  + client + job_id    │        │
│  │  (state + metadata)  │  │  (locked SOL custody) │        │
│  └──────────────────────┘  └──────────────────────┘        │
└────────────────────────────┬────────────────────────────────┘
                             │  Helius gRPC event stream
                             │  (Yellowstone Geyser — sub-second)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                   ORACLE MIDDLEWARE                         │
│     Node.js / TypeScript — Helius gRPC Subscriber          │
│                                                             │
│  Event Detection → Job Store → Artifact Ingestion           │
│  → Verification Request Builder                             │
└────────────────────────────┬────────────────────────────────┘
                             │  parallel dispatch (no shared state)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                DUAL-MODEL AI CONSENSUS LOOP                 │
│                                                             │
│  Google Gemini API ──────┐                                  │
│  (Primary Pass)          ├─ Structured JSON verdicts        │
│                          │  + confidence threshold check    │
│  Anthropic Claude API ───┘                                  │
│  (Cross-Validator)                                          │
│                                                             │
│  Both ≥ 0.80 APPROVED  →  release_payment (freelancer)     │
│  Both ≥ 0.75 REJECTED  →  cancel_job (refund client)       │
│  Divergent / Sub-threshold  →  Human Arbitration Queue      │
└────────────────────────────┬────────────────────────────────┘
                             │  on-chain tx (oracle keypair)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              ON-CHAIN PROGRAM EXECUTION                     │
│   release_payment()  →  Vault → Freelancer                 │
│   cancel_job()       →  Vault → Client (refund)            │
│   Escrow closed, rent returned to client                    │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    API LAYER (REST)                         │
│     Express 5 + PostgreSQL — tracks off-chain job state    │
│     OpenAPI spec → Zod schemas + React Query hooks (codegen)│
└─────────────────────────────────────────────────────────────┘
```

---

## Repository Structure

```
mappers_contract/
│
├── programs/
│   └── project_mappers/
│       └── src/
│           └── lib.rs                  # Anchor/Rust escrow program — all three instructions,
│                                       # PDA derivation, security guards, CPI logic
│
├── tests/
│   └── project_mappers.ts              # Anchor integration test suite (mocha/chai)
│                                       # Tests: initialize_job, release_payment, cancel_job
│                                       # Runs on localnet or devnet
│
├── oracle/                             # Standalone Node.js microservice (npm, not pnpm)
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example                    # Template for all required secrets
│   ├── idl.json                        # Runtime copy of the compiled Anchor IDL
│   └── src/
│       ├── index.ts                    # Express HTTP server entry point (health + submit endpoints)
│       ├── listener.ts                 # Helius Yellowstone gRPC subscriber + account decoder
│       │                              # Borsh-decodes GigEscrow accounts, populates job store
│       ├── verification.ts             # Dual-model AI consensus engine
│       │                              # Gemini + Claude parallel verification
│       │                              # Structured JSON verdict schema + threshold logic
│       ├── chain.ts                    # On-chain transaction builder and signer
│       │                              # Derives vault PDA, builds + submits release/cancel tx
│       ├── store.ts                    # In-memory pending job registry (keyed by job_id)
│       │                              # Note: not persisted across oracle restarts
│       ├── config.ts                   # Environment variable loader + validation
│       └── types.ts                    # Shared TypeScript interfaces: GigEscrow, StoredJob,
│                                       # ModelVerdict, ConsensusResult, SubmissionArtifact
│
├── lib/                                # pnpm workspace shared libraries
│   ├── sdk/                            # @mappers-protocol/sdk
│   │   └── src/
│   │       ├── index.ts                # Public API exports
│   │       ├── client.ts               # MappersClient — initializeJob, releasePayment, cancelJob
│   │       ├── oracle.ts               # OracleClient — HTTP wrapper for oracle endpoints
│   │       ├── pda.ts                  # deriveEscrowPda, deriveVaultPda
│   │       ├── constants.ts            # MAPPERS_PROGRAM_ID, PDA_SEEDS, JOB_ID_MAX_LENGTH
│   │       ├── types.ts                # GigEscrowAccount, InitializeJobParams, etc.
│   │       └── idl.ts                  # Inline Anchor IDL (TypeScript)
│   │
│   ├── db/                             # @workspace/db
│   │   └── src/
│   │       └── schema/
│   │           └── jobs.ts             # Drizzle ORM jobs table schema + Zod insert/select types
│   │
│   ├── api-spec/                       # @workspace/api-spec
│   │   └── openapi.yaml                # OpenAPI 3.1 spec — all REST endpoints
│   │
│   ├── api-zod/                        # @workspace/api-zod  (codegen output)
│   │   └── src/                        # Zod schemas for request/response validation
│   │
│   └── api-client-react/               # @workspace/api-client-react  (codegen output)
│       └── src/                        # React Query hooks: useGetJob, useCreateJob, etc.
│
├── artifacts/
│   ├── api-server/                     # @workspace/api-server
│   │   └── src/
│   │       ├── index.ts                # Server entrypoint (binds PORT)
│   │       ├── app.ts                  # Express app — CORS, pino logger, route registration
│   │       ├── lib/
│   │       │   └── logger.ts           # Pino singleton logger
│   │       └── routes/
│   │           ├── index.ts            # Router aggregation
│   │           ├── health.ts           # GET /api/healthz
│   │           └── jobs.ts             # GET|POST /api/jobs, GET|PATCH /api/jobs/:jobId
│   │                                   # POST /api/jobs/:jobId/submit
│   │                                   # GET /api/stats, GET /api/oracle/health (proxy)
│   │
│   └── dashboard/                      # @workspace/dashboard
│       └── src/
│           ├── App.tsx                 # Router (wouter), shell layout, SolanaWalletProvider
│           ├── main.tsx                # React 19 entry point
│           ├── pages/
│           │   ├── dashboard.tsx       # Protocol overview, stats cards, recent jobs
│           │   ├── jobs.tsx            # Searchable, filterable job list (card/table view)
│           │   ├── create-job.tsx      # Dual-mode: DB-only or sign initialize_gig on-chain
│           │   ├── job-detail.tsx      # Full job view, deliverable submission, oracle status
│           │   ├── oracle.tsx          # Oracle middleware health + protocol info
│           │   └── not-found.tsx       # 404 page
│           ├── components/
│           │   ├── wallet-provider.tsx # ConnectionProvider + WalletProvider (devnet)
│           │   ├── wallet-button.tsx   # Custom terminal-themed wallet connect/disconnect
│           │   ├── job-card.tsx        # Mobile job card component
│           │   ├── status-badge.tsx    # Pending / Completed / Cancelled badge
│           │   └── ui/                 # shadcn/ui component library
│           └── hooks/
│               └── use-mappers-client.ts # Builds MappersClient from connected wallet
│
├── docs/
│   └── wiki/                           # Protocol documentation (wiki-exportable Markdown)
│       ├── Architecture.md             # Layer-by-layer system design, PDA schema, security
│       ├── Getting-Started.md          # Prerequisites, setup, oracle API reference
│       ├── Glossary.md                 # All terms, account types, error codes
│       └── Home.md                     # Wiki landing page
│
├── idl.json                            # Compiled Anchor IDL (root — used by tests)
├── Anchor.toml                         # Anchor config (devnet + localnet program IDs)
├── Cargo.toml                          # Rust workspace root
├── Cargo.lock
├── tsconfig.anchor.json                # TypeScript config for Anchor test suite only
├── tsconfig.base.json                  # Shared strict TS base for pnpm workspace libs
├── tsconfig.json                       # pnpm workspace TS solution file (composite libs)
├── pnpm-workspace.yaml                 # Workspace packages, catalog pins, security policy
├── package.json                        # Root scripts: typecheck, build, test:anchor
├── Makefile                            # Development shortcuts (build, test, oracle, e2e)
└── mappers_whitepaper.md               # Full protocol whitepaper (v1.0)
```

---

## Stack

### Smart Contract
| | |
|---|---|
| Language | Rust |
| Framework | Anchor 0.30 |
| Target | Solana SBF |
| Network | Devnet (Mainnet-Beta pending) |

### Oracle Middleware
| | |
|---|---|
| Runtime | Node.js 18+ |
| Language | TypeScript |
| HTTP | Express 4 |
| Blockchain event stream | Helius Yellowstone gRPC (`@triton-one/yellowstone-grpc`) |
| AI — Primary | Google Gemini API (`@google/generative-ai`) |
| AI — Cross-Validator | Anthropic Claude API (`@anthropic-ai/sdk`) |
| On-chain interaction | `@coral-xyz/anchor`, `@solana/web3.js` |

### API Server
| | |
|---|---|
| Runtime | Node.js 20+ |
| Language | TypeScript (strict) |
| Framework | Express 5 |
| Database | PostgreSQL |
| ORM | Drizzle ORM |
| Validation | Zod (generated from OpenAPI) |
| Logging | pino + pino-http |
| API Contract | OpenAPI 3.1 → codegen (Orval) |

### SDK (`@mappers-protocol/sdk`)
| | |
|---|---|
| Language | TypeScript |
| On-chain | `@coral-xyz/anchor` + `@solana/web3.js` |
| Exports | `MappersClient`, `OracleClient`, `deriveEscrowPda`, `deriveVaultPda`, types |

### Dashboard
| | |
|---|---|
| Framework | React 19 + Vite 7 |
| Routing | wouter |
| Wallet | `@solana/wallet-adapter-react` + Phantom adapter |
| Data fetching | React Query (generated hooks) |
| UI | Tailwind CSS 4 + shadcn/ui components |
| Node polyfills | `vite-plugin-node-polyfills` (Buffer, process) |
| Theme | Dark terminal — green `#14F195` / purple `#9945FF` |

---

## On-Chain Program

**Program ID (Devnet):** [`52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu`](https://explorer.solana.com/address/52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu?cluster=devnet)

### PDA Architecture

Mappers uses **two separate PDAs per job**:

```
GigEscrow PDA   seeds = ["gig-escrow", client_pubkey, job_id]
                Holds all job metadata and lifecycle state (151 bytes)

Vault PDA       seeds = ["vault", client_pubkey, job_id]
                Data-less, System Program-owned — holds the locked SOL
```

The separation is architecturally required: the vault must be System Program-owned for native lamport CPI transfers to work. Merging the two accounts would break the CPI signing model.

Both bumps (`escrow_bump`, `vault_bump`) are stored on-chain at initialization, eliminating `find_program_address` calls during resolution (~50,000 CU saved per resolution transaction).

### GigEscrow Account Schema

```rust
pub struct GigEscrow {
    pub client:      Pubkey,    // 32 bytes — original funder, refund target
    pub freelancer:  Pubkey,    // 32 bytes — payment recipient
    pub oracle:      Pubkey,    // 32 bytes — authorized AI middleware key
    pub amount:      u64,       //  8 bytes — locked lamports
    pub job_id:      String,    // 36 bytes — max 32-char identifier + 4-byte length prefix
    pub status:      JobStatus, //  1 byte  — Pending | Completed | Cancelled
    pub escrow_bump: u8,        //  1 byte  — GigEscrow PDA canonical bump
    pub vault_bump:  u8,        //  1 byte  — Vault PDA canonical bump
}
// Total: 151 bytes (including 8-byte Anchor discriminator)
```

### Instruction Set

| Instruction | Authorized Caller | Effect |
|---|---|---|
| `initialize_job(job_id, amount)` | Client | Validates `job_id ≤ 32` bytes and `amount ≥ rent-exempt floor (~890,880 lamports)`. Derives both PDAs and stores bumps. Transfers `amount` lamports to vault via System Program CPI. Sets status → `Pending`. |
| `release_payment()` | Client **or** Oracle | Validates `Pending` status and caller authority. Transfers vault balance to freelancer. Sets status → `Completed`. Closes escrow (`close = client` — rent returned). |
| `cancel_job()` | Oracle **only** | Validates `Pending` status. Refunds vault balance to client. Sets status → `Cancelled`. Closes escrow (rent returned to client). |

### Error Codes

| Code | Name | Condition |
|---|---|---|
| 6000 | `JobIdTooLong` | `job_id.len() > 32` |
| 6001 | `InvalidAmount` | `amount == 0` |
| 6002 | `AmountBelowRentExemption` | `amount < ~890,880 lamports` |
| 6003 | `JobNotPending` | Job already resolved (Completed or Cancelled) |
| 6004 | `UnauthorizedExecution` | Caller is neither client nor oracle |
| 6005 | `InvalidFreelancerTarget` | Passed freelancer ≠ stored freelancer |
| 6006 | `InvalidOracleAuthority` | Caller is not the stored oracle |
| 6007 | `InvalidClientAuthority` | Passed client ≠ stored client |

### Job Lifecycle State Machine

```
                    initialize_job()
                         │
                         ▼
                     [ PENDING ]
                    /           \
   release_payment()             cancel_job()
   (client or oracle)            (oracle only)
          │                           │
          ▼                           ▼
     [COMPLETED]               [CANCELLED]
   funds → freelancer         funds → client
   escrow closed              escrow closed
   rent → client              rent → client
```

All state transitions are irreversible and enforced entirely on-chain. There is no re-open path.

---

## Quick Start

### Prerequisites

- **Rust** — [rustup.rs](https://rustup.rs) + `solana-cli` 1.18
- **Anchor CLI** 0.30 — [anchor-lang.com/docs/installation](https://www.anchor-lang.com/docs/installation)
- **Node.js** 18+ and **pnpm** 9+
- **PostgreSQL** — connection string in `DATABASE_URL`
- A funded Solana devnet wallet (for testing `initialize_job`)

---

### 1 — Smart Contract

```bash
# Build the Anchor program
anchor build

# Run the full integration test suite (localnet)
pnpm run test:anchor

# Or using the Makefile
make build
make test

# Deploy to devnet (already deployed — use this to redeploy)
anchor deploy --provider.cluster devnet
```

The compiled IDL is at `idl.json` (workspace root) and `oracle/idl.json`.

---

### 2 — Oracle Middleware

The oracle is a standalone npm package (not part of the pnpm workspace).

```bash
cd oracle
npm install
cp .env.example .env
```

Fill in `.env`:

```env
SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=<YOUR_KEY>
PROGRAM_ID=52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu
ORACLE_PRIVATE_KEY=<BASE58_KEYPAIR>
HELIUS_GRPC_ENDPOINT=<YOUR_HELIUS_GRPC_ENDPOINT>
HELIUS_API_KEY=<YOUR_HELIUS_API_KEY>
GEMINI_API_KEY=<YOUR_GEMINI_API_KEY>
ANTHROPIC_API_KEY=<YOUR_ANTHROPIC_API_KEY>
PORT=3001
```

```bash
npm run dev   # or: make oracle-dev
```

**Never commit secrets.** `.env` and all keypair files are git-ignored.

#### Oracle Environment Variables

| Variable | Description |
|---|---|
| `SOLANA_RPC_URL` | Helius RPC URL with API key |
| `PROGRAM_ID` | Deployed escrow program ID |
| `ORACLE_PRIVATE_KEY` | Base58 oracle keypair (must match the `oracle` pubkey on each GigEscrow account) |
| `HELIUS_GRPC_ENDPOINT` | Yellowstone gRPC endpoint |
| `HELIUS_API_KEY` | Helius API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `PORT` | Oracle HTTP port (default `3001`) |

---

### 3 — API Server + Dashboard

```bash
# Install all workspace dependencies
pnpm install

# Push the database schema (dev only)
pnpm --filter @workspace/db run push

# Start the API server (port 5000)
pnpm --filter @workspace/api-server run dev

# Start the dashboard (auto-assigned port)
pnpm --filter @workspace/dashboard run dev
```

If you change the OpenAPI spec, regenerate the hooks and schemas:

```bash
pnpm --filter @workspace/api-spec run codegen
```

Full typecheck across all packages:

```bash
pnpm run typecheck
```

---

## SDK — `@mappers-protocol/sdk`

The TypeScript SDK provides a high-level client for both the on-chain program and the oracle middleware. It is built as a composite pnpm workspace library (`lib/sdk/`) and consumed directly by the dashboard.

### MappersClient

```typescript
import { MappersClient } from "@mappers-protocol/sdk";
import { AnchorProvider } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const provider   = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
const client     = new MappersClient(provider);

// Initialize an escrow on-chain
const txSig = await client.initializeJob({
  jobId:      "gig-042",           // max 32 characters
  amount:     new BN(1_500_000_000), // 1.5 SOL in lamports
  freelancer: new PublicKey("9Kx2bP..."),
  oracle:     new PublicKey("52yt1g..."),
});

// Derive PDAs (without RPC call)
const [escrowPda] = client.deriveEscrowPda(walletPublicKey, "gig-042");
const [vaultPda]  = client.deriveVaultPda(walletPublicKey, "gig-042");

// Fetch on-chain state
const escrow = await client.fetchEscrow(escrowPda);
console.log(escrow.status, escrow.amount.toString());

// Read all escrows
const all = await client.fetchAllEscrows();

// Fetch by client wallet
const mine = await client.fetchEscrowsByClient(walletPublicKey);
```

### OracleClient

```typescript
import { OracleClient } from "@mappers-protocol/sdk";

const oracle = new OracleClient("http://localhost:3001");

// Liveness
const health = await oracle.health();
// { status: "ok", pendingJobs: 3, timestamp: "..." }

// Trigger AI verification
const result = await oracle.submitDeliverable({
  jobId:               "gig-042",
  description:         "Build a Solana token staking UI",
  acceptanceCriteria:  ["Stake button works", "APY displays correctly", "Mobile responsive"],
  deliverable:         "https://github.com/user/staking-ui",
  deliverableType:     "url",
});
// { success: true, jobId: "gig-042", outcome: "RELEASE", txSig: "5K..." }
```

### PDA Utilities

```typescript
import { deriveEscrowPda, deriveVaultPda, MAPPERS_PROGRAM_ID } from "@mappers-protocol/sdk";

const [escrowPda, escrowBump] = deriveEscrowPda(clientPublicKey, "gig-042");
const [vaultPda,  vaultBump]  = deriveVaultPda(clientPublicKey, "gig-042");
```

---

## API Reference

Base URL: `/api`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/healthz` | Server health check |
| `GET` | `/jobs` | List all jobs (`?status=pending&clientPubkey=...`) |
| `POST` | `/jobs` | Register a new job in the database |
| `GET` | `/jobs/:jobId` | Fetch a single job by ID |
| `PATCH` | `/jobs/:jobId` | Update job status or metadata |
| `POST` | `/jobs/:jobId/submit` | Submit a deliverable for AI verification |
| `GET` | `/stats` | Dashboard stats (total jobs, escrowed SOL, by status) |
| `GET` | `/oracle/health` | Proxy to oracle health endpoint |

The full OpenAPI 3.1 spec lives at [`lib/api-spec/openapi.yaml`](lib/api-spec/openapi.yaml).

### POST /api/jobs — Create Job

```json
{
  "jobId":             "gig-042",
  "clientPubkey":      "6LUVzT...",
  "freelancerPubkey":  "9Kx2bP...",
  "oraclePubkey":      "52yt1g...",
  "amountLamports":    "1500000000",
  "description":       "Build a Solana token staking UI",
  "acceptanceCriteria": ["Stake button works", "APY displays"]
}
```

### POST /api/jobs/:jobId/submit — Submit Deliverable

```json
{
  "deliverable":     "https://github.com/user/repo",
  "deliverableType": "url"
}
```

This triggers the oracle's AI verification pipeline. The oracle fetches the job's acceptance criteria from the store and calls both AI models in parallel.

---

## Oracle HTTP API

The oracle exposes a lightweight HTTP API (default port `3001`):

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Liveness check + count of jobs pending AI verification |
| `GET` | `/jobs/:jobId` | Fetch tracked on-chain job state (from the in-memory store) |
| `POST` | `/submit` | Trigger AI verification for a submitted deliverable |

### POST /submit Payload

```json
{
  "jobId":             "gig-042",
  "description":       "Original job brief",
  "acceptanceCriteria": ["criterion 1", "criterion 2"],
  "deliverable":       "https://link-to-work or raw content",
  "deliverableType":   "url | text | json | ipfs"
}
```

### Response

```json
{
  "success":  true,
  "jobId":    "gig-042",
  "outcome":  "RELEASE",
  "txSig":    "5K3dX9..."
}
```

`outcome` is one of: `RELEASE` (funds sent to freelancer), `REFUND` (funds returned to client), `ESCALATE` (divergent verdicts — human arbitration required).

---

## AI Consensus Engine

Gemini and Claude receive identical structured prompts with no knowledge sharing. Each returns a structured JSON verdict independently.

### Verdict Schema (per model)

```json
{
  "verdict":         "APPROVED | REJECTED",
  "confidence":      0.0,
  "reasoning":       "string",
  "criteria_met":    ["list of passed criteria"],
  "criteria_failed": ["list of failed criteria"]
}
```

### Consensus Resolution Table

| Gemini | Claude | Outcome |
|---|---|---|
| APPROVED (≥ 0.80) | APPROVED (≥ 0.80) | `release_payment` → freelancer |
| REJECTED (≥ 0.75) | REJECTED (≥ 0.75) | `cancel_job` → refund client |
| APPROVED / REJECTED | — | Escalate to human arbitration |
| Either sub-threshold | — | Escalate to human arbitration |

- Approvals require **≥ 0.80 confidence from both models**.
- Rejections require **≥ 0.75 confidence from both models**.
- Any disagreement or sub-threshold result routes to the human arbitration queue.

### Prompt Injection Defense

Deliverable artifacts are wrapped in explicit XML delimiters before being included in the verification prompt:

```
<deliverable type="url">
  https://...
</deliverable>
```

Models are instructed to treat content inside these tags as data, not instructions. This is the primary defense against adversarial deliverables crafted to manipulate the AI verdict.

---

## Security Properties

The escrow program has been designed with the following production-grade security properties:

| Property | Implementation |
|---|---|
| **Dual bump storage** | Both `escrow_bump` and `vault_bump` stored on-chain at init — prevents CPI signing failures from wrong bump on payout |
| **Reentrancy mitigation** | All escrow fields cached as stack variables before any CPI executes — closes cross-program re-read attack vectors |
| **Rent reclamation** | `close = client` on both `release_payment` and `cancel_job` — zero lamports permanently locked post-resolution |
| **Rent-exempt floor** | `initialize_job` enforces `amount ≥ ~890,880 lamports` — vaults below this would be garbage-collected before freelancer can claim |
| **Double-spend prevention** | `JobNotPending` guard checked before every transfer — Solana's atomic tx model + per-account locking eliminates races |
| **Signer forgery prevention** | `has_one = freelancer`, `has_one = oracle`, `has_one = client` constraints at validation layer — checked before instruction logic runs |
| **Pinned bump constraints** | `bump = escrow_account.escrow_bump` pinned at validation — saves ~50,000 CU per resolution tx |

### Trust Model

**What is trustless:**
- Client funds cannot be moved to any address except the stored `freelancer` (release) or `client` (cancel).
- The oracle cannot direct funds to any address it chooses — only to the on-chain-stored parties.
- Completed escrows are fully settled and immutable — no state can be reopened post-resolution.
- All state transitions are publicly auditable on-chain.

**Trust assumptions:**
- **Oracle key security** — A compromised oracle key could call `release_payment` or `cancel_job` arbitrarily. Mitigation: use a multisig-controlled keypair in production.
- **AI model correctness** — Models can err or hallucinate. Mitigations: dual-model consensus + human arbitration fallback.
- **Artifact integrity** — Deliverables are ingested off-chain; tampering before it reaches the oracle is an attack surface outside the smart contract's scope.

---

## Database Schema

The API server tracks jobs in a PostgreSQL `jobs` table (Drizzle ORM):

| Column | Type | Description |
|---|---|---|
| `jobId` | `text` (PK) | Matches the on-chain `job_id` field |
| `clientPubkey` | `text` | Client wallet address (base58) |
| `freelancerPubkey` | `text` | Freelancer wallet address (base58) |
| `oraclePubkey` | `text` | Oracle wallet address (base58) |
| `amountLamports` | `text` | Escrowed amount in lamports (stored as string, safe for u64) |
| `status` | `enum` | `pending \| completed \| cancelled` |
| `description` | `text` (nullable) | Job brief |
| `acceptanceCriteria` | `text[]` (nullable) | AI evaluation criteria |
| `createdAt` | `timestamp` | Auto-set at insert |
| `updatedAt` | `timestamp` | Auto-updated |

Push schema changes (development only):

```bash
pnpm --filter @workspace/db run push
```

---

## Dashboard

The React/Vite dashboard provides a full operator interface:

| Page | Route | Description |
|---|---|---|
| Dashboard | `/` | Protocol stats, escrowed SOL total, recent jobs |
| All Jobs | `/jobs` | Searchable, filterable job list with status badges |
| Create Job | `/jobs/new` | Dual-mode: DB registration only, or sign `initialize_gig` on devnet |
| Job Detail | `/jobs/:jobId` | Full job view — submit deliverable, oracle verdict, transaction links |
| Oracle Status | `/oracle` | Oracle middleware health, consensus thresholds, protocol info |

### Wallet Integration

When a Phantom (or compatible) wallet is connected:
- The **Client Public Key** field on Create Job auto-fills from the connected address.
- The **"Register + Init On-Chain"** button builds the `initialize_gig` instruction, requests wallet signature, submits to devnet, and records the transaction signature in the database.
- Transaction status is shown inline with a Solana Explorer link.

The wallet button (Connect / address dropdown) appears in the desktop sidebar, mobile header, and mobile drawer — all matching the terminal theme.

---

## Development Commands

```bash
# Full typecheck (all packages)
pnpm run typecheck

# Build everything
pnpm run build

# Anchor integration tests (requires Anchor CLI + local validator)
pnpm run test:anchor

# Regenerate API hooks + Zod schemas from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Push DB schema (dev only)
pnpm --filter @workspace/db run push

# Run API server
pnpm --filter @workspace/api-server run dev

# Run dashboard
pnpm --filter @workspace/dashboard run dev

# Oracle (in oracle/ directory)
cd oracle && npm run dev
```

---

## Documentation

Full protocol documentation lives in [`docs/wiki/`](docs/wiki/):

| Document | Description |
|---|---|
| [Architecture](docs/wiki/Architecture.md) | Layer-by-layer system design, PDA schema, on-chain account architecture, security properties, trust model |
| [Getting Started](docs/wiki/Getting-Started.md) | Prerequisites, install, test, oracle HTTP API, end-to-end demo |
| [Glossary](docs/wiki/Glossary.md) | Definitions of every term: accounts, roles, states, AI consensus terms, error codes |

The full protocol whitepaper (v1.0) is at [`mappers_whitepaper.md`](mappers_whitepaper.md).

---

## Project Status & Roadmap

This is the `mini-test` branch — a working end-to-end integration proving out the full stack before the `main` branch hardening pass and Mainnet-Beta launch.

| Milestone | Status |
|---|---|
| Anchor program — devnet deployment | ✅ Done |
| Anchor integration test suite | ✅ Done |
| Oracle — Helius gRPC listener | ✅ Done |
| Oracle — dual-model AI consensus | ✅ Done |
| Oracle — on-chain tx builder | ✅ Done |
| TypeScript SDK (`@mappers-protocol/sdk`) | ✅ Done |
| Express API server + PostgreSQL | ✅ Done |
| OpenAPI spec + codegen (Orval) | ✅ Done |
| React/Vite dashboard — 5 pages | ✅ Done |
| Solana Wallet Adapter integration | ✅ Done |
| On-chain `initialize_gig` from dashboard | ✅ Done |
| Mobile-first responsive UI | ✅ Done |
| Production oracle key (multisig) | 🔜 Pending |
| Mainnet-Beta deployment | 🔜 Q4 2026 |
| SDK — npm publish (`@mappers-protocol/sdk`) | 🔜 Pending |
| Reputation / attestation layer | 🔜 Planned |

---

## License

[MIT](LICENSE)

---

*Mappers Protocol — Autonomous, On-Chain Freelance Settlement Infrastructure*  
*Solana Mainnet-Beta Target: Q4 2026*
