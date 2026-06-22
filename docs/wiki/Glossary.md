# Glossary

Definitions of core terms, accounts, roles, states, infrastructure, and error codes used across the Mappers Protocol.

---

## Core Concepts

**Mappers Protocol** — A decentralized freelance escrow protocol on Solana that automates payment settlement using an AI-driven oracle consensus loop, replacing human arbitration and platform intermediaries.

**Escrow** — Funds locked on-chain at job creation and held until the job resolves (released to the freelancer or refunded to the client).

**PDA (Program Derived Address)** — A deterministic, program-owned Solana address derived from seeds and a bump. Mappers uses two PDAs per job: the GigEscrow account and the Vault account.

**CPI (Cross-Program Invocation)** — One Solana program calling another. Mappers uses System Program CPIs to move native lamports into and out of the vault.

**Bump** — The nonce byte used to push a derived address off the ed25519 curve so it can be a valid PDA. Mappers stores the canonical `escrow_bump` and `vault_bump` on-chain to avoid recomputing them on every resolution.

**Lamport** — The smallest unit of SOL (1 SOL = 1,000,000,000 lamports).

**Rent / Rent-Exempt Minimum** — The lamport balance an account must hold to remain on-chain (~890,880 lamports for a zero-data account). Mappers enforces deposits above this floor and reclaims rent to the client when an escrow closes.

**SBF (Solana Bytecode Format)** — The compiled bytecode format Solana programs run as.

---

## Accounts

**GigEscrow PDA** — The on-chain state account storing job metadata and lifecycle status. Derived from `seeds = ["gig-escrow", client_pubkey, job_id]`. Holds client, freelancer, oracle, amount, job_id, status, escrow_bump, and vault_bump. Allocated 151 bytes.

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

**Confidence Threshold** — The minimum confidence required for autonomous action: >= 0.80 for approvals, >= 0.75 for rejections (from both models).

**Consensus Outcome** — The final action derived from the two verdicts: `RELEASE` (pay freelancer), `REFUND` (refund client), or `ESCALATE` (human arbitration).

**Human Arbitration** — The manual fallback queue used when verdicts diverge or fall below threshold; the oracle authority makes and signs the final call.

**SubmissionArtifact** — The freelancer's deliverable, supplied as a URL, IPFS reference, structured JSON, or raw text (`deliverableType`).

**Prompt Injection Defense** — Sanitizing and XML-delimiting artifact content so models treat it as data, not instructions.

---

## Infrastructure & Stack

**Helius gRPC (Yellowstone Geyser)** — The low-latency streaming endpoint the oracle subscribes to for real-time, sub-second job detection. QuickNode is the failover.

**Anchor Framework** — The Rust framework (v0.30) used to build the escrow program, providing account validation constraints like `has_one` and `close`.

**Express 5** — The Node.js web framework used by the API server. Notable difference from v4: `listen()` no longer accepts an error callback.

**Drizzle ORM** — The TypeScript ORM used by the API server for PostgreSQL queries. Schema-first with push-based migrations.

**Vite** — The build tool and dev server for the React dashboard. Provides fast HMR and optimized production builds.

**TanStack Query** — The data-fetching library used in the dashboard. Manages server state (caching, background refetching, loading states).

**shadcn/ui** — The component library used in the dashboard. Provides accessible, unstyled primitives built on Radix UI.

**orval** — The code generation tool that produces Zod schemas and React Query hooks from the OpenAPI specification.

**pnpm** — The workspace-aware package manager. Enforces strict dependency resolution and hoisting rules.

**Workspace Protocol (`workspace:*`)** — pnpm's mechanism for linking local packages. Ensures all internal dependencies resolve to the local source.

---

## Anchor Constraints

**`close = client` constraint** — Deallocates the escrow account on resolution and returns its rent-exempt lamports to the client.

**`has_one` constraint** — Verifies an account passed in a transaction matches a pubkey stored on-chain (`has_one = freelancer | oracle | client`), enforced before instruction logic runs.

**`bump =` constraint** — Pins the PDA bump at the account validation layer, eliminating `find_program_address` calls at runtime.

---

## SDK Classes

**MappersClient** — The on-chain client (`lib/sdk`). Wraps the Anchor program and provides typed methods for `initializeJob`, `releasePayment`, `cancelJob`, and account queries.

**OracleClient** — The HTTP client (`lib/sdk`). Communicates with the oracle middleware for health checks, job queries, and deliverable submission.

**OracleError** — The error class thrown by OracleClient for all failure cases (HTTP errors, non-JSON responses, network failures). Contains `statusCode` and `message`.

**ApiError** — The error class thrown by the dashboard's custom fetch layer for failed API responses. Contains `status`, `statusText`, and parsed error `data`.

---

## Database Schema

**`jobs` table** — The PostgreSQL table mirroring on-chain escrow state for efficient querying:

| Column | Type | Description |
|---|---|---|
| `id` | serial | Auto-increment primary key |
| `job_id` | text (unique) | Matches on-chain job ID |
| `client_pubkey` | text | Client wallet address |
| `freelancer_pubkey` | text | Freelancer wallet address |
| `oracle_pubkey` | text | Oracle authority address |
| `amount_lamports` | text | Escrowed amount (string for u64 safety) |
| `status` | enum | `pending`, `completed`, `cancelled` |
| `description` | text (nullable) | Job description |
| `acceptance_criteria` | text (nullable) | JSON-encoded criteria array |
| `tx_sig` | text (nullable) | Most recent transaction signature |
| `created_at` | timestamptz | Creation time |
| `updated_at` | timestamptz | Last update time |

---

## Error Codes (On-Chain)

| Code | Name | Condition |
|---|---|---|
| 6000 | `JobIdTooLong` | `job_id.len() > 32` |
| 6001 | `InvalidAmount` | `amount == 0` |
| 6002 | `AmountBelowRentExemption` | `amount < rent_exempt_minimum` (~890,880 lamports) |
| 6003 | `JobNotPending` | `status != Pending` (job already resolved) |
| 6004 | `UnauthorizedExecution` | Caller is not client or oracle |
| 6005 | `InvalidFreelancerTarget` | Passed freelancer != stored freelancer |
| 6006 | `InvalidOracleAuthority` | Caller is not stored oracle |
| 6007 | `InvalidClientAuthority` | Passed client != stored client |

---

See the [Architecture](Architecture.md) page for how these pieces fit together, [SDK Reference](SDK-Reference.md) for programmatic usage, or [Getting Started](Getting-Started.md) to run the stack.
