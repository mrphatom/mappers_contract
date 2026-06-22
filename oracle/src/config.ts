import * as dotenv from "dotenv";
dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function optional(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

function optionalNumber(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val) return fallback;
  const parsed = parseFloat(val);
  if (isNaN(parsed)) throw new Error(`${key} must be a valid number`);
  return parsed;
}

export const config = {
  solana: {
    rpcUrl:         required("SOLANA_RPC_URL"),
    programId:      required("PROGRAM_ID"),
    oraclePrivateKey: required("ORACLE_PRIVATE_KEY"),
  },
  helius: {
    grpcEndpoint: required("HELIUS_GRPC_ENDPOINT"),
    apiKey:       required("HELIUS_API_KEY"),
  },
  ai: {
    geminiApiKey:    required("GEMINI_API_KEY"),
    anthropicApiKey: required("ANTHROPIC_API_KEY"),
    geminiModel: optional("GEMINI_MODEL", "gemini-3.5-flash"),
    anthropicModel:  optional("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
    approvalThreshold:  optionalNumber("APPROVAL_CONFIDENCE_THRESHOLD", 0.80),
    rejectionThreshold: optionalNumber("REJECTION_CONFIDENCE_THRESHOLD", 0.75),
  },
  server: {
    port: (() => {
      const raw = optional("PORT", "3001");
      const parsed = parseInt(raw, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error(`PORT must be a valid port number (1-65535), got: "${raw}"`);
      }
      return parsed;
    })(),
    corsOrigins: optional("CORS_ALLOWED_ORIGINS", ""),
    rateLimitWindowMs: optionalNumber("RATE_LIMIT_WINDOW_MS", 60_000),
    rateLimitMax: optionalNumber("RATE_LIMIT_MAX_REQUESTS", 20),
    apiKey: optional("ORACLE_API_KEY", ""),
  },
  sentry: {
    dsn:     optional("SENTRY_DSN", ""),
    enabled: !!process.env.SENTRY_DSN,
  },
  isDev: optional("NODE_ENV", "development") === "development",
} as const;
