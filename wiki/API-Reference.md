# API Reference

The Mappers API server (`apps/api-server/`) exposes a REST API for managing escrow jobs, submitting deliverables, and querying aggregate statistics. All endpoints are prefixed with `/api`.

**Base URL (local):** `http://localhost:3000/api`

---

## Authentication

The API currently does not require authentication. All endpoints are publicly accessible.

---

## Endpoints

### Health Check

```
GET /api/health
```

Returns server health status.

**Response:**
```json
{
  "status": "ok"
}
```

---

### List Jobs

```
GET /api/jobs
```

Returns all registered escrow jobs, ordered by creation date.

**Query Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `status` | `"pending" \| "completed" \| "cancelled"` | Filter by job status |
| `clientPubkey` | `string` | Filter by client wallet address |

Both filters can be combined. When both are provided, only jobs matching **both** conditions are returned.

**Response:**
```json
[
  {
    "id": 1,
    "jobId": "project-alpha-001",
    "clientPubkey": "ABC...xyz",
    "freelancerPubkey": "DEF...uvw",
    "oraclePubkey": "GHI...rst",
    "amountLamports": "5000000000",
    "status": "pending",
    "description": "Build a landing page",
    "acceptanceCriteria": "[\"Responsive\",\"Fast load\"]",
    "txSig": null,
    "createdAt": "2026-01-15T10:30:00.000Z",
    "updatedAt": "2026-01-15T10:30:00.000Z"
  }
]
```

**Examples:**
```bash
# All jobs
curl http://localhost:3000/api/jobs

# Only pending jobs
curl http://localhost:3000/api/jobs?status=pending

# Jobs by a specific client
curl http://localhost:3000/api/jobs?clientPubkey=ABC...xyz

# Pending jobs by a specific client
curl http://localhost:3000/api/jobs?status=pending&clientPubkey=ABC...xyz
```

---

### Create Job

```
POST /api/jobs
```

Register a new escrow job in the database. This should be called after the on-chain `initialize_job` transaction is confirmed, to mirror the on-chain state for efficient querying.

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `jobId` | `string` | Yes | Unique job identifier (max 32 chars) |
| `clientPubkey` | `string` | Yes | Client wallet address |
| `freelancerPubkey` | `string` | Yes | Freelancer wallet address |
| `oraclePubkey` | `string` | Yes | Oracle authority address |
| `amountLamports` | `string` | Yes | Escrowed amount in lamports (as string for u64 safety) |
| `description` | `string` | No | Job description |
| `acceptanceCriteria` | `string[]` | No | List of criteria for AI evaluation |

**Example:**
```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "project-alpha-001",
    "clientPubkey": "ABC...xyz",
    "freelancerPubkey": "DEF...uvw",
    "oraclePubkey": "GHI...rst",
    "amountLamports": "5000000000",
    "description": "Build a landing page with hero section",
    "acceptanceCriteria": ["Responsive design", "Contact form works"]
  }'
```

**Response (201):**
```json
{
  "id": 1,
  "jobId": "project-alpha-001",
  "clientPubkey": "ABC...xyz",
  "freelancerPubkey": "DEF...uvw",
  "oraclePubkey": "GHI...rst",
  "amountLamports": "5000000000",
  "status": "pending",
  "description": "Build a landing page with hero section",
  "acceptanceCriteria": "[\"Responsive design\",\"Contact form works\"]",
  "txSig": null,
  "createdAt": "2026-01-15T10:30:00.000Z",
  "updatedAt": "2026-01-15T10:30:00.000Z"
}
```

---

### Get Job

```
GET /api/jobs/:jobId
```

Fetch a single job by its ID.

**Response (200):**
```json
{
  "id": 1,
  "jobId": "project-alpha-001",
  "clientPubkey": "ABC...xyz",
  ...
}
```

**Response (404):**
```json
{
  "error": "Job not found"
}
```

---

### Update Job

```
PATCH /api/jobs/:jobId
```

Update a job's status, transaction signature, or description.

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `status` | `"pending" \| "completed" \| "cancelled"` | No | New status |
| `txSig` | `string` | No | Transaction signature |
| `description` | `string` | No | Updated description |

All fields are optional. Only provided fields are updated. Empty strings are valid values (e.g., to clear a description).

**Example:**
```bash
curl -X PATCH http://localhost:3000/api/jobs/project-alpha-001 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "completed",
    "txSig": "5KtP...abc"
  }'
```

**Response (200):** Updated job object.

**Response (404):**
```json
{
  "error": "Job not found"
}
```

