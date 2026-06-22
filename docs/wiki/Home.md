# Mappers Protocol — Wiki

> Autonomous, On-Chain Freelance Settlement Infrastructure — Powered by Cross-Validated AI Oracles on Solana.

Mappers is a decentralized freelance escrow protocol built natively on Solana using the Anchor framework. It eliminates counterparty risk and platform intermediaries by replacing slow, costly human arbitration with an automated **dual-model AI consensus** verification loop. When a freelancer delivers work, an AI oracle evaluates the output and triggers a cryptographic, programmatic payment release — no approvals, no platform fees, no counterparty risk.

**Program ID (Devnet):** `52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu`

---

## Pages

- **[Overview](Home.md)** — what Mappers is and the problems it solves (this page).
- **[Architecture](Architecture.md)** — the three protocol layers, PDA design, state machine, and security model.
- **[Getting Started](Getting-Started.md)** — prerequisites, running tests, oracle setup, and API reference.
- **[Glossary](Glossary.md)** — definitions of every protocol term, account, and error code.

> This wiki is tracked Markdown derived from the repository's [`README.md`](../../README.md) and [`mappers_whitepaper.md`](../../mappers_whitepaper.md). See [`README.md`](README.md) in this directory for how to export these pages to a GitHub Wiki.

---

## Why Mappers Exists

The global freelance economy processes over $1.5 trillion in annual contract labor, yet the infrastructure that settles those agreements remains broken:

- **Platform intermediaries extract disproportionate value.** Upwork, Fiverr, and Toptal charge 5%–20% of gross contract value, primarily to provide a trust layer. A smart contract can hold funds with stronger guarantees and release them on programmable conditions.
- **Dispute resolution is slow, expensive, and arbitrary.** Human reviewers can take days or weeks; freelancers go unpaid and client funds sit in limbo.
- **Permissioned infrastructure creates fragility.** Reputation is non-portable and payment history is siloed inside proprietary databases.

The historical blocker to on-chain settlement is that verifying *"work was done"* is a real-world judgment call blockchains cannot make natively. Mappers solves this with an AI oracle consensus layer.

---

## The Mappers Solution

Mappers introduces three components that together eliminate the need for a trusted intermediary:

1. **On-Chain Escrow Engine** — A gas-optimized Anchor program that holds client funds in a deterministic Program Derived Address (PDA) vault, enforces job lifecycle state transitions, and executes programmatic token releases.
2. **Oracle Middleware** — An off-chain Node.js microservice that monitors on-chain events via high-speed Helius gRPC streaming, ingests freelancer submission artifacts, and bridges them to the AI verification pipeline.
3. **Dual-Model AI Consensus Loop** — A multi-model verification system that cross-validates deliverable quality through two independent LLM passes (Gemini + Claude), releasing funds only when both models reach structured consensus above confidence thresholds.

Together these layers create a trust infrastructure that is faster, cheaper, and more consistent than any human arbitration system.

---

## Design Principles

- **No protocol fees (v1).** All lamports deposited into an escrow flow directly to the intended recipient — freelancer on completion, client on cancellation. Rent paid at initialization is returned in full on account close.
- **No protocol token.** All settlement is in native SOL, avoiding liquidity fragmentation and speculative dynamics.
- **Public, composable infrastructure.** The escrow engine and oracle middleware are being open-sourced as a reusable SDK (`@mappers-protocol/sdk`) so any task marketplace, DAO payment system, or bounty protocol can integrate without rebuilding the trust layer.

---

## Roadmap (High Level)

- [x] Production-grade escrow contract with dual PDA architecture
- [x] Full security audit — critical bump bug resolved, rent-lock prevention, compute optimizations
- [x] Devnet deployment
- [x] Oracle middleware — Helius gRPC listener, Gemini + Claude consensus pipeline
- [x] Integration test suite
- [x] Next.js frontend — job creation dashboard, status tracker, submission interface
- [x] TypeScript SDK — `@mappers-protocol/sdk`
- [ ] Mainnet-Beta launch

See the [whitepaper](../../mappers_whitepaper.md) for the full milestone breakdown.

---

*Built on Solana. Open infrastructure for the future of work. Licensed under [MIT](../../LICENSE).*
