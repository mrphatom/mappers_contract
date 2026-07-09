import * as Sentry from "@sentry/node";
import express, { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { z } from "zod";
import { config } from "./config";
import { store } from "./store";
import { backfillFromChain, startListener } from "./listener";
import { runConsensus } from "./verification";
import { releasePayment, cancelJob, fetchEscrow } from "./chain";
import {
  SubmitResponse,
  SubmissionArtifact,
  ConsensusOutcome,
} from "./types";

// ─── SENTRY INIT ─────────────────────────────────────────────────────────────

if (config.sentry.enabled) {
  Sentry.init({
    dsn:              config.sentry.dsn,
    environment:      config.isDev ? "development" : "production",
    tracesSampleRate: 0.2,
  });
  console.log("[sentry] Error tracking initialized");
}

// ─── ZOD SCHEMAS ─────────────────────────────────────────────────────────────

const SubmitBodySchema = z.object({
  escrowPubkey:       z.string().min(32).max(44),
  description:        z.string().min(1).max(10_000),
  acceptanceCriteria: z.array(z.string().min(1)).min(1).max(20),
  deliverable:        z.string().min(1).max(100_000),
  deliverableType:    z.enum(["url", "ipfs", "text", "json"]),
  signature:          z.string().min(1),   // base58 ed25519
  timestamp:          z.number().int(),    // unix seconds
});

// ─── EXPRESS APP ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "100kb" }));

// ─── API KEY MIDDLEWARE ───────────────────────────────────────────────────────

function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (!config.server.apiKey) {
    // No key configured — only permitted in dev mode (bootstrap enforces this)
    next();
    return;
  }
  const provided = req.headers["x-api-key"];
  if (provided !== config.server.apiKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status:      "ok",
    pendingJobs: store.size(),
    timestamp:   new Date().toISOString(),
  });
});

// ─── GET JOB STATUS ───────────────────────────────────────────────────────────

