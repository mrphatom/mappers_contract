import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, sql, type SQL } from "drizzle-orm";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { db, jobsTable } from "@workspace/db";
import {
  ListJobsQueryParams,
  CreateJobBody,
  GetJobResponse,
  UpdateJobBody,
  UpdateJobParams,
  SubmitDeliverableBody,
  SubmitDeliverableResponse,
  GetStatsResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ORACLE_URL       = process.env["ORACLE_URL"]       ?? "http://localhost:3001";
const ORACLE_API_KEY   = process.env["ORACLE_API_KEY"]   ?? "";
const API_ADMIN_KEY    = process.env["API_ADMIN_KEY"]    ?? "";
const FETCH_TIMEOUT_MS = 15_000;
const TIMESTAMP_DRIFT  = 300; // seconds

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function requireAdminKey(req: Request, res: Response): boolean {
  if (!API_ADMIN_KEY) {
    // No key set — only permitted in dev (index.ts enforces this in production)
    return true;
  }
  const provided = req.headers["x-admin-key"];
  if (provided !== API_ADMIN_KEY) {
    res.status(401).json({ error: "Unauthorized — X-Admin-Key required" });
    return false;
  }
  return true;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, ...init });
  } finally {
    clearTimeout(timer);
  }
}

/** Returns true if `str` is a valid base58-encoded 32-byte Solana public key. */
function isValidPubkey(str: string): boolean {
  try {
    return bs58.decode(str).length === 32;
  } catch {
    return false;
  }
}

/** Verify a base58 ed25519 signature over `message` by `signerPubkeyBase58`. */
function verifySignature(
  message:            string,
  signatureBase58:    string,
  signerPubkeyBase58: string
): boolean {
  try {
    const msgBytes = Buffer.from(message);
    const sigBytes = Buffer.from(bs58.decode(signatureBase58));
    const pubBytes = bs58.decode(signerPubkeyBase58);
    if (pubBytes.length !== 32) return false;
    return nacl.sign.detached.verify(msgBytes, sigBytes, pubBytes);
  } catch {
    return false;
  }
}

// ─── LIST JOBS ────────────────────────────────────────────────────────────────

router.get("/jobs", async (req, res): Promise<void> => {
  const parsed = ListJobsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { status, clientPubkey } = parsed.data;

  const conditions: SQL[] = [];
  if (status)      conditions.push(eq(jobsTable.status, status));
  if (clientPubkey) conditions.push(eq(jobsTable.clientPubkey, clientPubkey));

  let query = db.select().from(jobsTable).$dynamic();
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const jobs = await query.orderBy(jobsTable.createdAt);
  res.json(jobs);
});

// ─── CREATE JOB ───────────────────────────────────────────────────────────────
// Requires a signature proving the caller controls `clientPubkey`.
// Message format: mappers-register:{escrowPubkey}:{timestamp}

router.post("/jobs", async (req, res): Promise<void> => {
  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    jobId, escrowPubkey, clientPubkey, freelancerPubkey, oraclePubkey,
    amountLamports, description, acceptanceCriteria,
    signature, timestamp,
  } = parsed.data;

  // Validate escrowPubkey
  if (!isValidPubkey(escrowPubkey)) {
    res.status(400).json({ error: "Invalid escrowPubkey" });
    return;
  }

  // Timestamp drift
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > TIMESTAMP_DRIFT) {
    res.status(400).json({ error: `Timestamp drift too large (${Math.abs(nowSeconds - timestamp)}s)` });
    return;
  }

  // Signature verification: caller must control clientPubkey
  const message = `mappers-register:${escrowPubkey}:${timestamp}`;
  if (!verifySignature(message, signature, clientPubkey)) {
    res.status(403).json({ error: "Signature verification failed — must be signed by clientPubkey" });
    return;
  }

  try {
    const [job] = await db
      .insert(jobsTable)
      .values({
        jobId,
        escrowPubkey,
        clientPubkey,
        freelancerPubkey,
        oraclePubkey,
        amountLamports,
        status:             "pending",
        description:        description ?? null,
        acceptanceCriteria: acceptanceCriteria ? JSON.stringify(acceptanceCriteria) : null,
      })
      .returning();

    req.log.info({ jobId, escrowPubkey }, "Job registered");
    res.status(201).json(GetJobResponse.parse(job));
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      // Unique constraint violation — escrow already registered
      res.status(409).json({ error: "A job with this escrow pubkey already exists" });
      return;
    }
    throw err;
  }
});

// ─── GET JOB ─────────────────────────────────────────────────────────────────

router.get("/jobs/:escrowPubkey", async (req, res): Promise<void> => {
  const escrowPubkey = req.params.escrowPubkey;

  if (!isValidPubkey(escrowPubkey)) {
    res.status(400).json({ error: "Invalid escrowPubkey" });
    return;
  }

  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.escrowPubkey, escrowPubkey));

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json(GetJobResponse.parse(job));
});

