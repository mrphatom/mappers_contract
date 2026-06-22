# Mappers Protocol

> Autonomous, on-chain freelance settlement infrastructure — powered by cross-validated AI oracles on Solana.

Mappers is a decentralized escrow protocol that replaces platform intermediaries with programmable trust. Client funds are locked in on-chain vaults and released automatically when an AI oracle consensus loop confirms the freelancer's deliverable meets acceptance criteria. No approvals, no platform fees, no counterparty risk.

**Program ID (Devnet):** `52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu`

---

## Pages

- **[Overview](Home.md)** — what Mappers is and the problems it solves (this page).
- **[Architecture](Architecture.md)** — the three protocol layers, PDA design, state machine, and security model.
- **[Getting Started](Getting-Started.md)** — prerequisites, running the full stack, and API reference.
- **[Glossary](Glossary.md)** — definitions of every protocol term, account, role, and error code.

---

## Why Mappers Exists

The global freelance economy processes over $1.5 trillion in annual contract labor, yet the infrastructure that settles those agreements remains fundamentally broken:

- **Platform intermediaries extract disproportionate value.** Upwork, Fiverr, and Toptal charge 5-20% of gross contract value, primarily to provide a trust layer. A smart contract can hold funds with stronger guarantees and release them on programmable conditions.
- **Dispute resolution is slow, expensive, and arbitrary.** Human reviewers take days or weeks. Freelancers go unpaid while client funds sit in limbo.
- **Permissioned infrastructure creates fragility.** Reputation is non-portable. Payment history is siloed. Five years of delivery history on one platform means nothing on another.

The historical blocker to on-chain settlement is that verifying "work was done" is a real-world judgment call that blockchains cannot make natively. Mappers solves this with an AI oracle consensus layer.

---

## The Mappers Solution

Three components work together to eliminate the need for a trusted intermediary:

1. **On-Chain Escrow Engine** — A gas-optimized Anchor program that holds client funds in deterministic PDA vaults, enforces job lifecycle state transitions, and executes programmatic token releases.

2. **Oracle Middleware** — An off-chain Node.js microservice that monitors on-chain events via Helius gRPC streaming, ingests freelancer submission artifacts, and bridges them to the AI verification pipeline.

3. **Dual-Model AI Consensus Loop** — Two independent LLMs (Gemini and Claude) cross-validate deliverable quality in parallel. Funds move only when both reach structured consensus above confidence thresholds. Disagreements escalate to human arbitration.

Together these layers create settlement infrastructure that is faster, cheaper, and more consistent than any human arbitration system.

---

## Design Principles

- **No protocol fees (v1).** All deposited lamports flow directly to the intended recipient. Rent paid at initialization is returned in full on account close.
- **No protocol token.** All settlement is in native SOL, avoiding liquidity fragmentation and speculative dynamics.
- **Public, composable infrastructure.** The escrow engine, oracle middleware, and shared libraries are open-source. Any task marketplace, DAO payment system, or bounty protocol can integrate without rebuilding the trust layer.

---

## Current State

The protocol is implemented as a **pnpm workspace monorepo** with the following components:

| Component | Location | Status |
|---|---|---|
| Escrow smart contract | `programs/project_mappers/` | Live on Devnet |
| Oracle middleware | `oracle/` | Functional |
| REST API server | `apps/api-server/` | Functional |
| React dashboard | `apps/dashboard/` | Functional |
| TypeScript SDK | `lib/sdk/` | Functional |
| Database layer | `lib/db/` | Functional |
| Shared schemas | `lib/api-zod/`, `lib/api-spec/` | Functional |
| React query hooks | `lib/api-client-react/` | Functional |

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

See the [whitepaper](../../mappers_whitepaper.md) for the full milestone breakdown and economic model.

---

*Built on Solana. Open infrastructure for the future of work. Licensed under [MIT](../../LICENSE).*
