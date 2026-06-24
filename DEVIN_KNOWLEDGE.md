# Mappers Protocol — Devin AI Knowledge Base
## Production-Grade Engineering Reference

> Read this entire document before touching any file in this repo.
> This is the authoritative source of truth for all architectural decisions.

---

## 1. Project Identity

**What Mappers Is**
A decentralized freelance settlement protocol on Solana. Clients lock SOL in an on-chain escrow vault. When a freelancer submits work, an autonomous AI oracle dispatches the deliverable to Gemini and Claude in parallel. Only when both models independently agree the work meets acceptance criteria does the oracle sign and execute the on-chain payment release. No platform fees. No human approval required for standard settlements.

**What Mappers Is Not**
- Not a token project — all settlement is native SOL, no protocol token
- Not a DAO — no governance contracts
- Not a lending protocol — funds are locked, not invested
- Not a general-purpose oracle — the oracle is purpose-built for freelance deliverable verification

**Live Program (Devnet)**
```
Program ID: 52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu
Network: Solana Devnet
Framework: Anchor 0.30.1
```

**Repo**
```
https://github.com/mrphatom/mappers_contract
```

---

## 2. Monorepo Structure

```
mappers_contract/
├── programs/project_mappers/src/lib.rs   ← Anchor smart contract (HANDLE WITH CARE)
├── tests/
│   ├── project_mappers.ts                ← Anchor integration tests
│   └── helpers.ts                        ← createEscrow(), expectAnchorError(), airdrop()
├── oracle/
│   ├── src/
│   │   ├── index.ts                      ← Entry point: HTTP server + gRPC listener boot
│   │   ├── listener.ts                   ← Helius gRPC subscription + account decoder
│   │   ├── verification.ts               ← Gemini + Claude parallel verification engine
│   │   ├── chain.ts                      ← On-chain transaction builder and signer
│   │   ├── store.ts                      ← In-memory pending job registry
│   │   ├── config.ts                     ← Env var loader and validator
│   │   ├── types.ts                      ← Shared TypeScript interfaces
│   │   └── utils.ts                      ← Shared utility functions
│   ├── src/__tests__/                    ← Oracle unit tests (Vitest)
│   │   ├── config.test.ts
│   │   ├── index.test.ts
│   │   ├── listener.test.ts
│   │   ├── store.test.ts
│   │   └── verification.test.ts
│   ├── idl.json                          ← Copy of compiled program IDL
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
├── apps/
│   ├── dashboard/                        ← React 18 + Vite + shadcn/ui frontend
│   │   ├── src/pages/                    ← create-job, jobs, job-detail, oracle, dashboard
│   │   ├── src/components/               ← job-card, status-badge, wallet-button, wallet-provider
│   │   └── src/hooks/use-mappers-client.ts ← Bridge between UI and on-chain program
│   └── api-server/                       ← Express API server
│       ├── src/app.ts
│       ├── src/routes/jobs.ts
│       └── src/routes/health.ts
├── lib/
│   ├── sdk/                              ← @mappers-protocol/sdk
│   │   ├── client.ts                     ← MappersEscrowClient
│   │   ├── oracle.ts                     ← MappersOracleClient
│   │   ├── pda.ts                        ← PDA derivation utilities
│   │   ├── types.ts                      ← Shared types
│   │   ├── constants.ts                  ← Program ID, seeds, thresholds
│   │   └── index.ts                      ← Public exports
│   ├── api-spec/openapi.yaml             ← OpenAPI 3.0 spec (source of truth for API)
│   ├── api-client-react/generated/       ← Auto-generated from OpenAPI spec (DO NOT EDIT MANUALLY)
│   ├── api-zod/                          ← Auto-generated Zod schemas (DO NOT EDIT MANUALLY)
│   └── db/
│       ├── drizzle.config.ts
│       └── schema/jobs.ts                ← Drizzle ORM jobs table
├── scripts/
│   └── e2e-devnet.ts                     ← End-to-end devnet test script
├── shared/pda.ts                         ← Shared PDA derivation (used by tests + scripts)
├── docs/wiki/                            ← 11 documentation files
├── idl.json                              ← Root IDL (copy from oracle/idl.json after builds)
├── Anchor.toml
├── Cargo.toml
├── package.json                          ← Root: ts-mocha test runner
├── tsconfig.json                         ← Root TypeScript config
└── Makefile                              ← Build/test shortcuts
```

