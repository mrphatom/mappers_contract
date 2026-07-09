import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock config before importing verification module
vi.mock("../config", () => ({
  config: {
    ai: {
      geminiApiKey:       "fake-gemini-key",
      anthropicApiKey:    "fake-anthropic-key",
      geminiModel:        "gemini-2.5-flash",
      anthropicModel:     "claude-sonnet-4-5",
      approvalThreshold:  0.8,
      rejectionThreshold: 0.75,
    },
    solana: {
      rpcUrl:           "http://localhost:8899",
      programId:        "52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu",
      oraclePrivateKey: "fake",
    },
    helius: { grpcEndpoint: "fake", apiKey: "fake" },
    server: { port: 3001, apiKey: "" },
    sentry: { dsn: "", enabled: false },
    isDev:  true,
  },
}));

// Mock the AI clients so we don't make real API calls
const mockGenerateContent = vi.fn();
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}));

const mockMessagesCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  })),
}));

import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { StoredJob, SubmissionArtifact } from "../types";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function makeStoredJob(overrides: Partial<StoredJob["escrow"]> = {}): StoredJob {
  return {
    escrowPubkey: PublicKey.default,
    escrow: {
      client:     PublicKey.default,
      freelancer: PublicKey.default,
      oracle:     PublicKey.default,
      amount:     new BN(2_000_000_000),
      jobId:      "verify-test-001",
      status:     { pending: {} },
      escrowBump: 255,
      vaultBump:  254,
      deadline:   new BN(Math.floor(Date.now() / 1000) + 7 * 86_400),
      ...overrides,
    },
    detectedAt: Date.now(),
  };
}

const sampleArtifact: SubmissionArtifact = {
  jobId:              "verify-test-001",
  description:        "Build a TypeScript sum function",
  acceptanceCriteria: ["Must be TypeScript", "Must return a number"],
  deliverable:        "function sum(n: number[]): number { return n.reduce((a, b) => a + b, 0); }",
  deliverableType:    "text",
  submittedAt:        Date.now(),
};

function makeApprovedGeminiResponse() {
  return {
    response: {
      text: () =>
        JSON.stringify({
          verdict:         "APPROVED",
          confidence:      0.95,
          reasoning:       "Meets all criteria",
          criteria_met:    ["Must be TypeScript", "Must return a number"],
          criteria_failed: [],
        }),
    },
  };
}

function makeRejectedGeminiResponse() {
  return {
    response: {
      text: () =>
        JSON.stringify({
          verdict:         "REJECTED",
          confidence:      0.85,
          reasoning:       "Does not compile",
          criteria_met:    [],
          criteria_failed: ["Must be TypeScript"],
        }),
    },
  };
}

function makeApprovedClaudeResponse(text?: string) {
  return {
    stop_reason: "end_turn",
    content:     [
      {
        type: "text",
        text: text ?? JSON.stringify({
          verdict:         "APPROVED",
          confidence:      0.90,
          reasoning:       "Satisfies all criteria",
          criteria_met:    ["Must be TypeScript", "Must return a number"],
          criteria_failed: [],
        }),
      },
    ],
  };
}

function makeRejectedClaudeResponse() {
  return {
    stop_reason: "end_turn",
    content:     [
      {
        type: "text",
        text: JSON.stringify({
          verdict:         "REJECTED",
          confidence:      0.80,
          reasoning:       "Code fails to meet criteria",
          criteria_met:    [],
          criteria_failed: ["Must be TypeScript"],
        }),
      },
    ],
  };
}

// ─── TEST SUITE ───────────────────────────────────────────────────────────────

describe("runConsensus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns RELEASE when both models APPROVE with high confidence", async () => {
    mockGenerateContent.mockResolvedValue(makeApprovedGeminiResponse());
    mockMessagesCreate.mockResolvedValue(makeApprovedClaudeResponse());

    const { runConsensus } = await import("../verification");
    const result = await runConsensus(makeStoredJob(), sampleArtifact);

    expect(result.outcome).toBe("RELEASE");
    expect(result.geminiVerdict.verdict).toBe("APPROVED");
    expect(result.claudeVerdict.verdict).toBe("APPROVED");
  });

  it("returns REFUND when both models REJECT with high confidence", async () => {
    mockGenerateContent.mockResolvedValue(makeRejectedGeminiResponse());
    mockMessagesCreate.mockResolvedValue(makeRejectedClaudeResponse());

    const { runConsensus } = await import("../verification");
    const result = await runConsensus(makeStoredJob(), sampleArtifact);

    expect(result.outcome).toBe("REFUND");
    expect(result.geminiVerdict.verdict).toBe("REJECTED");
    expect(result.claudeVerdict.verdict).toBe("REJECTED");
  });

  it("returns ESCALATE when models diverge", async () => {
    mockGenerateContent.mockResolvedValue(makeApprovedGeminiResponse());
    mockMessagesCreate.mockResolvedValue(makeRejectedClaudeResponse());

    const { runConsensus } = await import("../verification");
    const result = await runConsensus(makeStoredJob(), sampleArtifact);

    expect(result.outcome).toBe("ESCALATE");
  });

  it("returns ESCALATE when confidence is below threshold", async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({ verdict: "APPROVED", confidence: 0.50, reasoning: "Unsure", criteria_met: [], criteria_failed: [] }),
      },
    });
    mockMessagesCreate.mockResolvedValue(makeApprovedClaudeResponse(
      JSON.stringify({ verdict: "APPROVED", confidence: 0.55, reasoning: "Unsure", criteria_met: [], criteria_failed: [] })
    ));

    const { runConsensus } = await import("../verification");
    const result = await runConsensus(makeStoredJob(), sampleArtifact);

    expect(result.outcome).toBe("ESCALATE");
  });

  it("throws when Gemini returns empty text", async () => {
    mockGenerateContent.mockResolvedValue({ response: { text: () => "" } });
    mockMessagesCreate.mockResolvedValue(makeApprovedClaudeResponse());

    const { runConsensus } = await import("../verification");
    await expect(runConsensus(makeStoredJob(), sampleArtifact)).rejects.toThrow("empty response");
  });

  it("throws when Claude returns non-JSON", async () => {
    mockGenerateContent.mockResolvedValue(makeApprovedGeminiResponse());
    mockMessagesCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content:     [{ type: "text", text: "not valid json at all" }],
    });

    const { runConsensus } = await import("../verification");
    await expect(runConsensus(makeStoredJob(), sampleArtifact)).rejects.toThrow("non-JSON");
  });

  it("throws when response fails zod schema validation (invalid verdict)", async () => {
    mockGenerateContent.mockResolvedValue(makeApprovedGeminiResponse());
    mockMessagesCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content:     [
        {
          type: "text",
          text: JSON.stringify({ verdict: "MAYBE", confidence: 0.7, reasoning: "Hmm", criteria_met: [], criteria_failed: [] }),
        },
      ],
    });

    const { runConsensus } = await import("../verification");
    await expect(runConsensus(makeStoredJob(), sampleArtifact)).rejects.toThrow(
      /schema validation|non-JSON|Invalid enum/i
    );
  });

  it("strips markdown fences from model responses", async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => "```json\n" + JSON.stringify({
          verdict:         "APPROVED",
          confidence:      0.9,
          reasoning:       "Good",
          criteria_met:    ["A"],
          criteria_failed: [],
        }) + "\n```",
      },
    });
    mockMessagesCreate.mockResolvedValue(makeApprovedClaudeResponse());

    const { runConsensus } = await import("../verification");
    const result = await runConsensus(makeStoredJob(), sampleArtifact);
    expect(result.outcome).toBe("RELEASE");
  });
});
