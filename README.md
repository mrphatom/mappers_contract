# Mappers Protocol

> Autonomous, on-chain freelance settlement infrastructure — powered by cross-validated AI oracles on Solana.

Mappers is a decentralized escrow protocol that replaces platform intermediaries with programmable trust. Client funds are locked in on-chain vaults and released automatically when an AI oracle consensus loop confirms the freelancer's deliverable meets acceptance criteria. No approvals, no platform fees, no counterparty risk.

**Program ID (Devnet):** `52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu`

[

![CI](https://github.com/mrphatom/mappers_contract/actions/workflows/ci.yml/badge.svg)

![Anchor Program](https://github.com/mrphatom/mappers_contract/actions/workflows/anchor.yml/badge.svg)


![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)


![Solana](https://img.shields.io/badge/Solana-Devnet-9945FF?logo=solana)


---

## How It Works

```
Client (Dashboard)
      | initialize_job
      v
On-Chain Escrow Engine (Anchor / Rust)
  |-- GigEscrow PDA  — job metadata + state
  |-- Vault PDA      — locked SOL
      | Helius gRPC stream
      v
Oracle Middleware (Node.js)
      | parallel verification
      v
Gemini API ---- Manus AI ---- Claude API
                   | consensus
                   v
         release_payment / cancel_job
```

1. A client deposits SOL into a vault PDA and registers the freelancer, oracle, and acceptance criteria.
2. The oracle middleware detects the new job via Helius gRPC streaming.
3. When the freelancer submits a deliverable, two AI models (Gemini and Claude) independently evaluate it.
4. If both models agree the work meets criteria, funds are released to the freelancer on-chain. If both reject, funds are refunded. Disagreements escalate to human arbitration.

The entire settlement takes seconds for straightforward deliveries.

---

## Repository Structure

This is a **pnpm workspace monorepo** organized into three top-level concerns:

```
mappers_contract/
|
|-- programs/project_mappers/     Anchor smart contract (Rust)
|-- oracle/                       Off-chain AI verification service
|
|-- apps/
|   |-- api-server/               Express 5 REST API (Drizzle ORM + PostgreSQL)
|   |-- dashboard/                Vite + React 19 frontend (TanStack Query)
|
|-- lib/
|   |-- sdk/                      @mappers-protocol/sdk — OracleClient, types
|   |-- db/                       @workspace/db — Drizzle schema + migrations
|   |-- api-zod/                  @workspace/api-zod — shared Zod request/response schemas
|   |-- api-spec/                 @workspace/api-spec — OpenAPI spec generation
|   |-- api-client-react/         @workspace/api-client-react — typed React hooks
|
|-- tests/                        Anchor integration tests (ts-mocha)
|-- scripts/                      E2E devnet integration scripts
|-- docs/wiki/                    Version-controlled wiki pages
|-- mappers_whitepaper.md         Full protocol whitepaper
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Rust, Anchor Framework 0.30 |
| Solana Runtime | SBF, Solana CLI 1.18 |
| API Server | Express 5, Drizzle ORM, PostgreSQL, Pino |
| Frontend | Vite, React 19, TanStack Query, Tailwind CSS, shadcn/ui |
| SDK | TypeScript, Zod |
| Oracle Runtime | Node.js, Helius gRPC (Yellowstone Geyser) |
| AI Orchestration | Manus AI Pro |
| AI Verification | Google Gemini API, Anthropic Claude API |
| Package Manager | pnpm (workspaces) |
| License | MIT |

---

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) + `solana-cli` 1.18
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) 0.30
- Node.js 18+
- [pnpm](https://pnpm.io/) 9+

### Install Dependencies

```bash
pnpm install
```

### Build the Workspace

```bash
# Type-check and build all packages
pnpm run build
```

### Run Tests (Anchor)

```bash
# Full integration test suite against localnet
pnpm run test:anchor
# or
anchor test
```

### Start the API Server (Development)

```bash
cd apps/api-server
pnpm run dev
```

### Start the Dashboard (Development)

```bash
cd apps/dashboard
pnpm run dev
```

### Oracle Setup

```bash
cd oracle
npm install
cp .env.example .env
# Configure: SOLANA_RPC_URL, PROGRAM_ID, ORACLE_PRIVATE_KEY,
#            HELIUS_GRPC_ENDPOINT, GEMINI_API_KEY, ANTHROPIC_API_KEY
npm run dev
```

---

## Smart Contract

The escrow program manages job lifecycle through three instructions:

| Instruction | Caller | Effect |
|---|---|---|
| `initialize_job(job_id, amount)` | Client | Deposits SOL into a vault PDA. Enforces rent-exempt floor. |
| `release_payment()` | Client or Oracle | Pays the freelancer and closes the escrow. |
| `cancel_job()` | Oracle only | Refunds the client and closes the escrow. |

### Security

- **Dual PDA architecture** — separate state and vault accounts per job
- **Pinned bumps** — stored at initialization, saving ~50,000 CU per resolution
- **Reentrancy mitigation** — state cached to stack before any CPI
- **Rent reclamation** — 100% of rent returned to client on close
- **Rent-exempt floor guard** — deposits below ~890,880 lamports are rejected
- **Signer forgery prevention** — `has_one` constraints enforced at the account validation layer

### Error Codes

| Code | Name | Condition |
|---|---|---|
| 6000 | `JobIdTooLong` | `job_id.len() > 32` |
| 6001 | `InvalidAmount` | `amount == 0` |
| 6002 | `AmountBelowRentExemption` | Below ~890,880 lamports |
| 6003 | `JobNotPending` | Job already resolved |
| 6004 | `UnauthorizedExecution` | Caller is not client or oracle |
| 6005 | `InvalidFreelancerTarget` | Passed freelancer != stored freelancer |
| 6006 | `InvalidOracleAuthority` | Caller is not stored oracle |
| 6007 | `InvalidClientAuthority` | Passed client != stored client |

---

## Oracle Consensus

The AI verification pipeline uses two independent models to prevent single-point-of-failure manipulation:

| Gemini | Claude | Outcome |
|---|---|---|
| APPROVED (>= 0.80) | APPROVED (>= 0.80) | `release_payment` — freelancer paid |
| REJECTED (>= 0.75) | REJECTED (>= 0.75) | `cancel_job` — client refunded |
| Divergent | -- | Escalate to human arbitration |
| Sub-threshold | -- | Escalate to human arbitration |

---

## API Server

The REST API (`apps/api-server`) exposes job management endpoints:

```
GET    /api/jobs              List jobs (filterable by status, clientPubkey)
POST   /api/jobs              Register a new job
GET    /api/jobs/:jobId       Get job details
PATCH  /api/jobs/:jobId       Update job status/metadata
POST   /api/jobs/:jobId/submit   Submit deliverable (triggers oracle verification)
GET    /api/stats             Aggregate job statistics
GET    /api/oracle/health     Oracle liveness proxy
GET    /api/health            API server health check
```

---

## Dashboard

The frontend (`apps/dashboard`) is a React single-page application providing:

- **Job overview** — real-time list of all escrow jobs with status badges
- **Job details** — full metadata, transaction signatures, and state history
- **Statistics** — aggregate counts and total escrowed SOL
- **Oracle health** — live connectivity status of the AI verification service

---

## Documentation

Detailed protocol documentation lives in [`docs/wiki/`](./docs/wiki):

- [Overview](./docs/wiki/Home.md) — what Mappers is and the problems it solves
- [Architecture](./docs/wiki/Architecture.md) — the three protocol layers, PDA design, state machine, and security model
- [Getting Started](./docs/wiki/Getting-Started.md) — prerequisites, running the full stack, and API reference
- [Glossary](./docs/wiki/Glossary.md) — definitions of every protocol term, account, role, and error code

The [whitepaper](./mappers_whitepaper.md) covers the full protocol design, economic model, and security analysis.

---

## Deployment

| Network | Program ID | Status |
|---|---|---|
| Devnet | `52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu` | Live |
| Mainnet-Beta | TBD | Pending |

---

## Roadmap

- [x] Production-grade escrow contract with dual PDA architecture
- [x] Security audit — critical bump bug resolved, rent-lock prevention, compute optimizations
- [x] Devnet deployment
- [x] Oracle middleware — Helius gRPC listener, Gemini + Claude consensus pipeline
- [x] TypeScript SDK (`@mappers-protocol/sdk`)
- [x] REST API server (Express 5 + Drizzle ORM)
- [x] React dashboard (Vite + TanStack Query)
- [x] Shared workspace libraries (db, api-zod, api-spec, api-client-react)
- [ ] End-to-end integration test suite
- [ ] Mainnet-Beta launch

---

## Contributing

```bash
# Clone and install
git clone https://github.com/mrphatom/mappers_contract.git
cd mappers_contract
pnpm install

# Type-check everything
pnpm run build

# Run anchor tests
pnpm run test:anchor
```

This project uses pnpm workspaces. All shared types flow through the `lib/` packages. The API server and dashboard consume them as workspace dependencies (`workspace:*`).

---

## License

MIT — see [LICENSE](./LICENSE)

---

*Built on Solana. Open infrastructure for the future of work.*
