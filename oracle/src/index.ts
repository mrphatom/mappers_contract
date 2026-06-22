import * as Sentry from "@sentry/node";
import express, { Request, Response, NextFunction } from "express";
import { config } from "./config";
import { store } from "./store";
import { startListener } from "./listener";
import { runConsensus } from "./verification";
import { releasePayment, cancelJob } from "./chain";
import {
  SubmitRequest,
  SubmitResponse,
  SubmissionArtifact,
  ConsensusOutcome,
} from "./types";

// ─── SENTRY INIT ─────────────────────────────────────────────────────────────

if (config.sentry.enabled) {
  Sentry.init({
    dsn:         config.sentry.dsn,
    environment: config.isDev ? "development" : "production",
    tracesSampleRate: 0.2,
  });
  console.log("[sentry] Error tracking initialized");
}

// ─── EXPRESS APP ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status:     "ok",
    pendingJobs: store.size(),
    timestamp:  new Date().toISOString(),
  });
});

// ─── GET JOB STATUS ───────────────────────────────────────────────────────────

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
    client:       job.escrow.client.toBase58(),
    freelancer:   job.escrow.freelancer.toBase58(),
    amount:       job.escrow.amount.toString(),
    status:       job.escrow.status,
    detectedAt:   job.detectedAt,
  });
});

// ─── SUBMIT DELIVERABLE ───────────────────────────────────────────────────────

app.post("/submit", async (req: Request, res: Response) => {
  const body = req.body as SubmitRequest;

  // Basic input validation
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
      jobId:   body.jobId ?? "",
      error:   "Missing required fields: jobId, description, acceptanceCriteria, deliverable, deliverableType",
    } satisfies SubmitResponse);
    return;
  }

  const job = store.get(body.jobId);

  if (!job) {
    console.warn(`[submit] Job ${body.jobId} not found in oracle store`);

    res.status(404).json({
      success: false,
      jobId:   body.jobId,
      error:   "Job not found. Either the job does not exist, has already been resolved, or the oracle has not yet detected the on-chain event. If just initialized, wait a few seconds and retry.",
    } satisfies SubmitResponse);
    return;
  }

  if (!("pending" in job.escrow.status)) {
    res.status(409).json({
      success: false,
      jobId:   body.jobId,
      error:   "Job is no longer in Pending state. It has already been resolved.",
    } satisfies SubmitResponse);
    return;
  }

  const artifact: SubmissionArtifact = {
    jobId:              body.jobId,
    description:        body.description,
    acceptanceCriteria: body.acceptanceCriteria,
    deliverable:        body.deliverable,
    deliverableType:    body.deliverableType,
    submittedAt:        Date.now(),
  };

  console.log(`[submit] Starting verification for job: ${body.jobId}`);

  let outcome: ConsensusOutcome;
  let txSig: string | undefined;

  try {
    const result = await runConsensus(job, artifact);
    outcome = result.outcome;

    console.log(`[submit] Consensus: ${outcome} | ${result.reasoning}`);

    if (outcome === "RELEASE") {
      txSig = await releasePayment(job);
      store.remove(body.jobId);
      console.log(`[submit] Payment released. tx: ${txSig}`);

    } else if (outcome === "REFUND") {
      txSig = await cancelJob(job);
      store.remove(body.jobId);
      console.log(`[submit] Job cancelled, refund issued. tx: ${txSig}`);

    } else {
      // ESCALATE — log for human review, do not execute on-chain
      console.warn(`[submit] ESCALATE: Job ${body.jobId} requires human arbitration.`);
      console.warn(`         Gemini: ${result.geminiVerdict.verdict} (${result.geminiVerdict.confidence.toFixed(2)})`);
      console.warn(`         Claude: ${result.claudeVerdict.verdict} (${result.claudeVerdict.confidence.toFixed(2)})`);

      if (config.sentry.enabled) {
        Sentry.captureMessage(`Oracle escalation: job ${body.jobId}`, {
          level: "warning",
          extra: { jobId: body.jobId, gemini: result.geminiVerdict, claude: result.claudeVerdict },
        });
      }
    }

    res.json({
      success: true,
      jobId:   body.jobId,
      outcome,
      txSig,
    } satisfies SubmitResponse);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[submit] Verification/execution error for job ${body.jobId}:`, message);

    if (config.sentry.enabled) {
      Sentry.captureException(err);
    }

    res.status(500).json({
      success: false,
      jobId:   body.jobId,
      error:   `Internal oracle error: ${message}`,
    } satisfies SubmitResponse);
  }
});

// ─── FALLBACK ERROR HANDLER ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (config.sentry.enabled) Sentry.captureException(err);
  console.error("[express] Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

// ─── BOOTSTRAP ───────────────────────────────────────────────────────────────

function bootstrap(): void {
  // 1. Start gRPC listener — detects on-chain job events
  startListener();

  // 2. Start HTTP server — receives freelancer submission triggers
  const server = app.listen(config.server.port, () => {
    console.log(`\n🟢 Mappers Oracle running`);
    console.log(`   HTTP server: http://localhost:${config.server.port}`);
    console.log(`   Program ID:  ${config.solana.programId}`);
    console.log(`   Network:     ${config.solana.rpcUrl}\n`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[oracle] Port ${config.server.port} is already in use. Exiting.`);
    } else {
      console.error(`[oracle] HTTP server error: ${err.message}`);
    }
    process.exit(1);
  });

  // 3. Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("[oracle] SIGTERM received. Shutting down gracefully.");
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("[oracle] SIGINT received. Shutting down.");
    process.exit(0);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[oracle] Unhandled rejection:", reason);
    if (config.sentry.enabled) {
      Sentry.captureException(reason);
      // Flush Sentry events before exiting
      void Sentry.flush(2000).finally(() => process.exit(1));
    } else {
      process.exit(1);
    }
  });

  process.on("uncaughtException", (err) => {
    console.error("[oracle] Uncaught exception:", err);
    if (config.sentry.enabled) {
      Sentry.captureException(err);
      void Sentry.flush(2000).finally(() => process.exit(1));
    } else {
      process.exit(1);
    }
  });
}

bootstrap();
