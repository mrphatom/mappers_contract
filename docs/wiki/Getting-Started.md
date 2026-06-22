# Getting Started

This page covers everything you need to run the Mappers Protocol stack locally: prerequisites, workspace setup, starting each service, and running tests.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| [Rust](https://rustup.rs/) | stable | Smart contract compilation |
| [Solana CLI](https://docs.solanalabs.com/cli/install) | 1.18+ | Cluster management, keypair generation |
| [Anchor CLI](https://www.anchor-lang.com/docs/installation) | 0.30 | Program build and test framework |
| [Node.js](https://nodejs.org/) | 18+ | Oracle, API server, dashboard |
| [pnpm](https://pnpm.io/) | 9+ | Workspace package manager |
| [PostgreSQL](https://www.postgresql.org/) | 14+ | API server database |

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/mrphatom/mappers_contract.git
cd mappers_contract

# Install all workspace dependencies
pnpm install

# Type-check and build all packages
pnpm run build
```

---

## Repository Structure

```
mappers_contract/
|-- programs/project_mappers/     Anchor smart contract (Rust)
|-- oracle/                       Off-chain AI oracle service
|-- apps/
|   |-- api-server/               Express 5 REST API
|   |-- dashboard/                React frontend
|-- lib/
|   |-- sdk/                      @mappers-protocol/sdk
|   |-- db/                       Drizzle schema + migrations
|   |-- api-zod/                  Shared Zod validation schemas
|   |-- api-spec/                 OpenAPI spec + code generation
|   |-- api-client-react/         Generated TanStack Query hooks
|-- tests/                        Anchor integration tests
|-- scripts/                      E2E devnet scripts
|-- docs/wiki/                    This documentation
```

---

## Running the Smart Contract Tests

```bash
# Run Anchor test suite against localnet
pnpm run test:anchor

# Or use Anchor directly
anchor test

# Run against devnet
anchor test --provider.cluster devnet
```

The test suite exercises the full job lifecycle: initialization, payment release, and cancellation, including error cases.

---

## Running the API Server

The API server requires a PostgreSQL database.

### 1. Set up PostgreSQL

Create a database and set the connection string:

```bash
createdb mappers_dev
export DATABASE_URL="postgresql://localhost:5432/mappers_dev"
```

### 2. Push the database schema

```bash
cd lib/db
pnpm run push
```

This uses Drizzle Kit to push the schema to your database (creates the `jobs` table with the correct columns and enums).

### 3. Start the server

```bash
cd apps/api-server
pnpm run dev
```

The server starts on port 3000 (configurable via `PORT` env var). You should see structured JSON logs from Pino indicating the server is listening.

---

## Running the Dashboard

```bash
cd apps/dashboard
pnpm run dev
```

The dashboard starts on `http://localhost:5173` by default. It expects the API server to be running at `http://localhost:3000` (or wherever you configure it).

### Build for production

```bash
cd apps/dashboard
pnpm run build
pnpm run serve   # Preview the production build
```

---

## Running the Oracle

The oracle is a standalone Node.js service in the `oracle/` directory (not part of the pnpm workspace).

```bash
cd oracle
npm install
cp .env.example .env
```

Fill in the required environment variables:

| Variable | Description |
|---|---|
| `SOLANA_RPC_URL` | Solana RPC endpoint (Helius recommended) |
| `PROGRAM_ID` | Mappers program ID (`52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu`) |
| `ORACLE_PRIVATE_KEY` | Base58-encoded oracle keypair |
| `HELIUS_GRPC_ENDPOINT` | Helius gRPC streaming URL |
| `GEMINI_API_KEY` | Google Gemini API key |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |

Then start:

```bash
npm run dev
```

The oracle exposes an HTTP API on port 3001 (configurable).

---

## Environment Variables Summary

### API Server (`apps/api-server/`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server listen port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `ORACLE_URL` | `http://localhost:3001` | Oracle middleware URL |
| `NODE_ENV` | `development` | Environment mode |

### Dashboard (`apps/dashboard/`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5173` | Vite dev server port |
| `BASE_PATH` | `/` | Base path for deployment |

### Oracle (`oracle/`)

| Variable | Description |
|---|---|
| `SOLANA_RPC_URL` | Solana RPC endpoint |
| `PROGRAM_ID` | On-chain program address |
| `ORACLE_PRIVATE_KEY` | Oracle authority keypair |
| `HELIUS_GRPC_ENDPOINT` | gRPC streaming endpoint |
| `GEMINI_API_KEY` | Gemini API credentials |
| `ANTHROPIC_API_KEY` | Claude API credentials |

---

## Workspace Commands

Run these from the repository root:

| Command | Description |
|---|---|
| `pnpm install` | Install all workspace dependencies |
| `pnpm run build` | Type-check libs, then build all packages |
| `pnpm run typecheck` | Type-check all packages without building |
| `pnpm run typecheck:libs` | Type-check only lib/ packages (fast) |
| `pnpm run test:anchor` | Run Anchor integration tests |

---

## Code Generation

The API contract is defined in `lib/api-spec/` as an OpenAPI specification. From it, [orval](https://orval.dev/) generates:

- **`lib/api-zod/`** — Zod validation schemas used by the API server
- **`lib/api-client-react/`** — TanStack Query hooks used by the dashboard

To regenerate after changing the spec:

```bash
cd lib/api-spec
pnpm run codegen
```

This regenerates both downstream packages and runs a type-check to verify everything is consistent.

---

## End-to-End Demo (Devnet)

Run the oracle in one terminal, then execute the integration script:

```bash
# Terminal 1 — start the oracle
cd oracle && npm run dev

# Terminal 2 — run the E2E script
npx ts-node scripts/e2e-devnet.ts
```

This exercises the full flow: job creation on-chain, oracle detection, AI verification, and on-chain settlement.

---

## Deployment

| Network | Program ID | Status |
|---|---|---|
| Devnet | `52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu` | Live |
| Mainnet-Beta | TBD | Pending |

---

## Troubleshooting

**pnpm install fails** — Make sure you're using pnpm (not npm or yarn). The workspace enforces this via a `preinstall` script.

**Type-check errors in lib packages** — Run `pnpm run typecheck:libs` first. The lib packages use TypeScript composite project references and must be built in dependency order.

**Database connection refused** — Ensure PostgreSQL is running and `DATABASE_URL` is set correctly.

**Oracle not detecting jobs** — Verify `HELIUS_GRPC_ENDPOINT` is valid and the `PROGRAM_ID` matches your deployment.

---

See the [API Reference](API-Reference.md) for endpoint details, [SDK Reference](SDK-Reference.md) for programmatic usage, or the [Architecture](Architecture.md) page for how the pieces fit together.