---

## 3. Smart Contract — Critical Rules

### 3.1 DO NOT modify lib.rs without explicit instruction from the project lead.

The contract is deployed on devnet. Unauthorized changes require redeployment, IDL regeneration, and updates across oracle/idl.json, root idl.json, apps/dashboard, and lib/sdk. A botched deployment can brick the live program.

### 3.2 Account Architecture — The Dual PDA Pattern

Every job creates two separate PDAs:

**GigEscrow PDA** (stores state):
```rust
seeds = [b"gig-escrow", client_pubkey, job_id_bytes]
```

**Vault PDA** (holds SOL lamports):
```rust
seeds = [b"vault", client_pubkey, job_id_bytes]
```

**Why two PDAs?** The Vault must be owned by the System Program for native SOL transfer CPIs to work. If merged into one account, Anchor's ownership model conflicts with System Program signer authority. This is the correct pattern — do not suggest merging them.

### 3.3 GigEscrow State Schema

```rust
pub struct GigEscrow {
    pub client:      Pubkey,    // 32 bytes
    pub freelancer:  Pubkey,    // 32 bytes
    pub oracle:      Pubkey,    // 32 bytes
    pub amount:      u64,       // 8 bytes
    pub job_id:      String,    // 4 + 32 bytes (max 32 char ID)
    pub status:      JobStatus, // 1 byte (Pending/Completed/Cancelled)
    pub escrow_bump: u8,        // 1 byte — GigEscrow PDA canonical bump
    pub vault_bump:  u8,        // 1 byte — Vault PDA canonical bump
}
// MAXIMUM_SPACE = 151 bytes (8 discriminator + fields above)
```

**Critical:** Both `escrow_bump` AND `vault_bump` are stored separately at initialization. Using `escrow_bump` to sign for the vault is a CRITICAL bug that causes every settlement to revert at runtime. Always use `vault_bump` when signing for vault transfers.

### 3.4 Job Lifecycle — State Machine

```
PENDING ──── oracle.releasePayment() ────▶ COMPLETED
PENDING ──── oracle.cancelJob()      ────▶ CANCELLED
```

Both `releasePayment` and `cancelJob` carry `close = client` which atomically closes the `GigEscrow` account and returns rent to the client. This is a constraint, not optional logic — do not remove it.

### 3.5 Error Codes

| Code | Name | Condition |
|---|---|---|
| 6000 | JobIdTooLong | job_id.len() > 32 |
| 6001 | InvalidAmount | amount == 0 |
| 6002 | AmountBelowRentExemption | amount < ~890,880 lamports |
| 6003 | JobNotPending | status != Pending |
| 6004 | UnauthorizedExecution | signer ≠ client and signer ≠ oracle |
| 6005 | InvalidFreelancerTarget | passed freelancer ≠ stored freelancer |
| 6006 | InvalidOracleAuthority | signer ≠ stored oracle |
| 6007 | InvalidClientAuthority | passed client ≠ stored client |

### 3.6 Instructions

**initialize_job(job_id: String, amount: u64)**
- Validates job_id ≤ 32 chars, amount > 0, amount ≥ rent-exempt minimum
- Stores both bumps at initialization
- Transfers SOL from client to vault via System Program CPI
- Sets status = Pending

