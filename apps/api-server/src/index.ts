import app from "./app";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Fail-closed: refuse to start without an admin key in non-development mode.
// This prevents unauthenticated PATCH calls from forging terminal job states.
const isDev     = process.env["NODE_ENV"] === "development";
const adminKey  = process.env["API_ADMIN_KEY"];
const oracleKey = process.env["ORACLE_API_KEY"];

if (!isDev && !adminKey) {
  logger.fatal("API_ADMIN_KEY must be set when NODE_ENV is not 'development'. Refusing to start.");
  process.exit(1);
}

if (!isDev && !oracleKey) {
  logger.fatal("ORACLE_API_KEY must be set when NODE_ENV is not 'development'. Refusing to start.");
  process.exit(1);
}

const server = app
  .listen(port, () => {
    logger.info({ port }, "Server listening");
  })
  .on("error", (err: Error) => {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  });

// ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────────

function shutdown(signal: string): void {
  logger.info({ signal }, "Shutdown signal received — draining connections");
  server.close(() => {
    pool.end().then(() => {
      logger.info("DB pool closed. Goodbye.");
      process.exit(0);
    }).catch((err: Error) => {
      logger.error({ err }, "Error closing DB pool");
      process.exit(1);
    });
  });

  // Force-kill after 10 s if graceful close hangs
  setTimeout(() => {
    logger.warn("Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
