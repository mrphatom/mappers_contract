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
    process.env.SOLANA_RPC_URL       = "http://localhost:8899";
    process.env.PROGRAM_ID           = "52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu";
    process.env.ORACLE_PRIVATE_KEY   = "fake-key";
    process.env.HELIUS_GRPC_ENDPOINT = "http://fake-grpc";
    process.env.HELIUS_API_KEY       = "fake-helius";
    process.env.GEMINI_API_KEY       = "fake-gemini";
    process.env.ANTHROPIC_API_KEY    = "fake-anthropic";
  }

  // ── required env vars ────────────────────────────────────────────────────

  describe("required env vars", () => {
    it("throws when SOLANA_RPC_URL is missing", async () => {
      setRequiredEnv();
      delete process.env.SOLANA_RPC_URL;
      await expect(import("../config")).rejects.toThrow("SOLANA_RPC_URL");
    });

    it("throws when HELIUS_API_KEY is missing", async () => {
      setRequiredEnv();
      delete process.env.HELIUS_API_KEY;
      await expect(import("../config")).rejects.toThrow("HELIUS_API_KEY");
    });

    it("throws when GEMINI_API_KEY is missing", async () => {
      setRequiredEnv();
      delete process.env.GEMINI_API_KEY;
      await expect(import("../config")).rejects.toThrow("GEMINI_API_KEY");
    });

    it("throws when ANTHROPIC_API_KEY is missing", async () => {
      setRequiredEnv();
      delete process.env.ANTHROPIC_API_KEY;
      await expect(import("../config")).rejects.toThrow("ANTHROPIC_API_KEY");
    });
  });

  // ── optional defaults ────────────────────────────────────────────────────

  describe("optional defaults", () => {
    it("uses gemini-2.5-flash as default Gemini model", async () => {
      setRequiredEnv();
      delete process.env.GEMINI_MODEL;
      const { config } = await import("../config");
      expect(config.ai.geminiModel).toBe("gemini-2.5-flash");
    });

    it("uses default approval threshold 0.8", async () => {
      setRequiredEnv();
      const { config } = await import("../config");
      expect(config.ai.approvalThreshold).toBe(0.8);
    });

    it("uses default port 3001", async () => {
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

    it("ORACLE_API_KEY defaults to empty string", async () => {
      setRequiredEnv();
      delete process.env.ORACLE_API_KEY;
      const { config } = await import("../config");
      expect(config.server.apiKey).toBe("");
    });

    it("ORACLE_API_KEY is read from env", async () => {
      setRequiredEnv();
      process.env.ORACLE_API_KEY = "secret-key-123";
      const { config } = await import("../config");
      expect(config.server.apiKey).toBe("secret-key-123");
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

  // ── isDev — defaults to PRODUCTION for safety ─────────────────────────────

  describe("isDev", () => {
    it("false when NODE_ENV is not set (defaults to production for safety)", async () => {
      setRequiredEnv();
      delete process.env.NODE_ENV;
      const { config } = await import("../config");
      // NODE_ENV unset → optional() returns fallback "production" → isDev = false
      expect(config.isDev).toBe(false);
    });

    it("true when NODE_ENV is explicitly development", async () => {
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