**release_payment()**
- Authority can be client OR oracle (hybrid approval model)
- Reads and caches all state before any mutable borrow (reentrancy mitigation)
- Uses stored vault_bump to sign vault transfer
- Sets status = Completed
- Escrow account closed via close = client constraint

**cancel_job()**
- Only oracle can sign
- Refunds vault balance to client
- Sets status = Cancelled
- Escrow account closed via close = client constraint

---

## 4. Oracle Middleware — Architecture

### 4.1 Boot Sequence (index.ts)
1. Validate all env vars via config.ts
2. Start Helius gRPC listener (listener.ts) — non-blocking background loop
3. Start Express HTTP server on PORT (default 3001)
4. Register graceful shutdown on SIGTERM/SIGINT

### 4.2 gRPC Listener (listener.ts)
- Uses `@triton-one/yellowstone-grpc` v2.x
- Subscribes to ALL accounts owned by the program ID
- Decodes each account update using BorshCoder from `@coral-xyz/anchor`
- If decoded as GigEscrow with status Pending → upsert to store
- If status Completed or Cancelled → remove from store
- Reconnects with exponential backoff on stream drop (base 2s, max 60s)

### 4.3 Verification Pipeline (verification.ts)

```
Submission arrives
       │
       ▼
buildSystemPrompt() + buildUserPrompt(description, criteria, deliverable)
       │
       ├──▶ callGemini() ──────────────────────────────────┐
       │    [gemini-2.5-flash via REST API]                 │
       │                                                    ▼
       └──▶ callClaude() ──────────────────────── ► determineOutcome()
            [claude-sonnet-4-6 via Anthropic SDK]          │
                                                            ▼
                                              RELEASE / REFUND / ESCALATE
```

**Prompt injection defense:** All deliverable content is wrapped in XML delimiters (`<deliverable>`) and models are instructed to treat that content as data only, never as instructions.

**Confidence thresholds:**
- Approval requires ≥ 0.80 confidence from both models
- Rejection requires ≥ 0.75 confidence from both models
- Sub-threshold from either model → ESCALATE regardless of verdict

**Response schema (both models must return):**
```json
{
  "work_approved": boolean,
  "confidence_score": float,
  "reasoning_summary": "string"
}
```

### 4.4 HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| GET | /health | Liveness check + pending job count |
| GET | /jobs/:jobId | Fetch tracked job from in-memory store |
| POST | /submit | Trigger AI verification for a deliverable |

**POST /submit body:**
```typescript
{
  jobId: string;
  description: string;
  acceptanceCriteria: string[];
  deliverable: string;
  deliverableType: "url" | "text" | "json" | "ipfs";
}
```

### 4.5 Chain Interaction (chain.ts)
- Loads oracle keypair from `ORACLE_PRIVATE_KEY` env var (base58 encoded)
- Injects `PROGRAM_ID` into IDL at runtime (IDL address field override)
- Uses `@coral-xyz/anchor` Program instance for all instruction calls
- Derives Vault PDA using `PublicKey.findProgramAddressSync` at call time
- Signs all transactions with oracle keypair

---

## 5. Environment Variables

### Oracle (.env)
```bash
# Required — Solana
SOLANA_RPC_URL=             # Helius devnet endpoint
PROGRAM_ID=52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu
ORACLE_PRIVATE_KEY=         # Base58 private key of oracle signer

# Required — Helius gRPC
HELIUS_GRPC_ENDPOINT=       # Format: your-endpoint.helius-rpc.com:2053
HELIUS_API_KEY=             # From Helius dashboard

# Required — AI APIs
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_MODEL=gemini-2.5-flash           # DO NOT use gemini-1.5-pro — deprecated
ANTHROPIC_MODEL=claude-sonnet-4-6       # Current Sonnet model

# Confidence thresholds
APPROVAL_CONFIDENCE_THRESHOLD=0.80
REJECTION_CONFIDENCE_THRESHOLD=0.75

# Server
PORT=3001
NODE_ENV=development

# Optional
SENTRY_DSN=
```