// ─── UPDATE JOB ───────────────────────────────────────────────────────────────
// Gated behind X-Admin-Key to prevent unauthenticated state forgery.

router.patch("/jobs/:escrowPubkey", async (req, res): Promise<void> => {
  if (!requireAdminKey(req, res)) return;

  const escrowPubkey = req.params.escrowPubkey;

  if (!isValidPubkey(escrowPubkey)) {
    res.status(400).json({ error: "Invalid escrowPubkey" });
    return;
  }

  const parsedParams = UpdateJobParams.safeParse({ jobId: escrowPubkey });
  if (!parsedParams.success) {
    res.status(400).json({ error: parsedParams.error.message });
    return;
  }

  const parsedBody = UpdateJobBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsedBody.data.status      !== undefined) updates["status"]      = parsedBody.data.status;
  if (parsedBody.data.txSig       !== undefined) updates["txSig"]       = parsedBody.data.txSig;
  if (parsedBody.data.description !== undefined) updates["description"] = parsedBody.data.description;

  const [job] = await db
    .update(jobsTable)
    .set(updates)
    .where(eq(jobsTable.escrowPubkey, escrowPubkey))
    .returning();

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json(GetJobResponse.parse(job));
});

// ─── SUBMIT DELIVERABLE ───────────────────────────────────────────────────────

router.post("/jobs/:escrowPubkey/submit", async (req, res): Promise<void> => {
  const escrowPubkey = req.params.escrowPubkey;

  if (!isValidPubkey(escrowPubkey)) {
    res.status(400).json({ error: "Invalid escrowPubkey" });
    return;
  }

  const parsed = SubmitDeliverableBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let oracleResult: unknown;
  try {
    const oracleRes = await fetchWithTimeout(`${ORACLE_URL}/submit`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ORACLE_API_KEY ? { "x-api-key": ORACLE_API_KEY } : {}),
      },
      body: JSON.stringify({ escrowPubkey, ...parsed.data }),
    });
    oracleResult = await oracleRes.json();
  } catch (err) {
    req.log.warn({ err, escrowPubkey }, "Oracle unreachable — returning 503");
    const stub = SubmitDeliverableResponse.parse({
      success:  false,
      jobId:    escrowPubkey,
      outcome:  null,
      txSig:    null,
      error:    "Oracle is not reachable. Ensure the oracle middleware is running.",
    });
    res.status(503).json(stub);
    return;
  }

  const result = SubmitDeliverableResponse.safeParse(oracleResult);
  if (!result.success) {
    res.status(500).json({ error: "Unexpected oracle response shape" });
    return;
  }

  if (result.data.outcome === "RELEASE") {
    await db.update(jobsTable)
      .set({ status: "completed", txSig: result.data.txSig ?? null, updatedAt: new Date() })
      .where(eq(jobsTable.escrowPubkey, escrowPubkey));
  } else if (result.data.outcome === "REFUND") {
    await db.update(jobsTable)
      .set({ status: "cancelled", txSig: result.data.txSig ?? null, updatedAt: new Date() })
      .where(eq(jobsTable.escrowPubkey, escrowPubkey));
  }

  req.log.info({ escrowPubkey, outcome: result.data.outcome }, "Deliverable submitted");
  res.json(result.data);
});

// ─── STATS ────────────────────────────────────────────────────────────────────

router.get("/stats", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      status:        jobsTable.status,
      count:         sql<number>`cast(count(*) as int)`,
      totalLamports: sql<string>`coalesce(sum(cast(${jobsTable.amountLamports} as bigint))::text, '0')`,
    })
    .from(jobsTable)
    .groupBy(jobsTable.status);

  let total = 0, pending = 0, completed = 0, cancelled = 0;
  let pendingLamports = BigInt(0);

  for (const row of rows) {
    total += row.count;
    if (row.status === "pending") {
      pending = row.count;
      pendingLamports = BigInt(row.totalLamports ?? "0");
    } else if (row.status === "completed") {
      completed = row.count;
    } else if (row.status === "cancelled") {
      cancelled = row.count;
    }
  }

  res.json(GetStatsResponse.parse({ total, pending, completed, cancelled, totalEscrowedLamports: pendingLamports.toString() }));
});

// ─── ORACLE HEALTH PROXY ──────────────────────────────────────────────────────

router.get("/oracle/health", async (_req, res): Promise<void> => {
  try {
    const oracleRes = await fetchWithTimeout(`${ORACLE_URL}/health`, {
      headers: ORACLE_API_KEY ? { "x-api-key": ORACLE_API_KEY } : {},
    });
    const body = await oracleRes.json();
    res.json(body);
  } catch (err) {
    logger.warn({ err }, "Oracle health check failed");
    res.status(503).json({ status: "unreachable", pendingJobs: 0, timestamp: new Date().toISOString() });
  }
});

export default router;
