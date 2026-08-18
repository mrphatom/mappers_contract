# Getting Started

This guide covers local development for the Mappers Protocol stack: prerequisites, workspace installation, service startup, database setup, and validation.

## Prerequisites

| Tool                                                        | Supported baseline                                    | Purpose                         |
| ----------------------------------------------------------- | ----------------------------------------------------- | ------------------------------- |
| [Rust](https://rustup.rs/)                                  | Stable plus the Anchor-compatible toolchain           | Smart contract compilation      |
| [Solana CLI](https://docs.solanalabs.com/cli/install)       | 1.18-compatible                                       | Cluster management and keypairs |
| [Anchor CLI](https://www.anchor-lang.com/docs/installation) | Compatible with the repository’s Anchor configuration | Program build and tests         |
| [Node.js](https://nodejs.org/)                              | 22 or newer                                           | Workspace tools and services    |
| [pnpm](https://pnpm.io/)                                    | 11 or newer                                           | Root workspace package manager  |
| [PostgreSQL](https://www.postgresql.org/)                   | 14 or newer                                           | API server database             |

## Quick Start

```bash
git clone https://github.com/mrphatom/mappers_contract.git
cd mappers_contract
pnpm install
pnpm run typecheck:libs
pnpm run build
pnpm run typecheck:oracle
pnpm run test:oracle
```

The repository uses one root `pnpm-lock.yaml`. The Oracle is a workspace package, and `pnpm install` is the supported installation command for the complete repository. The root preinstall guard rejects npm and yarn installs.

## Repository Structure

```text
mappers_contract/
|-- programs/project_mappers/     Anchor smart contract (Rust)
|-- oracle/                       Off-chain verification service (workspace)
|-- apps/api-server/              Express 5 REST API
|-- apps/dashboard/               React 19 frontend
|-- lib/                          SDK, database, schemas, and generated clients
|-- tests/                        Anchor integration tests
|-- scripts/                      Devnet and integration scripts
|-- docs/wiki/                    Version-controlled wiki source
```

## Running Smart Contract Tests

```bash
pnpm run test:anchor
# Equivalent direct command:
anchor test
```

The test suite runs against localnet by default and covers job initialization, settlement, cancellation, validation errors, PDA derivation, and terminal-state protections. A Devnet run can be selected with `anchor test --provider.cluster devnet` when the required wallet and environment are available.

## Running the API Server

Create a PostgreSQL database and configure the connection string before starting the API:

```bash
createdb mappers_dev
export DATABASE_URL="postgresql://localhost:5432/mappers_dev"
export ORACLE_URL="http://localhost:3001"
```

Push the current Drizzle schema from the root workspace:

```bash
cd lib/db
pnpm run push
cd ../../apps/api-server
pnpm run dev
```

The API listens on port 3000 by default. `ORACLE_URL` must be an explicitly configured HTTP(S) URL accepted by the API’s job-processing path.

## Running the Dashboard

```bash
cd apps/dashboard
pnpm run dev
```

The Vite development server uses port 5173 by default. The dashboard expects the API server at its configured local URL.

## Running the Oracle

The Oracle is now a first-class member of the root pnpm workspace:

```bash
cp oracle/.env.example oracle/.env
cd oracle
pnpm run dev
```

The Oracle service requires the following environment values:

| Variable               | Description                                              |
| ---------------------- | -------------------------------------------------------- |
| `SOLANA_RPC_URL`       | Solana RPC endpoint                                      |
| `PROGRAM_ID`           | Mappers program address                                  |
| `ORACLE_PRIVATE_KEY`   | Base58-encoded Oracle authority keypair; never commit it |
| `HELIUS_GRPC_ENDPOINT` | Yellowstone gRPC streaming endpoint                      |
| `GEMINI_API_KEY`       | Google Gemini credentials                                |
| `ANTHROPIC_API_KEY`    | Anthropic Claude credentials                             |

The Oracle exposes health, job-tracking, and submission endpoints on its configured port, commonly 3001. Use `pnpm run typecheck:oracle` and `pnpm run test:oracle` from the repository root for its strict checks and test suite.

## Workspace Commands

Run these from the repository root:

| Command                          | Description                                    |
| -------------------------------- | ---------------------------------------------- |
| `pnpm install`                   | Install all workspace dependencies             |
| `pnpm install --frozen-lockfile` | Reproduce CI installation exactly              |
| `pnpm run typecheck:libs`        | Typecheck shared libraries                     |
| `pnpm run typecheck`             | Typecheck libraries, apps, scripts, and Oracle |
| `pnpm run build`                 | Typecheck and build all packages               |
| `pnpm run typecheck:oracle`      | Strictly typecheck Oracle                      |
| `pnpm run test:oracle`           | Run the Oracle Vitest suite                    |
| `pnpm run test:anchor`           | Run Anchor integration tests                   |
| `pnpm exec prettier --check .`   | Check repository formatting                    |

## Code Generation

The OpenAPI contract lives in `lib/api-spec/`. After changing it, regenerate the shared Zod schemas and React Query hooks:

```bash
cd lib/api-spec
pnpm run codegen
```

Generated files in `lib/api-zod/` and `lib/api-client-react/` should not be edited manually.

## End-to-End Devnet Flow

Start the Oracle in one terminal, then run the integration script from another:

```bash
# Terminal 1
cd oracle && pnpm run dev

# Terminal 2
pnpm exec ts-node scripts/e2e-devnet.ts
```

The flow requires a funded Devnet wallet, valid RPC and gRPC endpoints, Oracle credentials, and the deployed program ID.

## Deployment

| Network      | Program ID                                     | Status       |
| ------------ | ---------------------------------------------- | ------------ |
| Devnet       | `52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu` | Live         |
| Mainnet-Beta | TBD                                            | Not deployed |

## Troubleshooting

If installation fails, confirm that pnpm 11 is active and remove stale `node_modules` directories before retrying. Do not restore `oracle/package-lock.json`; the root pnpm lockfile is authoritative. If library typechecking fails, run `pnpm run typecheck:libs` first because the application packages consume those project references. If the Oracle does not detect jobs, verify the gRPC endpoint, program ID, RPC endpoint, and Oracle key. If the API cannot reach the Oracle, validate that `ORACLE_URL` is a complete HTTP(S) URL.

See [Architecture](Architecture.md), [Development Guide](Development-Guide.md), and [Release Notes](Release-Notes.md) for the next level of detail.