---

## 6. PDA Derivation — Source of Truth

Always derive PDAs exactly as follows. Any deviation breaks account validation:

```typescript
// GigEscrow PDA
const [escrowPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("gig-escrow"),
    clientPublicKey.toBuffer(),
    Buffer.from(jobId),       // jobId must be UTF-8 string, max 32 chars
  ],
  programId
);

// Vault PDA
const [vaultPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("vault"),
    clientPublicKey.toBuffer(),
    Buffer.from(jobId),
  ],
  programId
);
```

Seeds are in `shared/pda.ts` and `lib/sdk/pda.ts` — use those functions, do not re-derive inline.

---

## 7. Tech Stack — Exact Versions

| Layer | Technology | Version |
|---|---|---|
| Smart Contract | Rust + Anchor Framework | 0.30.1 |
| Solana Runtime | Solana CLI | 1.18.x |
| Oracle | Node.js | 18+ |
| Oracle | TypeScript | 5.5.x |
| Oracle | @coral-xyz/anchor | 0.30.0 |
| Oracle | @solana/web3.js | 1.95.x |
| Oracle | @triton-one/yellowstone-grpc | 2.x |
| Oracle | @anthropic-ai/sdk | 0.27.x |
| Oracle | @google/generative-ai | 0.15.x |
| Oracle Test Runner | Vitest | latest |
| Dashboard | React | 18 |
| Dashboard | Vite | latest |
| Dashboard | Tailwind CSS | 3.x |
| Dashboard | shadcn/ui | latest |
| API Server | Express | 4.19.x |
| ORM | Drizzle ORM | latest |
| API Spec | OpenAPI | 3.0 |
| Code Generator | Orval | latest |
| Package Manager | pnpm (workspace) | latest |
| Anchor Tests | ts-mocha | 10.x |
| Error Tracking | Sentry | 8.x |

---

## 8. Security Requirements — Non-Negotiable

These come from an independent security audit. Do not regress on any of these:

### 8.1 Oracle Authority
- The oracle keypair is currently a single hot signer (devnet only)
- For mainnet: oracle authority MUST be replaced with a threshold-signature or multisig
- Add emergency pause and key rotation controls before mainnet
- Never hardcode or log the oracle private key

### 8.2 AI Output Validation
- Every model response must be validated against the strict JSON schema
- Non-conforming responses must be rejected — never passed through with partial data
- Log the full prompt, model version, artifact hash, and model verdict for every call
- Confidence below threshold = ESCALATE, regardless of verdict

### 8.3 Artifact Integrity
- Currently accepting raw URLs — this is a known gap
- Upcoming: require SHA-256 hash or IPFS CID in submission, verify before consensus
- Never pass unvalidated deliverable content to the on-chain program

### 8.4 API Mutations
- PATCH /jobs/:jobId must be restricted to oracle/admin auth only
- Database state must never override chain state — chain is the source of truth
- Add chain-to-DB reconciliation

### 8.5 Never Do These
- Never remove `close = client` from ReleasePayment or CancelJob structs
- Never use `escrow_bump` to sign for vault transfers (use `vault_bump`)
- Never commit a `.env` file to the repository
- Never log private keys, API keys, or seed phrases
- Never change PDA seeds without updating ALL downstream consumers

---

## 9. Testing Commands

```bash
# Root — Anchor integration tests (requires local validator or devnet)
anchor test                           # localnet
anchor test --provider.cluster devnet # devnet

# Oracle unit tests
cd oracle && npx vitest               # run all
cd oracle && npx vitest store         # run specific file

# End-to-end devnet (requires oracle running in separate terminal)
cd oracle && npm run dev              # terminal 1
ts-node scripts/e2e-devnet.ts        # terminal 2

# Makefile shortcuts
make test          # anchor test localnet
make oracle-dev    # start oracle
make e2e           # run e2e script
make setup         # install all dependencies
```

