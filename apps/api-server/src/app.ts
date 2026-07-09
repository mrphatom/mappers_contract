import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id:     req.id,
          method: req.method,
          url:    req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// ─── CORS — explicit origin allowlist ────────────────────────────────────────
// Set CORS_ALLOWED_ORIGINS to a comma-separated list of allowed origins.
// Falls back to no-cors in development when the var is absent.
const rawOrigins = process.env["CORS_ALLOWED_ORIGINS"];
const allowedOrigins = rawOrigins
  ? rawOrigins.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

app.use(
  cors(
    allowedOrigins.length > 0
      ? {
          origin:      allowedOrigins,
          credentials: true,
        }
      : undefined // open in dev if env var not set
  ),
);

// ─── RATE LIMITING ───────────────────────────────────────────────────────────
app.use(
  rateLimit({
    windowMs: 60_000,       // 1 minute window
    max:      100,          // 100 requests per window per IP
    standardHeaders: true,
    legacyHeaders:   false,
    message: { error: "Too many requests — please slow down" },
  }),
);

// ─── BODY PARSING ────────────────────────────────────────────────────────────
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.use("/api", router);

// ─── GLOBAL ERROR HANDLER ────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
