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
    client:     PublicKey.default,
    freelancer: PublicKey.default,
    oracle:     PublicKey.default,
    amount:     new BN(2_000_000_000),
    jobId:      "http-test-001",
    status:     { pending: {} },
    escrowBump: 255,
    vaultBump:  254,
    deadline:   new BN(Math.floor(Date.now() / 1000) + 7 * 86_400),
    ...overrides,
  };
}

// ─── MINIMAL TEST APP ─────────────────────────────────────────────────────────
// We reconstruct the route shape of oracle/src/index.ts without the bootstrap /
// sentry / gRPC listener dependencies, so we can exercise the HTTP layer in
// isolation.  The test app is deliberately simplified — it does NOT enforce
// signature verification so we can test other branches easily.

function buildTestApp(
  mockRunConsensus?: (job: StoredJob, artifact: SubmissionArtifact) => Promise<ConsensusResult>,
  mockReleasePayment?: (job: StoredJob) => Promise<string>,
  mockCancelJob?: (job: StoredJob) => Promise<string>
) {
  const app = express();
  app.use(express.json());

  // Health
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", pendingJobs: store.size(), timestamp: new Date().toISOString() });
  });

  // Get job by escrow pubkey
  app.get("/jobs/:escrowPubkey", (req: Request, res: Response) => {
    const { escrowPubkey } = req.params;
    const job = store.get(escrowPubkey);
    if (!job) {
      res.status(404).json({ error: "Job not found in oracle store" });
      return;
    }
    res.json({
      escrowPubkey: job.escrowPubkey.toBase58(),
      jobId:        job.escrow.jobId,
      client:       job.escrow.client.toBase58(),
      freelancer:   job.escrow.freelancer.toBase58(),
      amount:       job.escrow.amount.toString(),
      status:       job.escrow.status,
      detectedAt:   job.detectedAt,
    });
  });

  // Submit — signature verification is skipped in the test app (it's not the
  // concern of these unit tests; real sig-verify is tested separately).
  app.post("/submit", async (req: Request, res: Response) => {
    const body = req.body as {
      escrowPubkey?: string;
      description?: string;
      acceptanceCriteria?: string[];
      deliverable?: string;
      deliverableType?: string;
    };

    if (
      !body.escrowPubkey ||
      !body.description ||
      !Array.isArray(body.acceptanceCriteria) ||
      body.acceptanceCriteria.length === 0 ||
      !body.deliverable ||
      !body.deliverableType
    ) {
      res.status(400).json({
        success:      false,
        escrowPubkey: body.escrowPubkey ?? "",
        error:        "Missing required fields: escrowPubkey, description, acceptanceCriteria, deliverable, deliverableType",
      });
      return;
    }

    const escrowKey = body.escrowPubkey;
    const job = store.get(escrowKey);
    if (!job) {
      res.status(404).json({
        success:      false,
        escrowPubkey: escrowKey,
        error:        "Job not found",
      });
      return;
    }

    if (!("pending" in job.escrow.status)) {
      res.status(409).json({
        success:      false,
        escrowPubkey: escrowKey,
        error:        "Job is no longer Pending",
      });
      return;
    }

    if (!store.lock(escrowKey)) {
      res.status(409).json({
        success:      false,
        escrowPubkey: escrowKey,
        error:        "Verification already in progress",
      });
      return;
    }

    const artifact: SubmissionArtifact = {
      jobId:              job.escrow.jobId,
      description:        body.description,
      acceptanceCriteria: body.acceptanceCriteria,
      deliverable:        body.deliverable,
      deliverableType:    body.deliverableType as SubmissionArtifact["deliverableType"],
      submittedAt:        Date.now(),
    };

    try {
      const consensus = mockRunConsensus
        ? await mockRunConsensus(job, artifact)
        : { outcome: "ESCALATE", geminiVerdict: {} as never, claudeVerdict: {} as never, reasoning: "", processedAt: Date.now() };

      const { outcome } = consensus;
      let txSig: string | undefined;

      if (outcome === "RELEASE") {
        txSig = mockReleasePayment ? await mockReleasePayment(job) : "fake-tx";
        store.remove(escrowKey);
      } else if (outcome === "REFUND") {
        txSig = mockCancelJob ? await mockCancelJob(job) : "fake-tx";
        store.remove(escrowKey);
      }

      res.json({ success: true, escrowPubkey: escrowKey, outcome, txSig });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, escrowPubkey: escrowKey, error: message });
    } finally {
      store.unlock(escrowKey);
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: err.message });
  });

  return app;
}