---

## 10. API-Generated Files — DO NOT Edit Manually

These files are auto-generated from `lib/api-spec/openapi.yaml` using Orval:
- `lib/api-client-react/generated/` — entire directory
- `lib/api-zod/` — entire directory

If you need to change the API shape, edit `openapi.yaml` first, then regenerate:
```bash
cd lib/api-spec && npx orval
```

---

## 11. IDL Synchronization

The IDL file must be kept in sync across three locations:
1. `idl.json` (repo root) — source after `anchor build`
2. `oracle/idl.json` — oracle runtime reads this
3. `lib/sdk/idl.ts` — SDK embeds the IDL

After any contract change and rebuild, copy the new IDL to all three locations. The oracle cannot start with a stale IDL.

---

## 12. What Devin Can Work On Freely

✅ `apps/dashboard/` — all React/TypeScript frontend work
✅ `apps/api-server/` — Express routes, middleware, Drizzle schema
✅ `oracle/src/` — TypeScript oracle source (with security rules above)
✅ `oracle/src/__tests__/` — Vitest unit tests
✅ `tests/` — Anchor integration tests
✅ `lib/sdk/` — SDK TypeScript source
✅ `lib/api-spec/openapi.yaml` — API spec (then regenerate clients)
✅ `scripts/` — utility scripts
✅ `docs/wiki/` — documentation markdown

## 13. What Devin Must NOT Change Without Explicit Instruction

🚫 `programs/project_mappers/src/lib.rs` — smart contract
🚫 `idl.json` (all three copies) — only updated after anchor build
🚫 `lib/api-client-react/generated/` — auto-generated, use orval
🚫 `lib/api-zod/` — auto-generated, use orval
🚫 `.env` files — never create, never commit
🚫 PDA seed strings (`"gig-escrow"`, `"vault"`) — changing these breaks all existing accounts
🚫 `MAXIMUM_SPACE = 151` calculation — changing this causes deserialization panics
🚫 The dual bump storage pattern — removing vault_bump is a critical regression

---

## 14. Wallet Connect Pattern

The dashboard and scripts use `window.solana` directly — not the full `@solana/wallet-adapter` package suite. This is intentional to avoid package installation timeouts in the AI Studio build environment.

```typescript
const sol = window.solana;
if (!sol) { window.open("https://phantom.app", "_blank"); return; }
const res = await sol.connect();
const pubkey = res.publicKey.toString();
```

Do not refactor this to use wallet-adapter unless explicitly asked.

---

## 15. Consensus Engine Reference

The core consensus logic lives in `oracle/src/verification.ts`:

| Gemini | Claude | Outcome |
|---|---|---|
| APPROVED (≥0.80) | APPROVED (≥0.80) | `releasePayment` → freelancer |
| REJECTED (≥0.75) | REJECTED (≥0.75) | `cancelJob` → refund client |
| Divergent | — | `ESCALATE` → human arbitration |
| Sub-threshold | — | `ESCALATE` → human arbitration |

Human arbitration cases: oracle stores the job in an escalation queue and does NOT execute any on-chain instruction. Funds remain locked in Pending state until a human manually resolves.

---

## 16. Key Links

| Resource | URL |
|---|---|
| GitHub | https://github.com/mrphatom/mappers_contract |
| Live Demo | https://mappers-contract--godtimebenson4.replit.app/ |
| Landing Page | https://mappersio.vercel.app |
| Solana Explorer (Devnet) | https://explorer.solana.com/address/52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu?cluster=devnet |
| Whitepaper | mappers_whitepaper.md (repo root) |
| Helius Docs | https://docs.helius.dev |
| Anchor Docs | https://www.anchor-lang.com/docs |

---

*Mappers Protocol — Production Knowledge Base v1.0*
*Last updated: June 2026*
*License: MIT*
