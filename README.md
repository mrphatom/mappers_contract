# Mappers Protocol

> Autonomous, On-Chain Freelance Settlement Infrastructure — Powered by Cross-Validated AI Oracles on Solana.

Mappers is a decentralized freelance escrow protocol built natively on Solana using the Anchor framework. It eliminates counterparty risk and platform intermediaries by replacing slow, costly human arbitration with an automated dual-model AI consensus verification loop. When a freelancer delivers work, an AI oracle evaluates the output and triggers a cryptographic, programmatic payment release — no approvals, no platform fees, no counterparty risk.

**Program ID (Devnet):** `52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu`

---

## Architecture Overview

Mappers operates through three tightly coupled layers:

**1 — On-Chain Escrow Engine (Anchor / Rust)**
Tracks job lifecycle state and holds client funds inside dual Program Derived Address (PDA) vaults — one for metadata, one for lamports. All state transitions are irreversible and publicly auditable on-chain.

**2 — Oracle Middleware (Node.js / TypeScript)**
A persistent off-chain microservice that subscribes to live program events via Helius gRPC streaming. Detects `InitializeJob` events, tracks pending escrows, and bridges freelancer submission artifacts to the AI verification pipeline.

**3 — Dual-Model AI Consensus Loop**
Manus AI Pro acts as orchestrator, dispatching verification requests to the Gemini API and Anthropic Claude API in parallel with no knowledge sharing between models. Payment releases only when both models independently reach structured JSON consensus with confidence above defined thresholds. Divergent verdicts escalate to human arbitration.

```
Client (Next.js)
      │ initialize_job
      ▼
On-Chain Escrow Engine (Anchor)
  ├─ GigEscrow PDA  — job state
  └─ Vault PDA      — locked SOL
      │ Helius gRPC stream
      ▼
Oracle Middleware (Node.js)
      │ parallel verification
      ▼
Gemini API ──── Manus AI ──── Claude API
                   │ consensus
                   ▼
         release_payment / cancel_job
```

---

## Smart Contract Security

The escrow program incorporates production-grade security measures validated through a full internal security audit:

**Dual Bump Storage** — Both the `GigEscrow` PDA bump (`escrow_bump`) and the Vault PDA bump (`vault_bump`) are stored separately on-chain at initialization. This prevents the critical runtime failure caused by using the wrong bump when signing vault transfer CPIs — a bug that would silently cause every payout to revert.

**Reentrancy Mitigation** — All escrow state fields are cached as stack variables before any mutable borrow or CPI executes. This closes cross-program invocation attack vectors that attempt to re-read modified state mid-execution.

**Rent Reclamation** — Both `release_payment` and `cancel_job` carry Anchor's `close = client` constraint. The instant a job resolves, the escrow account is deallocated and 100% of rent-exempt lamports return to the client automatically. Zero lamports are permanently locked post-resolution.

**Rent-Exempt Floor Guard** — `initialize_job` enforces `amount >= Rent::get()?.minimum_balance(0)` (~890,880 lamports). Deposits below this threshold would leave the vault susceptible to garbage collection by the runtime before the freelancer can claim.

**Pinned Bump Constraints** — All `bump = escrow_account.escrow_bump` and `bump = escrow_account.vault_bump` constraints are pinned at the account validation layer. This eliminates two `find_program_address` calls per resolution instruction, saving ~50,000 compute units per transaction.

**Space Allocation**
```
GigEscrow::MAXIMUM_SPACE = 151 bytes
8  (discriminator) + 32 (client) + 32 (freelancer) + 32 (oracle)
+ 8 (amount) + 4 (string prefix) + 32 (job_id) + 1 (status)
+ 1 (escrow_bump) + 1 (vault_bump)
```

---

## Repository Structure

