# Mappers 🚀

> Autonomous, On-Chain Freelance Settlement Infrastructure Powered by Cross-Validated AI Oracles.

Mappers is a decentralized freelance escrow protocol built natively on Solana using the Anchor framework. It eliminates client counterparty risk and third-party platform friction by substituting slow, costly human intermediaries with an automated, multi-model AI consensus verification loop.

---

## 🏗️ Architecture Overview

Mappers bridges the gap between on-chain cryptographic execution and real-world task verification through a lightweight, gas-optimized three-layer loop:

1. **On-Chain Escrow Engine (Anchor/Rust):** Tracks individual job lifecycle metadata and holds milestone funds inside secure, deterministic Program Derived Address (PDA) system-owned vaults.
2. **Autonomous Oracle Middleware:** A high-speed off-chain microservice that processes live program events via a Solana gRPC stream (Helius/QuickNode) to ingest submission artifacts.
3. **Dual-Model AI Consensus Loop:** Utilizing Manus AI as an orchestrator, the submission deliverables are simultaneously cross-validated via independent passes through the **Gemini API** and **Anthropic Claude API**. Payment is programmatically released if and only if both models reach a structured JSON consensus.

---

## 🔒 Smart Contract Security Features

The core Anchor program incorporates advanced security patches to guarantee fund integrity:
* **Reentrancy Mitigation:** To prevent cross-program instruction exploits, all internal contract state evaluations are cached into fast stack memory before mutable borrows or native system transfers are executed.
* **Rent Reclamation Lifecycle:** Utilizes Anchor's inline `close = client` macro attribute. The exact moment an escrow contract achieves resolution (`release_payment` or `cancel_job`), the account data is completely de-allocated and 100% of the rent-exempt lamports are automatically flushed back to the client's wallet.
* **Rent-Exemption Guards:** Enforces standard runtime protection thresholds (`require!(amount >= Rent::get()?.minimum_balance(0))`) to guarantee the data-less system vault is never pruned by the network validator runtime layer.
* **Rigid Serialization Controls:** Explicitly defines structural layout limits down to the exact byte to prevent buffer overflows or serialization panics:
  `Space Allocation = 8 (Discriminator) + 32x3 (Pubkeys) + 8 (u64) + 36 (String Bound) + 1 (Enum) + 2 (Bumps) = 151 bytes`

---

## 📂 Repository Structure

```text
├── program/                 # Anchor Smart Contract Infrastructure
│   ├── src/lib.rs           # Core multi-signer escrow logic & validation gates
│   └── Cargo.toml           # Manifest configurations & dependencies
oracle/
├── package.json
├── tsconfig.json
├── .env
└── src/
    ├── index.ts
    ├── listener.ts
    ├── verification.ts
    ├── chain.ts
    ├── store.ts
    ├── config.ts
    └── types.ts
└── frontend/                # Next.js 14 Client Dashboard Application
