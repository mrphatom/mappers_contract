# Mappers Contract

**Mappers Protocol** — Autonomous, On-Chain Freelance Settlement Infrastructure powered by cross-validated AI oracles on Solana.

A decentralized freelance escrow protocol built on Solana using the Anchor framework. Replaces human arbitration with a dual-model AI consensus loop (Gemini + Claude) that autonomously releases or refunds escrowed SOL based on deliverable quality.

**Program ID (Devnet):** `52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu`

## Repository Structure

```
mappers_contract/
├── programs/project_mappers/src/lib.rs   # Anchor/Rust escrow smart contract
├── tests/project_mappers.ts              # Anchor integration test suite
├── oracle/                               # Standalone AI oracle middleware (Node.js)
│   ├── src/index.ts                      # Express HTTP server entry point
│   ├── src/listener.ts                   # Helius gRPC subscription & job tracking
│   ├── src/verification.ts               # Gemini + Claude consensus engine
│   ├── src/chain.ts                      # On-chain transaction builder/signer
│   ├── src/store.ts                      # In-memory pending job registry
│   ├── src/config.ts                     # Env var loader
│   └── src/types.ts                      # Shared TypeScript interfaces
├── docs/wiki/                            # Protocol documentation
├── idl.json                              # Compiled Anchor IDL
├── Anchor.toml                           # Anchor project config
├── Cargo.toml / Cargo.lock               # Rust workspace
├── tsconfig.anchor.json                  # tsconfig for Anchor test suite
└── artifacts/api-server/                 # (pnpm) Express API scaffold
```

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm run test:anchor` — run Anchor integration tests (requires Anchor CLI + localnet)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

### Oracle Setup

```bash
cd oracle
npm install
cp .env.example .env
# Fill in SOLANA_RPC_URL, PROGRAM_ID, ORACLE_PRIVATE_KEY,
# HELIUS_GRPC_ENDPOINT, HELIUS_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY
npm run dev
```

Oracle endpoints:
- `GET  /health`       — liveness + pending job count
- `GET  /jobs/:jobId`  — fetch tracked job state
- `POST /submit`       — trigger AI verification for a submitted deliverable

## Stack

- **Smart Contract:** Rust, Anchor Framework 0.30, Solana SBF
- **Oracle:** Node.js, TypeScript, Express 4, Helius gRPC (Yellowstone)
- **AI:** Google Gemini API + Anthropic Claude API (dual-model consensus)
- **Frontend (planned):** Next.js 14, Solana Wallet Adapter, Tailwind CSS
- **API scaffold:** Express 5, PostgreSQL + Drizzle ORM, Zod, pnpm workspaces

## Architecture

Three coupled layers:

1. **On-Chain Escrow Engine** — Anchor/Rust program with dual PDA vaults (GigEscrow + Vault). State machine: `Pending → Released | Cancelled`.
2. **Oracle Middleware** — Subscribes to program events via Helius gRPC, routes deliverable submissions to the AI pipeline.
3. **Dual-Model AI Consensus** — Gemini and Claude verify in parallel (no knowledge sharing). Both must agree above threshold: ≥0.80 → release, ≥0.75 reject → refund, divergent → human arbitration.

## Oracle Required Environment Variables

| Var | Description |
|-----|-------------|
| `SOLANA_RPC_URL` | Helius RPC URL with API key |
| `PROGRAM_ID` | Deployed escrow program ID |
| `ORACLE_PRIVATE_KEY` | Base58 oracle keypair |
| `HELIUS_GRPC_ENDPOINT` | Yellowstone gRPC endpoint |
| `HELIUS_API_KEY` | Helius API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `PORT` | Oracle HTTP port (default 3001) |

## Architecture Decisions

- **Dual bump storage** — Both `escrow_bump` and `vault_bump` stored on-chain at init to prevent CPI signing failures on payout.
- **Reentrancy mitigation** — All escrow fields cached as stack variables before any CPI executes.
- **Rent reclamation** — Both `release_payment` and `cancel_job` use `close = client`; zero lamports permanently locked post-resolution.
- **Consensus threshold** — Approval ≥0.80, rejection ≥0.75; divergent verdicts always escalate to human arbitration.
- **Oracle is stateless per restart** — In-memory store; not persisted across restarts. Job events re-emitted by Helius subscription on reconnect.

## Where Things Live

- Smart contract source: `programs/project_mappers/src/lib.rs`
- Compiled IDL: `idl.json` (root) and `oracle/idl.json`
- Oracle source: `oracle/src/`
- Protocol docs: `docs/wiki/`
- Whitepaper: `mappers_whitepaper.md`

## User Preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The oracle's `package-lock.json` uses npm — install with `npm install` inside `oracle/`, not pnpm.
- `anchor test` uses `tsconfig.anchor.json` at workspace root (separate from pnpm workspace tsconfig).
- Anchor.toml `test` script references `yarn` — use `pnpm run test:anchor` from workspace root instead.
- Oracle `.env` must be created from `.env.example`; secrets are never committed.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Full protocol docs: `docs/wiki/Architecture.md`, `docs/wiki/Getting-Started.md`
- Whitepaper: `mappers_whitepaper.md`