```
mappers_contract/
├── programs/
│   └── project_mappers/
│       └── src/
│           └── lib.rs          # Core escrow logic, PDA architecture, security gates
├── tests/
│   └── project_mappers.ts      # Anchor integration test suite (devnet + localnet)
├── oracle/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── idl.json                # Copy of compiled IDL for oracle runtime
│   └── src/
│       ├── index.ts            # Entry point — boots gRPC listener + HTTP server
│       ├── listener.ts         # Helius gRPC subscription, account decoder, job tracking
│       ├── verification.ts     # Gemini + Claude parallel verification, consensus engine
│       ├── chain.ts            # On-chain transaction builder and signer
│       ├── store.ts            # In-memory pending job registry
│       ├── config.ts           # Environment variable loader and validator
│       └── types.ts            # Shared TypeScript interfaces
├── Anchor.toml
├── Cargo.toml
├── package.json                # Root — test runner dependencies (ts-mocha, chai)
├── tsconfig.json               # Root — TypeScript config for test suite
└── idl.json                    # Compiled program IDL (8 instructions, 8 error codes)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Rust, Anchor Framework 0.30 |
| Solana Runtime | SBF, Solana CLI 1.18 |
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS |
| Wallet | Solana Wallet Adapter |
| Oracle Runtime | Node.js, TypeScript |
| RPC / Streaming | Helius (primary gRPC), QuickNode (failover) |
| AI Orchestration | Manus AI Pro |
| AI Verification | Google Gemini API, Anthropic Claude API |
| Observability | Sentry |
| License | MIT |

---

## Program Interface

### Instructions

**`initialize_job(job_id: String, amount: u64)`**
Client deposits SOL into a vault PDA and registers freelancer + oracle addresses. Enforces rent-exempt floor on deposit amount.

**`release_payment()`**
Callable by the client (manual approval) or the oracle (autonomous approval). Transfers vault balance to freelancer and closes the escrow account, returning rent to client.

**`cancel_job()`**
Callable exclusively by the oracle. Refunds vault balance to client and closes the escrow account.

### Error Codes

| Code | Name | Condition |
|---|---|---|
| 6000 | `JobIdTooLong` | `job_id.len() > 32` |
| 6001 | `InvalidAmount` | `amount == 0` |
| 6002 | `AmountBelowRentExemption` | Below ~890,880 lamports |
| 6003 | `JobNotPending` | Job already resolved |
| 6004 | `UnauthorizedExecution` | Caller is not client or oracle |
| 6005 | `InvalidFreelancerTarget` | Passed freelancer ≠ stored freelancer |
| 6006 | `InvalidOracleAuthority` | Caller is not stored oracle |
| 6007 | `InvalidClientAuthority` | Passed client ≠ stored client |

---

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) + `solana-cli` 1.18
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) 0.30
- Node.js 18+ and Yarn

### Run Tests

```bash
# Install root dependencies
yarn install

# Run the full integration test suite against localnet
anchor test
```

### Oracle Setup

```bash
cd oracle
npm install
cp .env.example .env
# Fill in SOLANA_RPC_URL, PROGRAM_ID, ORACLE_PRIVATE_KEY,
# HELIUS_GRPC_ENDPOINT, GEMINI_API_KEY, ANTHROPIC_API_KEY
npm run dev
```

The oracle exposes two endpoints:

```
GET  /health          — liveness check + pending job count
GET  /jobs/:jobId     — fetch tracked job state
POST /submit          — trigger AI verification for a submitted deliverable
```

**POST /submit payload:**
```json
{
  "jobId": "your-job-id",
  "description": "Original job brief",
  "acceptanceCriteria": ["criterion 1", "criterion 2"],
  "deliverable": "https://link-to-work or text content",
  "deliverableType": "url | text | json | ipfs"
}
```

---

## Oracle Consensus Logic

| Gemini | Claude | Outcome |
|---|---|---|
| APPROVED (≥0.80) | APPROVED (≥0.80) | `release_payment` → freelancer |
| REJECTED (≥0.75) | REJECTED (≥0.75) | `cancel_job` → refund client |
| Divergent | — | Escalate to human arbitration |
| Sub-threshold | — | Escalate to human arbitration |

---

## Deployment

| Network | Program ID | Status |
|---|---|---|
| Devnet | `52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu` | ✅ Live |
| Mainnet-Beta | TBD | Pending |

---

## Roadmap

- [x] Production-grade escrow contract with dual PDA architecture
- [x] Full security audit — critical bump bug resolved, rent lock prevention, compute optimizations
- [x] Devnet deployment
- [x] Oracle middleware — Helius gRPC listener, Gemini + Claude consensus pipeline
- [ ] Integration test suite
- [ ] Next.js frontend — job creation dashboard, status tracker, submission interface
- [ ] TypeScript SDK — `@mappers-protocol/sdk`
- [ ] Mainnet-Beta launch

---

## License

MIT — see [LICENSE](./LICENSE)

---

*Built on Solana. Open infrastructure for the future of work.*
