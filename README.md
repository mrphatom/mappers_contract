# Mappers Protocol

> On-chain freelance settlement infrastructure for Solana, combining programmable escrow with an off-chain dual-model verification oracle.

Mappers is an open-source decentralized escrow protocol for freelance and milestone-based work. Client funds are locked in deterministic Solana vault accounts and released or refunded through explicit on-chain state transitions. The Oracle middleware observes jobs, evaluates submitted artifacts through independent Gemini and Claude verdicts, and signs a settlement transaction only when the configured consensus policy is satisfied.

**Current release:** [v0.1.0](https://github.com/mrphatom/mappers_contract/releases/tag/v0.1.0)

**Program ID (Devnet):** `52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu`

[![CI](https://github.com/mrphatom/mappers_contract/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mrphatom/mappers_contract/actions/workflows/ci.yml)
[![Anchor Program](https://github.com/mrphatom/mappers_contract/actions/workflows/anchor.yml/badge.svg?branch=main)](https://github.com/mrphatom/mappers_contract/actions/workflows/anchor.yml)
[![Security Audit](https://github.com/mrphatom/mappers_contract/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/mrphatom/mappers_contract/actions/workflows/security.yml)
[![CodeQL](https://github.com/mrphatom/mappers_contract/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/mrphatom/mappers_contract/actions/workflows/codeql.yml)

## How It Works

```text
Client / Dashboard
        | API requests and signed transactions
        v
API Server (Express 5 + PostgreSQL)
        | job metadata and deliverable submission
        v
Oracle Middleware (Node.js)
        | Helius Yellowstone gRPC event stream
        | Gemini + Claude verification
        v
Anchor Escrow Program (Rust)
  |-- GigEscrow PDA: job state and metadata
  |-- Vault PDA: locked SOL
        |
        +--> release_payment or cancel_job
```

A client initializes a job and funds its vault. The Oracle listens for the on-chain job, receives the freelancer’s deliverable through the application flow, and requests independent structured verdicts from Gemini and Claude. Agreement above the configured thresholds allows the Oracle to submit the corresponding settlement instruction. A disagreement or sub-threshold result remains eligible for human arbitration rather than moving funds automatically.

## Repository Structure

Mappers is a **pnpm 11 workspace monorepo**. The Oracle is a first-class workspace package and shares the root `pnpm-lock.yaml`; npm and yarn installation are intentionally rejected.

```text
mappers_contract/
|
|-- programs/project_mappers/     Anchor smart contract (Rust)
|-- oracle/                       Off-chain verification service (workspace)
|
|-- apps/
|   |-- api-server/               Express 5 REST API
|   |-- dashboard/                Vite + React 19 frontend
|
|-- lib/
|   |-- sdk/                      @mappers-protocol/sdk
|   |-- db/                       Drizzle schema and migrations
|   |-- api-zod/                  Shared Zod validation schemas
|   |-- api-spec/                 OpenAPI specification and code generation
|   |-- api-client-react/         Generated TanStack Query hooks
|
|-- tests/                        Anchor integration tests
|-- scripts/                      Devnet and integration scripts
|-- docs/wiki/                    Version-controlled wiki source
|-- mappers_whitepaper.md         Protocol design and economic model
|-- CHANGELOG.md                  Human-readable release history
```

## Technology Stack

| Layer                   | Technology                                              |
| ----------------------- | ------------------------------------------------------- |
| Smart contract          | Rust, Anchor program crate 0.30.1                       |
| Solana tooling          | Solana 1.18-compatible toolchain; Anchor CLI in CI      |
| TypeScript client/tests | `@coral-xyz/anchor` 0.32.1, TypeScript, ts-mocha        |
| API server              | Express 5, Drizzle ORM, PostgreSQL, Pino                |
| Frontend                | Vite, React 19, TanStack Query, Tailwind CSS, shadcn/ui |
| Oracle runtime          | Node.js, Helius Yellowstone gRPC, Vitest                |
| Verification models     | Google Gemini API and Anthropic Claude API              |
| Package manager         | pnpm 11 workspaces                                      |
| Security tooling        | `cargo audit`, `pnpm audit`, CodeQL, Dependabot         |
| License                 | MIT                                                     |

## Getting Started

### Prerequisites

Install the following tools before starting local development:

- [Node.js](https://nodejs.org/) 22 or newer.
- [pnpm](https://pnpm.io/) 11 or newer.
- [Rust](https://rustup.rs/), [Solana CLI](https://docs.solanalabs.com/cli/install), and an Anchor CLI compatible with the program crate.
- [PostgreSQL](https://www.postgresql.org/) 14 or newer for the API server and database package.

### Install and Validate

Run these commands from the repository root:

```bash
pnpm install
pnpm run typecheck:libs
pnpm run typecheck
pnpm run build
pnpm run typecheck:oracle
pnpm run test:oracle
pnpm run test:anchor
```

`pnpm install` is the only supported root installation command. The repository contains one authoritative workspace lockfile. Do not create or restore `oracle/package-lock.json`.

### Run the API Server

The API server expects a PostgreSQL connection string and a valid Oracle URL.

```bash
export DATABASE_URL="postgresql://localhost:5432/mappers_dev"
export ORACLE_URL="http://localhost:3001"
cd apps/api-server
pnpm run dev
```

To push the current Drizzle schema to a development database:

```bash
cd lib/db
pnpm run push
```

### Run the Dashboard

```bash
cd apps/dashboard
pnpm run dev
```

The Vite development server uses port 5173 by default. Configure the API base URL using the dashboard’s environment configuration when the API is not running on its default local address.

### Run the Oracle

The Oracle is installed and run through the root pnpm workspace:

```bash
cp oracle/.env.example oracle/.env
cd oracle
pnpm run dev
```

The service requires environment-specific credentials and endpoints. Typical values include `SOLANA_RPC_URL`, `PROGRAM_ID`, `ORACLE_PRIVATE_KEY`, `HELIUS_GRPC_ENDPOINT`, `GEMINI_API_KEY`, and `ANTHROPIC_API_KEY`. Keep private keys and API credentials outside version control.

### Run the Anchor Program

```bash
anchor build
pnpm run test:anchor
```

The default Anchor test script uses `tsconfig.anchor.json` and the repository’s pinned TypeScript test tooling. CI also installs the compatibility Rust toolchain required by the Anchor IDL build.

## Smart Contract

The `programs/project_mappers` program manages a job through three instructions:

| Instruction                                | Caller           | Effect                                                                  |
| ------------------------------------------ | ---------------- | ----------------------------------------------------------------------- |
| `initialize_job(job_id, amount, duration)` | Client           | Creates the escrow and vault PDAs, validates the job, and deposits SOL. |
| `release_payment()`                        | Client or Oracle | Pays the stored freelancer and closes the escrow.                       |
| `cancel_job()`                             | Oracle           | Refunds the stored client and closes the escrow.                        |

The program uses separate state and vault PDAs, stores canonical bumps, enforces a 32-byte job-ID seed boundary, protects terminal states from double spending, and returns account rent to the client when an escrow closes. The Devnet deployment is recorded in `Anchor.toml` and the deployment table below.

## Oracle Consensus

The Oracle exposes a Node.js service for job tracking, artifact submission, and verification. It listens to the configured Helius Yellowstone gRPC endpoint and uses the program IDL to interpret escrow activity. The verification implementation remains a dual-model policy: Gemini and Claude produce independent structured verdicts, and divergent or sub-threshold outcomes are not automatically settled.

The protected consensus implementation is `oracle/src/verification.ts`. Model credentials are supplied only through environment variables; no credentials belong in the repository.

## API and Dashboard

The API server in `apps/api-server/` provides job registration, status, submission, statistics, health, and Oracle-proxy routes. Request and response validation is generated from the OpenAPI specification in `lib/api-spec/`, with shared Zod schemas and typed React Query hooks consumed by the dashboard.

The dashboard in `apps/dashboard/` provides job overviews, job details, settlement metadata, aggregate statistics, and Oracle health visibility. It is a Vite-built React 19 application styled with Tailwind CSS and shadcn/ui.

## CI/CD and Dependency Automation

The repository has five required validation workflows: [CI](.github/workflows/ci.yml), [Anchor Program](.github/workflows/anchor.yml), [Security Audit](.github/workflows/security.yml), [CodeQL](.github/workflows/codeql.yml), and [Semantic PR Title](.github/workflows/semantic-pr.yml). The repository also runs DCO validation, wiki synchronization, and Dependabot updates.

Dependabot updates the single root npm/pnpm workspace, the Cargo program, and GitHub Actions. The root workspace includes Oracle so its manifest and dependencies are updated through the same supported pnpm workspace model. A small set of dependencies with opaque upstream updater failures is explicitly ignored in `.github/dependabot.yml` and must be reviewed manually when newer versions are needed.

The release candidate for v0.1.0 was validated on main with clean local typecheck/build/Oracle tests and passing remote CI, Anchor, Security Audit, CodeQL, and Semantic PR Title workflows. See [`CHANGELOG.md`](CHANGELOG.md) for the release scope.

## Documentation

The version-controlled wiki source is in [`docs/wiki/`](docs/wiki/), and the [GitHub Wiki](https://github.com/mrphatom/mappers_contract/wiki) is synchronized from those pages on pushes to `main`. Key pages include:

- [Overview](docs/wiki/Home.md)
- [Architecture](docs/wiki/Architecture.md)
- [Getting Started](docs/wiki/Getting-Started.md)
- [Development Guide](docs/wiki/Development-Guide.md)
- [API Reference](docs/wiki/API-Reference.md)
- [SDK Reference](docs/wiki/SDK-Reference.md)
- [Release Notes](docs/wiki/Release-Notes.md)

The [whitepaper](mappers_whitepaper.md) describes the broader protocol design, economic model, and security analysis.

## Deployment

| Network      | Program ID                                     | Status       |
| ------------ | ---------------------------------------------- | ------------ |
| Devnet       | `52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu` | Live         |
| Mainnet-Beta | TBD                                            | Not deployed |

## Roadmap

- [x] Anchor escrow program with dual PDA architecture.
- [x] Devnet deployment.
- [x] Oracle middleware with Helius streaming and dual-model verification.
- [x] TypeScript SDK.
- [x] Express 5 REST API and Drizzle database layer.
- [x] React dashboard and generated API client libraries.
- [x] Root pnpm workspace validation and protected CI/CD gates.
- [ ] Production Oracle key management and operational runbooks.
- [ ] Broader end-to-end devnet demonstration coverage.
- [ ] Mainnet-Beta deployment and production monitoring.

## Contributing

Create a short-lived branch from `main`, use pnpm for all JavaScript/TypeScript dependencies, and keep commits focused. Before opening a pull request, run:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck:libs
pnpm run build
pnpm run typecheck:oracle
pnpm run test:oracle
pnpm run test:anchor
pnpm exec prettier --check .
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and the [Development Guide](docs/wiki/Development-Guide.md) for repository conventions and review expectations.

## License

Mappers Protocol is released under the [MIT License](LICENSE).

## References

- [Solana documentation](https://solana.com/docs)
- [Anchor documentation](https://www.anchor-lang.com/docs)
- [pnpm workspace documentation](https://pnpm.io/workspaces)
- [GitHub Actions documentation](https://docs.github.com/actions)

_Built on Solana. Open infrastructure for programmable work settlement._
