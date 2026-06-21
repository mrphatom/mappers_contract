# Getting Started

This page covers prerequisites, running the test suite, configuring the oracle middleware, and the oracle HTTP API. It is derived from the root [`README.md`](../../README.md) and the [whitepaper](../../mappers_whitepaper.md).

---

## Prerequisites

- [Rust](https://rustup.rs/) + `solana-cli` 1.18
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) 0.30
- Node.js 18+ and Yarn

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
├── docs/
│   └── wiki/                   # Tracked, wiki-exportable Markdown documentation
├── Anchor.toml
├── Cargo.toml
├── package.json                # Root — test runner dependencies (ts-mocha, chai)
├── tsconfig.json               # Root — TypeScript config for test suite
└── idl.json                    # Compiled program IDL (8 instructions, 8 error codes)
```

---

## Install & Build

Using the provided `Makefile`:

```bash
# Install root + oracle dependencies
make setup

# Build the Anchor program
make build
```

Or manually:

```bash
yarn install
anchor build
```

---

## Run Tests

```bash
# Install root dependencies
yarn install

# Run the full integration test suite against localnet
anchor test
```

Equivalent `Makefile` targets:

```bash
make test          # anchor test --provider.cluster localnet
make test-devnet   # anchor test --provider.cluster devnet
```

---

## Oracle Setup

```bash
cd oracle
npm install
cp .env.example .env
# Fill in SOLANA_RPC_URL, PROGRAM_ID, ORACLE_PRIVATE_KEY,
# HELIUS_GRPC_ENDPOINT, GEMINI_API_KEY, ANTHROPIC_API_KEY
npm run dev
```

Or via the `Makefile`: `make oracle-dev`.

> **Never commit secrets.** `.env`, keypair files (`*-keypair.json`, `wallet.json`), and similar are git-ignored. Only `.env.example` should be tracked.

---

## Oracle HTTP API

The oracle exposes three endpoints:

```
GET  /health          — liveness check + pending job count
GET  /jobs/:jobId     — fetch tracked job state
POST /submit          — trigger AI verification for a submitted deliverable
```

### `POST /submit` payload

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

## End-to-End Demo (Devnet)

Run the oracle in one terminal, then execute the integration script:

```bash
make oracle-dev          # terminal 1
make e2e                 # terminal 2 — ts-node scripts/e2e-devnet.ts
```

This exercises the full flow: job creation → AI verification → on-chain settlement.

---

## Deployment

| Network | Program ID | Status |
|---|---|---|
| Devnet | `52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu` | Live |
| Mainnet-Beta | TBD | Pending |

---

## Program Interface Quick Reference

**Instructions**

- `initialize_job(job_id: String, amount: u64)` — Client deposits SOL into a vault PDA and registers freelancer + oracle addresses. Enforces the rent-exempt floor on the deposit amount.
- `release_payment()` — Callable by the client (manual approval) or the oracle (autonomous approval). Transfers the vault balance to the freelancer and closes the escrow account, returning rent to the client.
- `cancel_job()` — Callable exclusively by the oracle. Refunds the vault balance to the client and closes the escrow account.

**Error Codes** — see the [Glossary](Glossary.md#error-codes) for the full table.

---

## SDK Vision (Planned)

The escrow engine and oracle middleware are being open-sourced as a composable SDK:

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

See [SDK & Public Infrastructure Vision](../../mappers_whitepaper.md#8-sdk--public-infrastructure-vision) in the whitepaper for details.
