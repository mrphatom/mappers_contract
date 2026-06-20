# Glossary

Definitions of the core terms, accounts, roles, states, and error codes used across the Mappers Protocol. Derived from the root [`README.md`](../../README.md) and the [whitepaper](../../mappers_whitepaper.md).

---

## Core Concepts

**Mappers Protocol** — A decentralized freelance escrow protocol on Solana that automates payment settlement using an AI-driven oracle consensus loop, replacing human arbitration and platform intermediaries.

**Escrow** — Funds locked on-chain at job creation and held until the job resolves (released to the freelancer or refunded to the client).

**PDA (Program Derived Address)** — A deterministic, program-owned Solana address derived from seeds and a bump. Mappers uses two PDAs per job: the GigEscrow account and the Vault account.

**CPI (Cross-Program Invocation)** — One Solana program calling another. Mappers uses System Program CPIs to move native lamports into and out of the vault.

**Bump** — The nonce byte used to push a derived address off the ed25519 curve so it can be a valid PDA. Mappers stores the canonical `escrow_bump` and `vault_bump` on-chain to avoid recomputing them (`find_program_address`) on every resolution.

**Lamport** — The smallest unit of SOL (1 SOL = 1,000,000,000 lamports).

**Rent / Rent-Exempt Minimum** — The lamport balance an account must hold to remain on-chain (~890,880 lamports for a zero-data account). Mappers enforces deposits above this floor and reclaims rent to the client when an escrow closes.

**SBF (Solana Bytecode Format)** — The compiled bytecode format Solana programs run as.

---

## Accounts

**GigEscrow PDA** — The on-chain state account storing job metadata and lifecycle status. Derived from `seeds = ["gig-escrow", client_pubkey, job_id]`. Holds `client`, `freelancer`, `oracle`, `amount`, `job_id`, `status`, `escrow_bump`, and `vault_bump`. Allocated 151 bytes.

**Vault PDA** — A data-less, System Program-owned account holding the client's locked SOL. Derived from `seeds = ["vault", client_pubkey, job_id]`. Owned by the System Program so native lamport transfers work.

---

## Roles

**Client** — The party that funds a job via `initialize_job`. Receives refunds on cancellation and reclaimed rent on resolution. Can manually approve `release_payment`.

**Freelancer** — The party delivering the work and receiving payment on a successful `release_payment`.

**Oracle** — The authorized AI middleware key that can autonomously call `release_payment` or `cancel_job` based on AI consensus. A multisig in production deployments.

**Manus AI Pro** — The off-chain orchestrator that dispatches verification requests to the Gemini and Claude APIs and computes consensus.

---

## Job Lifecycle States (`JobStatus`)

**Pending** — Initial state after `initialize_job`; funds are locked and awaiting resolution.

**Completed** — Terminal state after `release_payment`; funds paid to the freelancer and escrow closed.

**Cancelled** — Terminal state after `cancel_job`; funds refunded to the client and escrow closed.

State transitions are irreversible; there is no re-open path after a terminal state.

---

## AI Consensus Terms

**Dual-Model AI Consensus** — The requirement that two independent models (Gemini and Claude) must agree before funds move autonomously.

**Verdict** — A model's structured decision: `APPROVED` or `REJECTED`, with a `confidence` score, `reasoning`, and lists of criteria met/failed.

**Confidence Threshold** — The minimum confidence required for an autonomous action: ≥ 0.80 for approvals, ≥ 0.75 for rejections (from both models).

**Consensus Outcome** — The final action derived from the two verdicts: `release_payment`, `cancel_job`, or escalation to human arbitration.

**Human Arbitration** — The manual fallback queue used when verdicts diverge or fall below threshold; the oracle authority makes and signs the final call.

**SubmissionArtifact** — The freelancer's deliverable, supplied as a URL, IPFS reference, structured JSON, or raw text (`deliverableType`).

**Prompt Injection Defense** — Sanitizing and XML-delimiting artifact content so models treat it as data, not instructions.

---

## Infrastructure

**Helius gRPC (Yellowstone Geyser)** — The low-latency streaming endpoint the oracle subscribes to for real-time, sub-second job detection. QuickNode is the failover.

**Anchor Framework** — The Rust framework (v0.30) used to build the escrow program, providing account validation constraints like `has_one` and `close`.

**`close = client` constraint** — The Anchor constraint that deallocates the escrow account on resolution and returns its rent-exempt lamports to the client.

**`has_one` constraint** — The Anchor constraint that verifies an account passed in a transaction matches a pubkey stored on-chain (`has_one = freelancer | oracle | client`), enforced before instruction logic runs.

---

## Error Codes

| Code | Name | Condition |
|---|---|---|
| 6000 | `JobIdTooLong` | `job_id.len() > 32` |
| 6001 | `InvalidAmount` | `amount == 0` |
| 6002 | `AmountBelowRentExemption` | `amount < rent_exempt_minimum` (~890,880 lamports) |
| 6003 | `JobNotPending` | `status != Pending` (job already resolved) |
| 6004 | `UnauthorizedExecution` | Caller is not client or oracle |
| 6005 | `InvalidFreelancerTarget` | Passed freelancer ≠ stored freelancer |
| 6006 | `InvalidOracleAuthority` | Caller is not stored oracle |
| 6007 | `InvalidClientAuthority` | Passed client ≠ stored client |

---

See the [Architecture](Architecture.md) page for how these pieces fit together, or [Getting Started](Getting-Started.md) to run the stack.