app.get("/jobs/:escrowPubkey", requireApiKey, (req: Request, res: Response) => {
  const { escrowPubkey } = req.params;

  // Validate it looks like a base58 pubkey before looking up
  let parsedPubkey: PublicKey;
  try {
    parsedPubkey = new PublicKey(escrowPubkey);
  } catch {
    res.status(400).json({ error: "Invalid escrow pubkey — must be a valid base58 Solana public key" });
    return;
  }

  const job = store.get(parsedPubkey.toBase58());

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

// ─── SUBMIT DELIVERABLE ───────────────────────────────────────────────────────

const TIMESTAMP_DRIFT_LIMIT = 300; // seconds

app.post("/submit", requireApiKey, async (req: Request, res: Response) => {
  // 1. Schema validation
  const parsed = SubmitBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      escrowPubkey: req.body?.escrowPubkey ?? "",
      error:   `Validation error: ${parsed.error.message}`,
    } satisfies SubmitResponse);
    return;
  }

  const body = parsed.data;

  // 2. Validate escrowPubkey is a real pubkey
  let escrowKey: string;
  try {
    escrowKey = new PublicKey(body.escrowPubkey).toBase58();
  } catch {
    res.status(400).json({
      success:      false,
      escrowPubkey: body.escrowPubkey,
      error:        "Invalid escrowPubkey — must be a valid base58 Solana public key",
    } satisfies SubmitResponse);
    return;
  }

  // 3. Timestamp drift check (prevents signature replay)
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - body.timestamp) > TIMESTAMP_DRIFT_LIMIT) {
    res.status(400).json({
      success:      false,
      escrowPubkey: escrowKey,
      error:        `Timestamp drift too large (${Math.abs(nowSeconds - body.timestamp)}s > ${TIMESTAMP_DRIFT_LIMIT}s). Synchronize your clock and retry.`,
    } satisfies SubmitResponse);
    return;
  }

  // 4. Job lookup — must be in store and Pending
  const job = store.get(escrowKey);

  if (!job) {
    res.status(404).json({
      success:      false,
      escrowPubkey: escrowKey,
      error:        "Job not found. Either it doesn't exist, has been resolved, or the oracle hasn't detected it yet. Wait a few seconds and retry.",
    } satisfies SubmitResponse);
    return;
  }

  if (!("pending" in job.escrow.status)) {
    res.status(409).json({
      success:      false,
      escrowPubkey: escrowKey,
      error:        "Job is no longer in Pending state — it has already been resolved.",
    } satisfies SubmitResponse);
    return;
  }

  // 5. Freelancer signature verification
  //    Message: mappers-submit:{escrowPubkey}:{sha256Hex(deliverable)}:{timestamp}
  const deliverableHash = createHash("sha256").update(body.deliverable).digest("hex");
  const message         = `mappers-submit:${escrowKey}:${deliverableHash}:${body.timestamp}`;
  const messageBytes    = Buffer.from(message);

  let sigBytes: Buffer;
  try {
    sigBytes = Buffer.from(bs58.decode(body.signature));
  } catch {
    res.status(400).json({
      success:      false,
      escrowPubkey: escrowKey,
      error:        "Signature is not valid base58",
    } satisfies SubmitResponse);
    return;
  }

  const freelancerPubkeyBytes = job.escrow.freelancer.toBytes();
  const isValid = nacl.sign.detached.verify(messageBytes, sigBytes, freelancerPubkeyBytes);
  if (!isValid) {
    res.status(403).json({
      success:      false,
      escrowPubkey: escrowKey,
      error:        "Signature verification failed — submission must be signed by the on-chain freelancer",
    } satisfies SubmitResponse);
    return;
  }

  // 6. Per-job in-flight lock — prevent concurrent consensus runs for same escrow
  if (!store.lock(escrowKey)) {
    res.status(409).json({
      success:      false,
      escrowPubkey: escrowKey,
      error:        "A verification is already in progress for this job. Retry once it completes.",
    } satisfies SubmitResponse);
    return;
  }

  const artifact: SubmissionArtifact = {
    jobId:              job.escrow.jobId,
    description:        body.description,
    acceptanceCriteria: body.acceptanceCriteria,
    deliverable:        body.deliverable,
    deliverableType:    body.deliverableType,
    submittedAt:        Date.now(),
  };

  console.log(`[submit] Starting verification for escrow: ${escrowKey} (job: ${job.escrow.jobId})`);

  let outcome: ConsensusOutcome;
  let txSig: string | undefined;

  try {
    const result = await runConsensus(job, artifact);
    outcome = result.outcome;

    console.log(`[submit] Consensus: ${outcome} | ${result.reasoning}`);

    if (outcome === "RELEASE") {
      txSig = await releasePayment(job);
      store.remove(escrowKey);
      console.log(`[submit] Payment released. tx: ${txSig}`);

    } else if (outcome === "REFUND") {
      txSig = await cancelJob(job);
      store.remove(escrowKey);
      console.log(`[submit] Job cancelled, refund issued. tx: ${txSig}`);

    } else {
      console.warn(`[submit] ESCALATE: Job ${escrowKey} requires human arbitration.`);
      console.warn(`         Gemini: ${result.geminiVerdict.verdict} (${result.geminiVerdict.confidence.toFixed(2)})`);
      console.warn(`         Claude: ${result.claudeVerdict.verdict} (${result.claudeVerdict.confidence.toFixed(2)})`);

      if (config.sentry.enabled) {
        Sentry.captureMessage(`Oracle escalation: escrow ${escrowKey}`, {
          level: "warning",
          extra: { escrowKey, jobId: job.escrow.jobId, gemini: result.geminiVerdict, claude: result.claudeVerdict },
        });
      }
    }

    res.json({
      success:      true,
      escrowPubkey: escrowKey,
      outcome,
      txSig,
    } satisfies SubmitResponse);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[submit] Verification/execution error for escrow ${escrowKey}:`, message);

    if (config.sentry.enabled) {
      Sentry.captureException(err);
    }

    res.status(500).json({
      success:      false,
      escrowPubkey: escrowKey,
      error:        config.isDev ? `Internal oracle error: ${message}` : "Internal oracle error",
    } satisfies SubmitResponse);

  } finally {
    store.unlock(escrowKey);
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

async function bootstrap(): Promise<void> {
  // Fail-closed: refuse to start without an API key in non-development mode.
  // Booting an unauthenticated fund-release endpoint in production is unsafe.
  if (!config.isDev && !config.server.apiKey) {
    console.error(
      "[fatal] ORACLE_API_KEY must be set when NODE_ENV is not 'development'. " +
      "Refusing to start an unauthenticated fund-release endpoint."
    );
    process.exit(1);
  }

  if (config.isDev && !config.server.apiKey) {
    console.warn("[warn] ORACLE_API_KEY is not set — running unauthenticated (dev mode only)");
  }

  // 1. Backfill from chain before opening gRPC stream
  await backfillFromChain();

  // 2. Start gRPC listener — detects ongoing on-chain job events
  startListener();

  // 3. Start HTTP server
  app.listen(config.server.port, () => {
    console.log(`\n🟢 Mappers Oracle running`);
    console.log(`   HTTP server: http://localhost:${config.server.port}`);
    console.log(`   Program ID:  ${config.solana.programId}`);
    console.log(`   Network:     ${config.solana.rpcUrl}`);
    console.log(`   Auth:        ${config.server.apiKey ? "ENABLED" : "DISABLED (dev)"}\n`);
  });

  // 4. Graceful shutdown
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
    if (config.sentry.enabled) Sentry.captureException(reason);
  });
}

bootstrap().catch((err) => {
  console.error("[oracle] Bootstrap failed:", err);
  process.exit(1);
});