---

### Submit Deliverable

```
POST /api/jobs/:jobId/submit
```

Submit a freelancer's deliverable for AI verification. This proxies the request to the oracle middleware, which triggers the dual-model consensus pipeline.

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `description` | `string` | Yes | Original job brief |
| `acceptanceCriteria` | `string[]` | Yes | Criteria the deliverable must meet |
| `deliverable` | `string` | Yes | The deliverable content or reference |
| `deliverableType` | `"url" \| "ipfs" \| "text" \| "json"` | Yes | Type of deliverable |

**Example:**
```bash
curl -X POST http://localhost:3000/api/jobs/project-alpha-001/submit \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Build a landing page with hero section",
    "acceptanceCriteria": ["Responsive design", "Contact form works"],
    "deliverable": "https://my-project.vercel.app",
    "deliverableType": "url"
  }'
```

**Response (200) — Consensus reached:**
```json
{
  "success": true,
  "jobId": "project-alpha-001",
  "outcome": "RELEASE",
  "txSig": "5KtP...abc",
  "error": null
}
```

**Response (503) — Oracle unreachable:**
```json
{
  "success": false,
  "jobId": "project-alpha-001",
  "outcome": null,
  "txSig": null,
  "error": "Oracle is not reachable. Ensure the oracle middleware is running with valid API keys."
}
```

---

### Get Statistics

```
GET /api/stats
```

Returns aggregate statistics across all jobs.

**Response:**
```json
{
  "total": 42,
  "pending": 8,
  "completed": 30,
  "cancelled": 4,
  "totalEscrowedLamports": "40000000000"
}
```

`totalEscrowedLamports` represents the sum of all currently pending escrows (as a string for u64 safety).

---

### Oracle Health Proxy

```
GET /api/oracle/health
```

Proxies the oracle's health endpoint. Useful for the dashboard to check oracle connectivity without needing to know the oracle's direct URL.

**Response (200):**
```json
{
  "status": "ok",
  "pendingJobs": 3,
  "timestamp": "2026-01-15T10:30:00.000Z"
}
```

**Response (503) — Oracle unreachable:**
```json
{
  "status": "unreachable",
  "pendingJobs": 0,
  "timestamp": "2026-01-15T10:30:00.000Z"
}
```

---

## Error Responses

All error responses follow a consistent format:

```json
{
  "error": "Human-readable error message"
}
```

| Status | Meaning |
|---|---|
| 400 | Invalid request (validation failure) |
| 404 | Resource not found |
| 500 | Internal server error |
| 503 | Oracle service unavailable |

---

## Data Types

### Job Object

| Field | Type | Description |
|---|---|---|
| `id` | `number` | Auto-increment database ID |
| `jobId` | `string` | Unique job identifier (matches on-chain) |
| `clientPubkey` | `string` | Client Solana wallet address |
| `freelancerPubkey` | `string` | Freelancer Solana wallet address |
| `oraclePubkey` | `string` | Oracle authority address |
| `amountLamports` | `string` | Escrowed amount (string for u64 precision) |
| `status` | `string` | `"pending"`, `"completed"`, or `"cancelled"` |
| `description` | `string \| null` | Job description |
| `acceptanceCriteria` | `string \| null` | JSON-encoded array of criteria |
| `txSig` | `string \| null` | Most recent transaction signature |
| `createdAt` | `string` | ISO 8601 timestamp |
| `updatedAt` | `string` | ISO 8601 timestamp |

### Amount Representation

Amounts are always represented as **strings** in the API to preserve u64 precision. JavaScript's `Number` type loses precision above `2^53 - 1` (approximately 9,007,199 SOL). The string representation ensures no information is lost.

---

## Using the Generated React Client

The `@workspace/api-client-react` package provides type-safe TanStack Query hooks generated from the OpenAPI spec:

```typescript
import { useListJobs, useGetJob, useCreateJob, useSubmitDeliverable } from "@workspace/api-client-react";
import { setBaseUrl } from "@workspace/api-client-react";

// Configure base URL (for non-same-origin deployments)
setBaseUrl("http://localhost:3000");

// In your React component:
function JobList() {
  const { data: jobs, isLoading } = useListJobs({ status: "pending" });

  if (isLoading) return <div>Loading...</div>;
  return jobs?.map(job => <div key={job.jobId}>{job.jobId}</div>);
}
```

See the [SDK Reference](SDK-Reference.md) for the on-chain client, or [Getting Started](Getting-Started.md) to run the server locally.
