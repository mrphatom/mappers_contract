import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We test the config helper functions by re-importing the module with
// controlled environment variables. The module calls dotenv.config() at import
// time, so we mock dotenv to be a no-op.

vi.mock("dotenv", () => ({
  config: vi.fn(),
}));

describe("config module", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  function setRequiredEnv(): void {
    process.env.SOLANA_RPC_URL = "http://localhost:8899";
    process.env.PROGRAM_ID = "52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu";
    process.env.ORACLE_PRIVATE_KEY = "fake-key";
    process.env.HELIUS_GRPC_ENDPOINT = "http://fake-grpc";
    process.env.HELIUS_API_KEY = "fake-helius";
    process.env.GEMINI_API_KEY = "fake-gemini";
    process.env.ANTHROPIC_API_KEY = "fake-anthropic";
  }

  // ── required() ──────────────────────────────────────────────────────────

  describe("required()", () => {
    it("throws when a required env var is missing", async () => {
      // Missing SOLANA_RPC_URL
      process.env.PROGRAM_ID = "test";
      process.env.ORACLE_PRIVATE_KEY = "test";
      process.env.HELIUS_GRPC_ENDPOINT = "test";
      process.env.HELIUS_API_KEY = "test";
      process.env.GEMINI_API_KEY = "test";
      process.env.ANTHROPIC_API_KEY = "test";

      await expect(import("../config")).rejects.toThrow(
        "Missing required environment variable: SOLANA_RPC_URL"
      );
    });

    it("throws when a required env var is empty string", async () => {
      setRequiredEnv();
      process.env.SOLANA_RPC_URL = "";

      await expect(import("../config")).rejects.toThrow(
        "Missing required environment variable: SOLANA_RPC_URL"
      );
    });

    it("throws when a required env var is whitespace only", async () => {
      setRequiredEnv();
      process.env.SOLANA_RPC_URL = "   ";

      await expect(import("../config")).rejects.toThrow(
        "Missing required environment variable: SOLANA_RPC_URL"
      );
    });

    it("trims whitespace from required env vars", async () => {
      setRequiredEnv();
      process.env.SOLANA_RPC_URL = "  http://trimmed:8899  ";

      const { config } = await import("../config");
      expect(config.solana.rpcUrl).toBe("http://trimmed:8899");
    });
  });

  // ── optional() ──────────────────────────────────────────────────────────

  describe("optional()", () => {
    it("uses fallback when env var is not set", async () => {
      setRequiredEnv();
      delete process.env.GEMINI_MODEL;

      const { config } = await import("../config");
      expect(config.ai.geminiModel).toBe("gemini-3.5-flash");
    });

    it("uses env value when set", async () => {
      setRequiredEnv();
      process.env.GEMINI_MODEL = "gemini-pro-custom";

      const { config } = await import("../config");
      expect(config.ai.geminiModel).toBe("gemini-pro-custom");
    });

    it("uses fallback for anthropicModel when not set", async () => {
      setRequiredEnv();
      delete process.env.ANTHROPIC_MODEL;

      const { config } = await import("../config");
      expect(config.ai.anthropicModel).toBe("claude-sonnet-4-6");
    });
  });

  // ── optionalNumber() ────────────────────────────────────────────────────

  describe("optionalNumber()", () => {
    it("uses default 0.80 for approvalThreshold when not set", async () => {
      setRequiredEnv();
      delete process.env.APPROVAL_CONFIDENCE_THRESHOLD;

      const { config } = await import("../config");
      expect(config.ai.approvalThreshold).toBe(0.80);
    });

    it("uses default 0.75 for rejectionThreshold when not set", async () => {
      setRequiredEnv();
      delete process.env.REJECTION_CONFIDENCE_THRESHOLD;

      const { config } = await import("../config");
      expect(config.ai.rejectionThreshold).toBe(0.75);
    });

    it("parses custom numeric threshold", async () => {
      setRequiredEnv();
      process.env.APPROVAL_CONFIDENCE_THRESHOLD = "0.90";

      const { config } = await import("../config");
      expect(config.ai.approvalThreshold).toBe(0.90);
    });

    it("throws when numeric env var is not a valid number", async () => {
      setRequiredEnv();
      process.env.APPROVAL_CONFIDENCE_THRESHOLD = "not-a-number";

      await expect(import("../config")).rejects.toThrow(
        "APPROVAL_CONFIDENCE_THRESHOLD must be a valid number"
      );
    });
  });

  // ── server.port ─────────────────────────────────────────────────────────

  describe("server.port", () => {
    it("defaults to 3001", async () => {
      setRequiredEnv();
      delete process.env.PORT;

      const { config } = await import("../config");
      expect(config.server.port).toBe(3001);
    });

    it("uses custom PORT", async () => {
      setRequiredEnv();
      process.env.PORT = "4000";

      const { config } = await import("../config");
      expect(config.server.port).toBe(4000);
    });
  });

  // ── sentry ──────────────────────────────────────────────────────────────

  describe("sentry", () => {
    it("disabled when SENTRY_DSN is not set", async () => {
      setRequiredEnv();
      delete process.env.SENTRY_DSN;

      const { config } = await import("../config");
      expect(config.sentry.enabled).toBe(false);
      expect(config.sentry.dsn).toBe("");
    });

    it("enabled when SENTRY_DSN is set", async () => {
      setRequiredEnv();
      process.env.SENTRY_DSN = "https://sentry.example.com/123";

      const { config } = await import("../config");
      expect(config.sentry.enabled).toBe(true);
      expect(config.sentry.dsn).toBe("https://sentry.example.com/123");
    });
  });

  // ── isDev ───────────────────────────────────────────────────────────────

  describe("isDev", () => {
    it("true when NODE_ENV is not set (defaults to development)", async () => {
      setRequiredEnv();
      delete process.env.NODE_ENV;

      const { config } = await import("../config");
      expect(config.isDev).toBe(true);
    });

    it("true when NODE_ENV is development", async () => {
      setRequiredEnv();
      process.env.NODE_ENV = "development";

      const { config } = await import("../config");
      expect(config.isDev).toBe(true);
    });

    it("false when NODE_ENV is production", async () => {
      setRequiredEnv();
      process.env.NODE_ENV = "production";

      const { config } = await import("../config");
      expect(config.isDev).toBe(false);
    });
  });

  // ── full config loads successfully ──────────────────────────────────────

  describe("full config", () => {
    it("loads all required and optional fields", async () => {
      setRequiredEnv();

      const { config } = await import("../config");
      expect(config.solana.rpcUrl).toBe("http://localhost:8899");
      expect(config.solana.programId).toBe("52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu");
      expect(config.solana.oraclePrivateKey).toBe("fake-key");
      expect(config.helius.grpcEndpoint).toBe("http://fake-grpc");
      expect(config.helius.apiKey).toBe("fake-helius");
      expect(config.ai.geminiApiKey).toBe("fake-gemini");
      expect(config.ai.anthropicApiKey).toBe("fake-anthropic");
    });
  });
});
