# SDK Reference

The `@mappers-protocol/sdk` package (`lib/sdk/`) provides TypeScript clients for interacting with the Mappers Protocol — both the on-chain escrow program and the oracle HTTP API.

---

## Installation

The SDK is a workspace package. Within the monorepo, add it as a dependency:

```json
{
  "dependencies": {
    "@mappers-protocol/sdk": "workspace:*"
  }
}
```

---

## Exports

```typescript
import {
  // On-chain client
  MappersClient,

  // Oracle HTTP client
  OracleClient,
  OracleError,

  // PDA derivation
  deriveEscrowPda,
  deriveVaultPda,

  // Constants
  MAPPERS_PROGRAM_ID,
  PDA_SEEDS,
  JOB_ID_MAX_LENGTH,
  MINIMUM_ESCROW_LAMPORTS,

  // Types
  type GigEscrowAccount,
  type FetchedEscrow,
  type InitializeJobParams,
  type ReleasePaymentParams,
  type CancelJobParams,
  type JobStatus,
  type SubmitRequest,
  type SubmitResponse,
  type OracleHealthResponse,
  type OracleJobResponse,
  type DeliverableType,
  type ConsensusOutcome,

  // Type guards
  isJobPending,
  isJobCompleted,
  isJobCancelled,
} from "@mappers-protocol/sdk";
```

---

## MappersClient

The on-chain client wraps the Anchor program and provides typed methods for all escrow instructions.

### Constructor

```typescript
import { AnchorProvider } from "@coral-xyz/anchor";
import { MappersClient, MAPPERS_PROGRAM_ID } from "@mappers-protocol/sdk";

const provider = AnchorProvider.env(); // or construct your own
const client = new MappersClient(provider);

// Optionally pass a custom program ID (e.g., for localnet)
const localClient = new MappersClient(provider, myLocalProgramId);
```

### Initialize a Job

Create an escrow and deposit SOL into the vault:

```typescript
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

const txSig = await client.initializeJob({
  jobId: "project-alpha-001",          // max 32 characters
  amount: new BN(5_000_000_000),       // 5 SOL in lamports
  freelancer: new PublicKey("..."),     // freelancer wallet
  oracle: new PublicKey("..."),        // oracle authority
});

console.log("Job initialized:", txSig);
```

**Validations:**
- `jobId` must be <= 32 characters (throws locally if exceeded)
- `amount` must be >= 890,880 lamports (enforced on-chain)
- The signer (from the provider wallet) becomes the `client`

### Release Payment

Pay the freelancer and close the escrow:

```typescript
const escrow = await client.fetchEscrowByJobId(clientPubkey, "project-alpha-001");
const [escrowPda] = client.deriveEscrowPda(clientPubkey, "project-alpha-001");

const txSig = await client.releasePayment({
  escrowPubkey: escrowPda,
  escrow,
});
```

The signer must be either the `client` or the `oracle` stored on the escrow account.

### Cancel a Job

Refund the client (oracle-only):

```typescript
const txSig = await client.cancelJob({
  escrowPubkey: escrowPda,
  escrow,
});
```

The signer must be the `oracle` stored on the escrow account.

### Fetch Escrow Accounts

```typescript
// Fetch a single escrow by its public key
const escrow = await client.fetchEscrow(escrowPubkey);

// Fetch by client + jobId (derives the PDA internally)
const escrow = await client.fetchEscrowByJobId(clientPubkey, "project-alpha-001");

// Fetch all escrows in the program
const all = await client.fetchAllEscrows();
// Returns: FetchedEscrow[] — each has { publicKey, account }

// Fetch all escrows for a specific client
const clientEscrows = await client.fetchEscrowsByClient(clientPubkey);
```

### PDA Derivation

Derive PDA addresses without making RPC calls:

```typescript
const [escrowPda, escrowBump] = client.deriveEscrowPda(clientPubkey, jobId);
const [vaultPda, vaultBump] = client.deriveVaultPda(clientPubkey, jobId);

// Or use standalone functions
import { deriveEscrowPda, deriveVaultPda } from "@mappers-protocol/sdk";
const [pda, bump] = deriveEscrowPda(clientPubkey, jobId);
```

---

## OracleClient

HTTP client for the oracle middleware API.

### Constructor

```typescript
import { OracleClient } from "@mappers-protocol/sdk";

const oracle = new OracleClient("http://localhost:3001");
```

### Health Check

```typescript
const health = await oracle.health();
// Returns: { status: string, pendingJobs: number, timestamp: string }
```

### Get Job State

