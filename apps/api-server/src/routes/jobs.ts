import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, sql, type SQL } from "drizzle-orm";
import { db, jobsTable } from "@workspace/db";
import {
  ListJobsQueryParams,
  CreateJobBody,
  GetJobParams,
  GetJobResponse,
  UpdateJobParams,
  UpdateJobBody,
  SubmitDeliverableParams,
  SubmitDeliverableBody,
  SubmitDeliverableResponse,
  GetStatsResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ORACLE_URL = process.env["ORACLE_URL"] ?? "http://localhost:3001";

// ─── LIST JOBS ────────────────────────────────────────────────────────────────

router.get("/jobs", async (req, res): Promise<void> => {
  const parsed = ListJobsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { status, clientPubkey } = parsed.data;

  const conditions: SQL[] = [];
  if (status) conditions.push(eq(jobsTable.status, status));
  if (clientPubkey) conditions.push(eq(jobsTable.clientPubkey, clientPubkey));

  let query = db.select().from(jobsTable).$dynamic();
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const jobs = await query.orderBy(jobsTable.createdAt);
  res.json(jobs);
});

// ─── CREATE JOB ───────────────────────────────────────────────────────────────

router.post("/jobs", async (req, res): Promise<void> => {
  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { jobId, clientPubkey, freelancerPubkey, oraclePubkey, amountLamports, description, acceptanceCriteria } = parsed.data;

  const [job] = await db
    .insert(jobsTable)
    .values({
      jobId,
      clientPubkey,
      freelancerPubkey,
      oraclePubkey,
      amountLamports,
      status: "pending",
      description: description ?? null,
      acceptanceCriteria: acceptanceCriteria ? JSON.stringify(acceptanceCriteria) : null,
    })
    .returning();

  req.log.info({ jobId }, "Job registered");
  res.status(201).json(GetJobResponse.parse(job));
});

// ─── GET JOB ─────────────────────────────────────────────────────────────────

router.get("/jobs/:jobId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const params = GetJobParams.safeParse({ jobId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.jobId, params.data.jobId));

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json(GetJobResponse.parse(job));
});

// ─── UPDATE JOB ───────────────────────────────────────────────────────────────

router.patch("/jobs/:jobId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const params = UpdateJobParams.safeParse({ jobId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.status)      updates["status"]  = parsed.data.status;
  if (parsed.data.txSig)       updates["txSig"]   = parsed.data.txSig;
  if (parsed.data.description) updates["description"] = parsed.data.description;

  const [job] = await db
    .update(jobsTable)
    .set(updates)
    .where(eq(jobsTable.jobId, params.data.jobId))
    .returning();

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json(GetJobResponse.parse(job));
});

// ─── SUBMIT DELIVERABLE ───────────────────────────────────────────────────────

router.post("/jobs/:jobId/submit", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const params = SubmitDeliverableParams.safeParse({ jobId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SubmitDeliverableBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { jobId } = params.data;

  let oracleResult: unknown;
  try {
    const oracleRes = await fetch(`${ORACLE_URL}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, ...parsed.data }),
    });
    oracleResult = await oracleRes.json();
  } catch (err) {
    req.log.warn({ err, jobId }, "Oracle unreachable — returning stub escalation");
    const stub = SubmitDeliverableResponse.parse({
      success: false,
      jobId,
      outcome: null,
      txSig: null,
      error: "Oracle is not reachable. Ensure the oracle middleware is running with valid API keys.",
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
    await db.update(jobsTable).set({ status: "completed", txSig: result.data.txSig ?? null, updatedAt: new Date() }).where(eq(jobsTable.jobId, jobId));
  } else if (result.data.outcome === "REFUND") {
    await db.update(jobsTable).set({ status: "cancelled", txSig: result.data.txSig ?? null, updatedAt: new Date() }).where(eq(jobsTable.jobId, jobId));
  }

  req.log.info({ jobId, outcome: result.data.outcome }, "Deliverable submitted");
  res.json(result.data);
});

// ─── STATS ────────────────────────────────────────────────────────────────────

router.get("/stats", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      status: jobsTable.status,
      count:  sql<number>`cast(count(*) as int)`,
      totalLamports: sql<string>`coalesce(sum(cast(${jobsTable.amountLamports} as bigint))::text, '0')`,
    })
    .from(jobsTable)
    .groupBy(jobsTable.status);

  let total = 0;
  let pending = 0;
  let completed = 0;
  let cancelled = 0;
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

  res.json(GetStatsResponse.parse({
    total,
    pending,
    completed,
    cancelled,
    totalEscrowedLamports: pendingLamports.toString(),
  }));
});

// ─── ORACLE HEALTH PROXY ──────────────────────────────────────────────────────

router.get("/oracle/health", async (_req, res): Promise<void> => {
  try {
    const oracleRes = await fetch(`${ORACLE_URL}/health`);
    const body = await oracleRes.json();
    res.json(body);
  } catch (err) {
    logger.warn({ err }, "Oracle health check failed");
    res.status(503).json({ status: "unreachable", pendingJobs: 0, timestamp: new Date().toISOString() });
  }
});

export default router;
