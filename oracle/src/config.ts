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
    rpcUrl:           required("SOLANA_RPC_URL"),
    programId:        required("PROGRAM_ID"),
    oraclePrivateKey: required("ORACLE_PRIVATE_KEY"),
  },
  helius: {
    grpcEndpoint: required("HELIUS_GRPC_ENDPOINT"),
    apiKey:       required("HELIUS_API_KEY"),
  },
  ai: {
    geminiApiKey:       required("GEMINI_API_KEY"),
    anthropicApiKey:    required("ANTHROPIC_API_KEY"),
    geminiModel:        optional("GEMINI_MODEL",    "gemini-2.5-flash"),
    anthropicModel:     optional("ANTHROPIC_MODEL", "claude-sonnet-4-5"),
    approvalThreshold:  optionalNumber("APPROVAL_CONFIDENCE_THRESHOLD",  0.80),
    rejectionThreshold: optionalNumber("REJECTION_CONFIDENCE_THRESHOLD", 0.75),
  },
  server: {
    port:   parseInt(optional("PORT", "3001"), 10),
    apiKey: optional("ORACLE_API_KEY", ""),
  },
  sentry: {
    dsn:     optional("SENTRY_DSN", ""),
    enabled: !!process.env.SENTRY_DSN,
  },
  // Default to production-safe behavior — verbose error leak only in dev
  isDev: optional("NODE_ENV", "production") === "development",
} as const;