```typescript
const job = await oracle.getJob("project-alpha-001");
// Returns: {
//   jobId: string,
//   escrowPubkey: string,
//   client: string,
//   freelancer: string,
//   amount: string,
//   status: "pending" | "completed" | "cancelled",
//   detectedAt: number
// }
```

### Submit a Deliverable

Trigger AI verification for a job:

```typescript
const result = await oracle.submitDeliverable({
  jobId: "project-alpha-001",
  description: "Build a landing page with hero section and contact form",
  acceptanceCriteria: [
    "Responsive design (mobile + desktop)",
    "Contact form sends email",
    "Hero section has CTA button",
  ],
  deliverable: "https://example.com/landing-page",
  deliverableType: "url",
});

// Returns: {
//   success: boolean,
//   jobId: string,
//   outcome?: "RELEASE" | "REFUND" | "ESCALATE",
//   txSig?: string,
//   error?: string
// }

if (result.outcome === "RELEASE") {
  console.log("Payment released! Tx:", result.txSig);
} else if (result.outcome === "REFUND") {
  console.log("Job cancelled, client refunded. Tx:", result.txSig);
} else if (result.outcome === "ESCALATE") {
  console.log("Escalated to human arbitration.");
}
```

### Deliverable Types

| Type | Description | Example |
|---|---|---|
| `"url"` | Public URL to the deliverable | `"https://example.com/project"` |
| `"ipfs"` | IPFS content identifier | `"QmXyz..."` |
| `"text"` | Raw text content | `"Here is the completed article..."` |
| `"json"` | Structured JSON payload | `'{"report": {...}}'` |

### Error Handling

All errors from the oracle client are thrown as `OracleError`:

```typescript
import { OracleClient, OracleError } from "@mappers-protocol/sdk";

try {
  const result = await oracle.submitDeliverable(payload);
} catch (err) {
  if (err instanceof OracleError) {
    console.error(`Oracle error (${err.statusCode}): ${err.message}`);
    // Handles:
    // - HTTP errors (4xx, 5xx) with JSON error bodies
    // - Non-JSON responses (e.g., nginx 502 proxy errors)
    // - Connection failures
  }
}
```

---

## Types

### GigEscrowAccount

```typescript
interface GigEscrowAccount {
  client: PublicKey;
  freelancer: PublicKey;
  oracle: PublicKey;
  amount: BN;           // lamports locked in the vault
  jobId: string;
  status: JobStatus;
  escrowBump: number;
  vaultBump: number;
}
```

### JobStatus

Anchor represents enums as objects with a single key:

```typescript
type JobStatus =
  | { pending: Record<string, never> }
  | { completed: Record<string, never> }
  | { cancelled: Record<string, never> };

// Use the type guards:
import { isJobPending, isJobCompleted, isJobCancelled } from "@mappers-protocol/sdk";

if (isJobPending(escrow.status)) {
  // Job is still active
}
```

### ConsensusOutcome

```typescript
type ConsensusOutcome = "RELEASE" | "REFUND" | "ESCALATE";
```

---

## Constants

```typescript
import {
  MAPPERS_PROGRAM_ID,       // PublicKey — devnet program address
  PDA_SEEDS,                // { ESCROW: "gig-escrow", VAULT: "vault" }
  JOB_ID_MAX_LENGTH,        // 32
  MINIMUM_ESCROW_LAMPORTS,  // 890_880
} from "@mappers-protocol/sdk";
```

---

## Full Example

```typescript
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { MappersClient, OracleClient } from "@mappers-protocol/sdk";

// Set up provider
const connection = new Connection("https://api.devnet.solana.com");
const wallet = new Wallet(Keypair.generate());
const provider = new AnchorProvider(connection, wallet, {});

// Create clients
const mappers = new MappersClient(provider);
const oracle = new OracleClient("http://localhost:3001");

// Create a job
const jobId = `job-${Date.now()}`;
const txSig = await mappers.initializeJob({
  jobId,
  amount: new BN(1_000_000_000), // 1 SOL
  freelancer: new PublicKey("FreelancerPubkeyHere"),
  oracle: new PublicKey("OraclePubkeyHere"),
});

// Later — submit a deliverable for AI verification
const result = await oracle.submitDeliverable({
  jobId,
  description: "Write a 500-word blog post about Solana DeFi",
  acceptanceCriteria: ["500+ words", "Mentions at least 3 DeFi protocols", "No factual errors"],
  deliverable: "https://docs.google.com/doc/d/...",
  deliverableType: "url",
});

console.log("Outcome:", result.outcome);
```

---

See the [API Reference](API-Reference.md) for the REST API endpoints, or [Architecture](Architecture.md) for how the SDK fits into the broader system.
