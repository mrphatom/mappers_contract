# Mappers Protocol

> On-chain freelance settlement infrastructure for Solana, combining programmable escrow with an off-chain dual-model verification oracle.

Mappers is an open-source decentralized escrow protocol for freelance and milestone-based work. Client funds are locked in deterministic Solana vault accounts and released or refunded through explicit on-chain state transitions. The Oracle middleware observes jobs, evaluates submitted artifacts through independent Gemini and Claude verdicts, and signs a settlement transaction only when the configured consensus policy is satisfied.

**Current release:** [v0.1.0](https://github.com/mrphatom/mappers_contract/releases/tag/v0.1.0)

**Program ID (Devnet):** `52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu`

## Start Here

| Page                                      | Purpose                                                               |
| ----------------------------------------- | --------------------------------------------------------------------- |
| [Architecture](Architecture.md)           | System layers, PDA design, state machine, and trust model             |
| [Getting Started](Getting-Started.md)     | Install the workspace, run services, and execute validation           |
| [Development Guide](Development-Guide.md) | Contributing, code generation, database, Anchor, and Oracle workflows |
| [Release Notes](Release-Notes.md)         | v0.1.0 baseline and future release history                            |
| [Glossary](Glossary.md)                   | Protocol accounts, roles, states, and error codes                     |

## The Mappers Solution

Three protocol components work together. The **Anchor escrow program** holds client funds in separate GigEscrow and Vault PDAs, validates job lifecycle transitions, and performs settlement. The **Oracle middleware** is a Node.js workspace package that listens to Helius Yellowstone gRPC events, tracks submissions, and bridges artifacts to verification models. The **API and dashboard** provide job management, persistence, operator visibility, and typed client access.

The Oracle’s autonomous settlement policy uses independent Gemini and Claude verdicts. Agreement above the configured confidence thresholds can authorize payment or refund; divergent or sub-threshold verdicts remain eligible for human arbitration. The protocol does not claim that model output is infallible, so the fallback path is part of the trust model rather than an afterthought.

## Current State

Mappers is implemented as a pnpm 11 workspace monorepo with one authoritative root lockfile. The following status reflects the v0.1.0 repository baseline:

| Component             | Location                        | Status                                    |
| --------------------- | ------------------------------- | ----------------------------------------- |
| Escrow smart contract | `programs/project_mappers/`     | Deployed on Devnet                        |
| Oracle middleware     | `oracle/`                       | Workspace package; typechecked and tested |
| REST API server       | `apps/api-server/`              | Functional                                |
| React dashboard       | `apps/dashboard/`               | Functional                                |
| TypeScript SDK        | `lib/sdk/`                      | Functional                                |
| Database layer        | `lib/db/`                       | Drizzle schema and migrations             |
| Shared API schemas    | `lib/api-zod/`, `lib/api-spec/` | Generated and type-safe                   |
| React query client    | `lib/api-client-react/`         | Generated hooks                           |
| CI/CD                 | `.github/workflows/`            | Required gates passing on `main`          |

## Design Principles

Mappers v0.1.0 is designed around three principles. Funds should move through explicit on-chain rules rather than platform-held balances. The escrow engine should be reusable by marketplaces, DAOs, and bounty systems. Model-assisted verification should be treated as an observable, replaceable oracle component with an explicit human-arbitration fallback.

The protocol does not currently issue a token, charge a protocol fee, or claim mainnet deployment. The only live program deployment documented here is Devnet.

## Roadmap

| Milestone                                                      | Status                       |
| -------------------------------------------------------------- | ---------------------------- |
| Dual-PDA Anchor escrow program                                 | Complete                     |
| Devnet deployment                                              | Complete                     |
| Oracle streaming and dual-model verification                   | Complete for v0.1.0 baseline |
| TypeScript SDK and shared API libraries                        | Complete for v0.1.0 baseline |
| Express API and React dashboard                                | Complete for v0.1.0 baseline |
| Root workspace CI, security, CodeQL, DCO, and Dependabot gates | Complete for v0.1.0 baseline |
| Production Oracle key management and operational runbooks      | Planned                      |
| Broader end-to-end Devnet demonstrations                       | Planned                      |
| Mainnet-Beta deployment and monitoring                         | Planned                      |

See the [whitepaper](../../mappers_whitepaper.md) for the broader protocol design, economic model, and security analysis.

_Built on Solana. Open infrastructure for programmable work settlement. Licensed under [MIT](../../LICENSE)._