// ─── TEST SUITE ───────────────────────────────────────────────────────────────

describe("Oracle HTTP server", () => {
  const escrowPubkey = PublicKey.default;
  const escrowKey    = escrowPubkey.toBase58();

  beforeEach(() => {
    // Drain store between tests
    for (const job of store.allPending()) {
      store.remove(job.escrowPubkey.toBase58());
    }
  });

  // ── GET /health ────────────────────────────────────────────────────────────

  describe("GET /health", () => {
    it("returns ok with pendingJobs count", async () => {
      const app = buildTestApp();
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(typeof res.body.pendingJobs).toBe("number");
    });
  });

  // ── GET /jobs/:escrowPubkey ────────────────────────────────────────────────

  describe("GET /jobs/:escrowPubkey", () => {
    it("returns 404 when job is not in store", async () => {
      const app = buildTestApp();
      const res = await request(app).get(`/jobs/${escrowKey}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toContain("not found");
    });

    it("returns job data when present", async () => {
      const escrow = makeEscrow({ jobId: "get-job-001" });
      store.upsert(escrowKey, escrowPubkey, escrow);

      const app = buildTestApp();
      const res = await request(app).get(`/jobs/${escrowKey}`);
      expect(res.status).toBe(200);
      expect(res.body.escrowPubkey).toBe(escrowKey);
      expect(res.body.jobId).toBe("get-job-001");

      store.remove(escrowKey);
    });
  });

  // ── POST /submit ───────────────────────────────────────────────────────────

  describe("POST /submit", () => {
    it("returns 404 when job is not in store", async () => {
      const app = buildTestApp();
      const res = await request(app).post("/submit").send({
        escrowPubkey:       escrowKey,
        description:        "Build something",
        acceptanceCriteria: ["Works"],
        deliverable:        "https://example.com",
        deliverableType:    "url",
      });
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("returns 400 when required fields are missing", async () => {
      const app = buildTestApp();
      const res = await request(app).post("/submit").send({
        description: "Build something",
      });
      expect(res.status).toBe(400);
      expect(res.body.escrowPubkey).toBe("");
    });

    it("processes RELEASE and removes job from store", async () => {
      const escrow = makeEscrow({ jobId: "release-me" });
      store.upsert(escrowKey, escrowPubkey, escrow);

      const mockConsensus = vi.fn().mockResolvedValue({
        outcome:       "RELEASE",
        geminiVerdict: { model: "gemini", verdict: "APPROVED", confidence: 0.95, reasoning: "Good", criteriaMet: ["A"], criteriaFailed: [] },
        claudeVerdict: { model: "claude", verdict: "APPROVED", confidence: 0.90, reasoning: "Good", criteriaMet: ["A"], criteriaFailed: [] },
        reasoning:     "Both approved",
        processedAt:   Date.now(),
      });
      const mockRelease = vi.fn().mockResolvedValue("tx-sig-release-123");

      const app = buildTestApp(mockConsensus, mockRelease);
      const res = await request(app).post("/submit").send({
        escrowPubkey:       escrowKey,
        description:        "Build something",
        acceptanceCriteria: ["Responsive"],
        deliverable:        "https://example.com",
        deliverableType:    "url",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.outcome).toBe("RELEASE");
      expect(res.body.txSig).toBe("tx-sig-release-123");
      expect(store.get(escrowKey)).toBeUndefined();
    });

    it("processes REFUND and removes job from store", async () => {
      const escrow = makeEscrow({ jobId: "refund-me" });
      store.upsert(escrowKey, escrowPubkey, escrow);

      const mockConsensus = vi.fn().mockResolvedValue({
        outcome:       "REFUND",
        geminiVerdict: { model: "gemini", verdict: "REJECTED", confidence: 0.85, reasoning: "Bad", criteriaMet: [], criteriaFailed: ["A"] },
        claudeVerdict: { model: "claude", verdict: "REJECTED", confidence: 0.80, reasoning: "Bad", criteriaMet: [], criteriaFailed: ["A"] },
        reasoning:     "Both rejected",
        processedAt:   Date.now(),
      });
      const mockCancel = vi.fn().mockResolvedValue("tx-sig-cancel-456");

      const app = buildTestApp(mockConsensus, undefined, mockCancel);
      const res = await request(app).post("/submit").send({
        escrowPubkey:       escrowKey,
        description:        "Build something",
        acceptanceCriteria: ["Responsive"],
        deliverable:        "https://example.com",
        deliverableType:    "url",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.outcome).toBe("REFUND");
      expect(res.body.txSig).toBe("tx-sig-cancel-456");
      expect(store.get(escrowKey)).toBeUndefined();
    });

    it("returns ESCALATE without removing job from store", async () => {
      const escrow = makeEscrow({ jobId: "escalate-me" });
      store.upsert(escrowKey, escrowPubkey, escrow);

      const mockConsensus = vi.fn().mockResolvedValue({
        outcome:       "ESCALATE",
        geminiVerdict: { model: "gemini", verdict: "APPROVED", confidence: 0.95, reasoning: "Good", criteriaMet: ["A"], criteriaFailed: [] },
        claudeVerdict: { model: "claude", verdict: "REJECTED", confidence: 0.85, reasoning: "Bad", criteriaMet: [], criteriaFailed: ["A"] },
        reasoning:     "Divergent",
        processedAt:   Date.now(),
      });

      const app = buildTestApp(mockConsensus);
      const res = await request(app).post("/submit").send({
        escrowPubkey:       escrowKey,
        description:        "Build something",
        acceptanceCriteria: ["Responsive"],
        deliverable:        "https://example.com",
        deliverableType:    "url",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.outcome).toBe("ESCALATE");
      expect(res.body.txSig).toBeUndefined();
      expect(store.get(escrowKey)).toBeDefined(); // not removed on ESCALATE

      store.remove(escrowKey);
    });

    it("returns 500 when consensus throws", async () => {
      const escrow = makeEscrow({ jobId: "error-job" });
      store.upsert(escrowKey, escrowPubkey, escrow);

      const mockConsensus = vi.fn().mockRejectedValue(new Error("AI service unavailable"));

      const app = buildTestApp(mockConsensus);
      const res = await request(app).post("/submit").send({
        escrowPubkey:       escrowKey,
        description:        "Build something",
        acceptanceCriteria: ["Responsive"],
        deliverable:        "https://example.com",
        deliverableType:    "url",
      });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("AI service unavailable");

      store.remove(escrowKey);
    });

    it("returns 409 when a concurrent submission is in-flight (lock held)", async () => {
      const escrow = makeEscrow({ jobId: "locked-job" });
      store.upsert(escrowKey, escrowPubkey, escrow);
      store.lock(escrowKey); // simulate in-flight verification

      const app = buildTestApp();
      const res = await request(app).post("/submit").send({
        escrowPubkey:       escrowKey,
        description:        "Build something",
        acceptanceCriteria: ["Responsive"],
        deliverable:        "https://example.com",
        deliverableType:    "url",
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("already in progress");

      store.unlock(escrowKey);
      store.remove(escrowKey);
    });
  });
});
