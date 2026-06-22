import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import request from "supertest";
import express, { Request, Response, NextFunction } from "express";
import { store } from "../store";
import { GigEscrow, StoredJob, SubmissionArtifact, ConsensusResult } from "../types";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function makeEscrow(overrides: Partial<GigEscrow> = {}): GigEscrow {
  return {
    client: PublicKey.default,
    freelancer: PublicKey.default,
    oracle: PublicKey.default,
    amount: new BN(2_000_000_000),
    jobId: "http-test-001",
    status: { pending: {} },
    escrowBump: 255,
    vaultBump: 254,
    ...overrides,
  };
}

// ─── BUILD A MINIMAL EXPRESS APP ──────────────────────────────────────────────
// We recreate the route handlers from index.ts without the bootstrap/sentry/listener
// dependencies. This tests the HTTP layer in isolation.

function buildTestApp(
  mockRunConsensus?: (job: StoredJob, artifact: SubmissionArtifact) => Promise<ConsensusResult>,
  mockReleasePayment?: (job: StoredJob) => Promise<string>,
  mockCancelJob?: (job: StoredJob) => Promise<string>
) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      pendingJobs: store.size(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/jobs/:jobId", (req: Request, res: Response) => {
    const { jobId } = req.params;
    const job = store.get(jobId);

    if (!job) {
      res.status(404).json({ error: "Job not found in oracle store" });
      return;
    }

    res.json({
      jobId,
      escrowPubkey: job.escrowPubkey.toBase58(),
      client: job.escrow.client.toBase58(),
      freelancer: job.escrow.freelancer.toBase58(),
      amount: job.escrow.amount.toString(),
      status: job.escrow.status,
      detectedAt: job.detectedAt,
    });
  });

  app.post("/submit", async (req: Request, res: Response) => {
    const body = req.body;

    if (
      !body.jobId ||
      !body.description ||
      !Array.isArray(body.acceptanceCriteria) ||
      body.acceptanceCriteria.length === 0 ||
      !body.deliverable ||
      !body.deliverableType
    ) {
      res.status(400).json({
        success: false,
        jobId: body.jobId ?? "",
        error: "Missing required fields: jobId, description, acceptanceCriteria, deliverable, deliverableType",
      });
      return;
    }

    const job = store.get(body.jobId);

    if (!job) {
      res.status(404).json({
        success: false,
        jobId: body.jobId,
        error: "Job not found. Either the job does not exist, has already been resolved, or the oracle has not yet detected the on-chain event. If just initialized, wait a few seconds and retry.",
      });
      return;
    }

    if (!("pending" in job.escrow.status)) {
      res.status(409).json({
        success: false,
        jobId: body.jobId,
        error: "Job is no longer in Pending state. It has already been resolved.",
      });
      return;
    }

    const artifact: SubmissionArtifact = {
      jobId: body.jobId,
      description: body.description,
      acceptanceCriteria: body.acceptanceCriteria,
      deliverable: body.deliverable,
      deliverableType: body.deliverableType,
      submittedAt: Date.now(),
    };

    try {
      const result = await mockRunConsensus!(job, artifact);
      let txSig: string | undefined;

      if (result.outcome === "RELEASE") {
        txSig = await mockReleasePayment!(job);
        store.remove(body.jobId);
      } else if (result.outcome === "REFUND") {
        txSig = await mockCancelJob!(job);
        store.remove(body.jobId);
      }

      res.json({
        success: true,
        jobId: body.jobId,
        outcome: result.outcome,
        txSig,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        success: false,
        jobId: body.jobId,
        error: `Internal oracle error: ${message}`,
      });
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

// ─── TEST SUITE ───────────────────────────────────────────────────────────────

describe("HTTP endpoints", () => {
  beforeEach(() => {
    // Clear the store
    for (const job of store.allPending()) {
      store.remove(job.escrow.jobId);
    }
  });

  // ── /health ───────────────────────────────────────────────────────────────

  describe("GET /health", () => {
    it("returns 200 with status ok and pending job count", async () => {
      const app = buildTestApp();

      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.pendingJobs).toBe(0);
      expect(res.body.timestamp).toBeDefined();
    });

    it("reflects pending job count", async () => {
      store.upsert(
        "health-job-1",
        PublicKey.default,
        makeEscrow({ jobId: "health-job-1" })
      );

      const app = buildTestApp();
      const res = await request(app).get("/health");

      expect(res.body.pendingJobs).toBe(1);
      store.remove("health-job-1");
    });
  });

  // ── /jobs/:jobId ──────────────────────────────────────────────────────────

  describe("GET /jobs/:jobId", () => {
    it("returns 404 for unknown job", async () => {
      const app = buildTestApp();
      const res = await request(app).get("/jobs/unknown-id");

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("Job not found");
    });

    it("returns job details for existing job", async () => {
      const escrow = makeEscrow({ jobId: "job-detail-1" });
      store.upsert("job-detail-1", PublicKey.default, escrow);

      const app = buildTestApp();
      const res = await request(app).get("/jobs/job-detail-1");

      expect(res.status).toBe(200);
      expect(res.body.jobId).toBe("job-detail-1");
      expect(res.body.escrowPubkey).toBe(PublicKey.default.toBase58());
      expect(res.body.amount).toBe("2000000000");
      expect(res.body.status).toEqual({ pending: {} });

      store.remove("job-detail-1");
    });
  });

  // ── POST /submit ──────────────────────────────────────────────────────────

  describe("POST /submit", () => {
    it("returns 400 when required fields are missing", async () => {
      const app = buildTestApp();
      const res = await request(app).post("/submit").send({
        jobId: "test",
        // missing other fields
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Missing required fields");
    });

    it("returns 400 when acceptanceCriteria is empty", async () => {
      const app = buildTestApp();
      const res = await request(app).post("/submit").send({
        jobId: "test",
        description: "Build something",
        acceptanceCriteria: [],
        deliverable: "https://example.com",
        deliverableType: "url",
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("returns 404 when job is not in store", async () => {
      const app = buildTestApp();
      const res = await request(app).post("/submit").send({
        jobId: "not-in-store",
        description: "Build something",
        acceptanceCriteria: ["Responsive"],
        deliverable: "https://example.com",
        deliverableType: "url",
      });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Job not found");
    });

    it("returns 409 when job is not pending", async () => {
      store.upsert(
        "completed-job",
        PublicKey.default,
        makeEscrow({ jobId: "completed-job", status: { completed: {} } })
      );

      const app = buildTestApp();
      const res = await request(app).post("/submit").send({
        jobId: "completed-job",
        description: "Build something",
        acceptanceCriteria: ["Responsive"],
        deliverable: "https://example.com",
        deliverableType: "url",
      });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("no longer in Pending state");
      store.remove("completed-job");
    });

    it("returns RELEASE outcome and removes job from store", async () => {
      store.upsert(
        "release-me",
        PublicKey.default,
        makeEscrow({ jobId: "release-me" })
      );

      const mockConsensus = vi.fn().mockResolvedValue({
        outcome: "RELEASE",
        geminiVerdict: {
          model: "gemini",
          verdict: "APPROVED",
          confidence: 0.95,
          reasoning: "Good",
          criteriaMet: ["A"],
          criteriaFailed: [],
        },
        claudeVerdict: {
          model: "claude",
          verdict: "APPROVED",
          confidence: 0.90,
          reasoning: "Good",
          criteriaMet: ["A"],
          criteriaFailed: [],
        },
        reasoning: "Both approved",
        processedAt: Date.now(),
      });
      const mockRelease = vi.fn().mockResolvedValue("tx-sig-release-123");

      const app = buildTestApp(mockConsensus, mockRelease);
      const res = await request(app).post("/submit").send({
        jobId: "release-me",
        description: "Build something",
        acceptanceCriteria: ["Responsive"],
        deliverable: "https://example.com",
        deliverableType: "url",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.outcome).toBe("RELEASE");
      expect(res.body.txSig).toBe("tx-sig-release-123");
      expect(store.get("release-me")).toBeUndefined();
    });

    it("returns REFUND outcome and removes job from store", async () => {
      store.upsert(
        "refund-me",
        PublicKey.default,
        makeEscrow({ jobId: "refund-me" })
      );

      const mockConsensus = vi.fn().mockResolvedValue({
        outcome: "REFUND",
        geminiVerdict: {
          model: "gemini",
          verdict: "REJECTED",
          confidence: 0.85,
          reasoning: "Bad",
          criteriaMet: [],
          criteriaFailed: ["A"],
        },
        claudeVerdict: {
          model: "claude",
          verdict: "REJECTED",
          confidence: 0.80,
          reasoning: "Bad",
          criteriaMet: [],
          criteriaFailed: ["A"],
        },
        reasoning: "Both rejected",
        processedAt: Date.now(),
      });
      const mockCancel = vi.fn().mockResolvedValue("tx-sig-cancel-456");

      const app = buildTestApp(mockConsensus, undefined, mockCancel);
      const res = await request(app).post("/submit").send({
        jobId: "refund-me",
        description: "Build something",
        acceptanceCriteria: ["Responsive"],
        deliverable: "https://example.com",
        deliverableType: "url",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.outcome).toBe("REFUND");
      expect(res.body.txSig).toBe("tx-sig-cancel-456");
      expect(store.get("refund-me")).toBeUndefined();
    });

    it("returns ESCALATE outcome without on-chain action", async () => {
      store.upsert(
        "escalate-me",
        PublicKey.default,
        makeEscrow({ jobId: "escalate-me" })
      );

      const mockConsensus = vi.fn().mockResolvedValue({
        outcome: "ESCALATE",
        geminiVerdict: {
          model: "gemini",
          verdict: "APPROVED",
          confidence: 0.95,
          reasoning: "Good",
          criteriaMet: ["A"],
          criteriaFailed: [],
        },
        claudeVerdict: {
          model: "claude",
          verdict: "REJECTED",
          confidence: 0.85,
          reasoning: "Bad",
          criteriaMet: [],
          criteriaFailed: ["A"],
        },
        reasoning: "Divergent",
        processedAt: Date.now(),
      });

      const app = buildTestApp(mockConsensus);
      const res = await request(app).post("/submit").send({
        jobId: "escalate-me",
        description: "Build something",
        acceptanceCriteria: ["Responsive"],
        deliverable: "https://example.com",
        deliverableType: "url",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.outcome).toBe("ESCALATE");
      expect(res.body.txSig).toBeUndefined();
      // Job should still be in store (not removed on ESCALATE)
      expect(store.get("escalate-me")).toBeDefined();
      store.remove("escalate-me");
    });

    it("returns 500 when consensus throws an error", async () => {
      store.upsert(
        "error-job",
        PublicKey.default,
        makeEscrow({ jobId: "error-job" })
      );

      const mockConsensus = vi.fn().mockRejectedValue(new Error("AI service unavailable"));

      const app = buildTestApp(mockConsensus);
      const res = await request(app).post("/submit").send({
        jobId: "error-job",
        description: "Build something",
        acceptanceCriteria: ["Responsive"],
        deliverable: "https://example.com",
        deliverableType: "url",
      });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("AI service unavailable");
      store.remove("error-job");
    });

    it("returns 400 when jobId is missing from body", async () => {
      const app = buildTestApp();
      const res = await request(app).post("/submit").send({
        description: "Build something",
        acceptanceCriteria: ["Responsive"],
        deliverable: "https://example.com",
        deliverableType: "url",
      });

      expect(res.status).toBe(400);
      expect(res.body.jobId).toBe("");
    });
  });
});
