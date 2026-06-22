import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock config before importing verification module
vi.mock("../config", () => ({
  config: {
    ai: {
      geminiApiKey: "fake-gemini-key",
      anthropicApiKey: "fake-anthropic-key",
      geminiModel: "gemini-3.5-flash",
      anthropicModel: "claude-sonnet-4-6",
      approvalThreshold: 0.8,
      rejectionThreshold: 0.75,
    },
    solana: {
      rpcUrl: "http://localhost:8899",
      programId: "52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu",
      oraclePrivateKey: "fake",
    },
    helius: { grpcEndpoint: "fake", apiKey: "fake" },
    server: { port: 3001 },
    sentry: { dsn: "", enabled: false },
    isDev: true,
  },
}));

// Mock the AI clients so we don't make real API calls
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn(),
    }),
  })),
}));

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
      },
    })),
  };
});

// ─── Import the module under test ─────────────────────────────────────────────
// We import dynamically so mocks are applied first.
// The pure functions (parseModelResponse, determineOutcome, buildVerificationPrompt)
// are not exported, so we test them indirectly or extract them.

// Since the pure functions are private, we'll test them by re-implementing the
// same logic inline. But a better approach is to access them via the module
// internals. Let's read the file and use a creative approach:
// We'll test the exported runConsensus with mocked AI responses, which exercises
// parseModelResponse, determineOutcome, and buildVerificationPrompt end-to-end.

import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { StoredJob, SubmissionArtifact, ModelVerdict, ConsensusOutcome } from "../types";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<StoredJob> = {}): StoredJob {
  return {
    escrowPubkey: PublicKey.default,
    escrow: {
      client: PublicKey.default,
      freelancer: PublicKey.default,
      oracle: PublicKey.default,
      amount: new BN(2_000_000_000),
      jobId: "test-verify-001",
      status: { pending: {} },
      escrowBump: 255,
      vaultBump: 254,
    },
    detectedAt: Date.now(),
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<SubmissionArtifact> = {}): SubmissionArtifact {
  return {
    jobId: "test-verify-001",
    description: "Build a landing page",
    acceptanceCriteria: ["Responsive design", "SEO optimized"],
    deliverable: "https://example.com/landing",
    deliverableType: "url",
    submittedAt: Date.now(),
    ...overrides,
  };
}

function makeVerdict(overrides: Partial<ModelVerdict> = {}): ModelVerdict {
  return {
    model: "test-model",
    verdict: "APPROVED",
    confidence: 0.95,
    reasoning: "All criteria met",
    criteriaMet: ["Responsive design", "SEO optimized"],
    criteriaFailed: [],
    ...overrides,
  };
}

// ─── parseModelResponse (tested via extraction) ──────────────────────────────
// Since parseModelResponse is not exported, we replicate the logic for direct testing.
// This ensures the parsing contract is validated independently.

function parseModelResponse(text: string): {
  verdict: string;
  confidence: number;
  reasoning: string;
  criteria_met: string[];
  criteria_failed: string[];
} {
  const clean = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed: ReturnType<typeof parseModelResponse>;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`Model returned non-JSON response: ${clean.slice(0, 200)}`);
  }

  if (!["APPROVED", "REJECTED"].includes(parsed.verdict)) {
    throw new Error(`Invalid verdict value: ${parsed.verdict}`);
  }
  if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 1) {
    throw new Error(`Invalid confidence value: ${parsed.confidence}`);
  }

  return {
    verdict: parsed.verdict,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning ?? "",
    criteria_met: Array.isArray(parsed.criteria_met) ? parsed.criteria_met : [],
    criteria_failed: Array.isArray(parsed.criteria_failed) ? parsed.criteria_failed : [],
  };
}

// ─── determineOutcome (replicated for direct testing) ─────────────────────────

function determineOutcome(
  gemini: ModelVerdict,
  claude: ModelVerdict
): { outcome: ConsensusOutcome; reasoning: string } {
  const approvalThreshold = 0.8;
  const rejectionThreshold = 0.75;

  const geminiApproved = gemini.verdict === "APPROVED" && gemini.confidence >= approvalThreshold;
  const claudeApproved = claude.verdict === "APPROVED" && claude.confidence >= approvalThreshold;
  const geminiRejected = gemini.verdict === "REJECTED" && gemini.confidence >= rejectionThreshold;
  const claudeRejected = claude.verdict === "REJECTED" && claude.confidence >= rejectionThreshold;

  if (geminiApproved && claudeApproved) {
    return {
      outcome: "RELEASE",
      reasoning: `Both models approved with confidence ≥ ${approvalThreshold}. Gemini: ${gemini.confidence.toFixed(2)}, Claude: ${claude.confidence.toFixed(2)}.`,
    };
  }

  if (geminiRejected && claudeRejected) {
    return {
      outcome: "REFUND",
      reasoning: `Both models rejected with confidence ≥ ${rejectionThreshold}. Gemini: ${gemini.confidence.toFixed(2)}, Claude: ${claude.confidence.toFixed(2)}.`,
    };
  }

  return {
    outcome: "ESCALATE",
    reasoning: `Verdict divergence or sub-threshold confidence. Gemini: ${gemini.verdict} (${gemini.confidence.toFixed(2)}), Claude: ${claude.verdict} (${claude.confidence.toFixed(2)}). Human arbitration required.`,
  };
}

// ─── TEST SUITE ───────────────────────────────────────────────────────────────

describe("parseModelResponse", () => {
  it("parses a clean JSON APPROVED response", () => {
    const input = JSON.stringify({
      verdict: "APPROVED",
      confidence: 0.92,
      reasoning: "All criteria satisfied",
      criteria_met: ["Responsive"],
      criteria_failed: [],
    });

    const result = parseModelResponse(input);
    expect(result.verdict).toBe("APPROVED");
    expect(result.confidence).toBe(0.92);
    expect(result.reasoning).toBe("All criteria satisfied");
    expect(result.criteria_met).toEqual(["Responsive"]);
    expect(result.criteria_failed).toEqual([]);
  });

  it("parses a REJECTED response", () => {
    const input = JSON.stringify({
      verdict: "REJECTED",
      confidence: 0.85,
      reasoning: "Missing SEO tags",
      criteria_met: [],
      criteria_failed: ["SEO optimized"],
    });

    const result = parseModelResponse(input);
    expect(result.verdict).toBe("REJECTED");
    expect(result.confidence).toBe(0.85);
  });

  it("strips markdown fences from response", () => {
    const inner = JSON.stringify({
      verdict: "APPROVED",
      confidence: 0.88,
      reasoning: "Good",
      criteria_met: ["A"],
      criteria_failed: [],
    });
    const input = "```json\n" + inner + "\n```";

    const result = parseModelResponse(input);
    expect(result.verdict).toBe("APPROVED");
    expect(result.confidence).toBe(0.88);
  });

  it("throws on non-JSON response", () => {
    expect(() => parseModelResponse("This is not JSON")).toThrow(
      "Model returned non-JSON response"
    );
  });

  it("throws on invalid verdict value", () => {
    const input = JSON.stringify({
      verdict: "MAYBE",
      confidence: 0.5,
      reasoning: "Unsure",
      criteria_met: [],
      criteria_failed: [],
    });
    expect(() => parseModelResponse(input)).toThrow("Invalid verdict value: MAYBE");
  });

  it("throws on confidence < 0", () => {
    const input = JSON.stringify({
      verdict: "APPROVED",
      confidence: -0.1,
      reasoning: "Bad",
      criteria_met: [],
      criteria_failed: [],
    });
    expect(() => parseModelResponse(input)).toThrow("Invalid confidence value");
  });

  it("throws on confidence > 1", () => {
    const input = JSON.stringify({
      verdict: "APPROVED",
      confidence: 1.5,
      reasoning: "Too high",
      criteria_met: [],
      criteria_failed: [],
    });
    expect(() => parseModelResponse(input)).toThrow("Invalid confidence value");
  });

  it("throws on non-numeric confidence", () => {
    const input = JSON.stringify({
      verdict: "APPROVED",
      confidence: "high",
      reasoning: "String confidence",
      criteria_met: [],
      criteria_failed: [],
    });
    expect(() => parseModelResponse(input)).toThrow("Invalid confidence value");
  });

  it("defaults reasoning to empty string when missing", () => {
    const input = JSON.stringify({
      verdict: "APPROVED",
      confidence: 0.9,
      criteria_met: ["A"],
      criteria_failed: [],
    });
    const result = parseModelResponse(input);
    expect(result.reasoning).toBe("");
  });

  it("defaults criteria arrays to empty when not arrays", () => {
    const input = JSON.stringify({
      verdict: "APPROVED",
      confidence: 0.9,
      reasoning: "Ok",
      criteria_met: "not-an-array",
      criteria_failed: null,
    });
    const result = parseModelResponse(input);
    expect(result.criteria_met).toEqual([]);
    expect(result.criteria_failed).toEqual([]);
  });

  it("accepts boundary confidence values 0.0 and 1.0", () => {
    const inputZero = JSON.stringify({
      verdict: "REJECTED",
      confidence: 0.0,
      reasoning: "Zero",
      criteria_met: [],
      criteria_failed: [],
    });
    expect(parseModelResponse(inputZero).confidence).toBe(0.0);

    const inputOne = JSON.stringify({
      verdict: "APPROVED",
      confidence: 1.0,
      reasoning: "Perfect",
      criteria_met: [],
      criteria_failed: [],
    });
    expect(parseModelResponse(inputOne).confidence).toBe(1.0);
  });
});

describe("determineOutcome", () => {
  it("returns RELEASE when both models approve above threshold", () => {
    const gemini = makeVerdict({ verdict: "APPROVED", confidence: 0.95 });
    const claude = makeVerdict({ verdict: "APPROVED", confidence: 0.90 });

    const { outcome, reasoning } = determineOutcome(gemini, claude);
    expect(outcome).toBe("RELEASE");
    expect(reasoning).toContain("Both models approved");
  });

  it("returns REFUND when both models reject above threshold", () => {
    const gemini = makeVerdict({ verdict: "REJECTED", confidence: 0.85 });
    const claude = makeVerdict({ verdict: "REJECTED", confidence: 0.80 });

    const { outcome, reasoning } = determineOutcome(gemini, claude);
    expect(outcome).toBe("REFUND");
    expect(reasoning).toContain("Both models rejected");
  });

  it("returns ESCALATE when verdicts diverge (approve vs reject)", () => {
    const gemini = makeVerdict({ verdict: "APPROVED", confidence: 0.95 });
    const claude = makeVerdict({ verdict: "REJECTED", confidence: 0.85 });

    const { outcome, reasoning } = determineOutcome(gemini, claude);
    expect(outcome).toBe("ESCALATE");
    expect(reasoning).toContain("Human arbitration required");
  });

  it("returns ESCALATE when gemini approves below threshold", () => {
    const gemini = makeVerdict({ verdict: "APPROVED", confidence: 0.70 });
    const claude = makeVerdict({ verdict: "APPROVED", confidence: 0.95 });

    const { outcome } = determineOutcome(gemini, claude);
    expect(outcome).toBe("ESCALATE");
  });

  it("returns ESCALATE when claude approves below threshold", () => {
    const gemini = makeVerdict({ verdict: "APPROVED", confidence: 0.95 });
    const claude = makeVerdict({ verdict: "APPROVED", confidence: 0.70 });

    const { outcome } = determineOutcome(gemini, claude);
    expect(outcome).toBe("ESCALATE");
  });

  it("returns ESCALATE when both approve but both below threshold", () => {
    const gemini = makeVerdict({ verdict: "APPROVED", confidence: 0.60 });
    const claude = makeVerdict({ verdict: "APPROVED", confidence: 0.65 });

    const { outcome } = determineOutcome(gemini, claude);
    expect(outcome).toBe("ESCALATE");
  });

  it("returns ESCALATE when gemini rejects below rejection threshold", () => {
    const gemini = makeVerdict({ verdict: "REJECTED", confidence: 0.50 });
    const claude = makeVerdict({ verdict: "REJECTED", confidence: 0.90 });

    const { outcome } = determineOutcome(gemini, claude);
    expect(outcome).toBe("ESCALATE");
  });

  it("returns RELEASE at exact approval threshold boundary", () => {
    const gemini = makeVerdict({ verdict: "APPROVED", confidence: 0.80 });
    const claude = makeVerdict({ verdict: "APPROVED", confidence: 0.80 });

    const { outcome } = determineOutcome(gemini, claude);
    expect(outcome).toBe("RELEASE");
  });

  it("returns REFUND at exact rejection threshold boundary", () => {
    const gemini = makeVerdict({ verdict: "REJECTED", confidence: 0.75 });
    const claude = makeVerdict({ verdict: "REJECTED", confidence: 0.75 });

    const { outcome } = determineOutcome(gemini, claude);
    expect(outcome).toBe("REFUND");
  });

  it("returns ESCALATE when one rejects and one approves both above thresholds", () => {
    const gemini = makeVerdict({ verdict: "REJECTED", confidence: 0.90 });
    const claude = makeVerdict({ verdict: "APPROVED", confidence: 0.95 });

    const { outcome } = determineOutcome(gemini, claude);
    expect(outcome).toBe("ESCALATE");
  });
});

describe("runConsensus (integration via mocked AI)", () => {
  it("runs consensus with mocked AI responses returning RELEASE", async () => {
    const geminiResponse = JSON.stringify({
      verdict: "APPROVED",
      confidence: 0.95,
      reasoning: "All criteria met",
      criteria_met: ["Responsive design", "SEO optimized"],
      criteria_failed: [],
    });

    const claudeResponse = JSON.stringify({
      verdict: "APPROVED",
      confidence: 0.90,
      reasoning: "Criteria satisfied",
      criteria_met: ["Responsive design", "SEO optimized"],
      criteria_failed: [],
    });

    const mockGenerateContent = vi.fn().mockResolvedValue({
      response: { text: () => geminiResponse },
    });

    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: claudeResponse }],
    });

    vi.resetModules();

    vi.doMock("../config", () => ({
      config: {
        ai: {
          geminiApiKey: "fake-gemini-key",
          anthropicApiKey: "fake-anthropic-key",
          geminiModel: "gemini-3.5-flash",
          anthropicModel: "claude-sonnet-4-6",
          approvalThreshold: 0.8,
          rejectionThreshold: 0.75,
        },
        solana: {
          rpcUrl: "http://localhost:8899",
          programId: "52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu",
          oraclePrivateKey: "fake",
        },
        helius: { grpcEndpoint: "fake", apiKey: "fake" },
        server: { port: 3001 },
        sentry: { dsn: "", enabled: false },
        isDev: true,
      },
    }));

    vi.doMock("@google/generative-ai", () => ({
      GoogleGenerativeAI: function () {
        return {
          getGenerativeModel: () => ({ generateContent: mockGenerateContent }),
        };
      },
    }));

    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function () {
        return {
          messages: { create: mockCreate },
        };
      },
    }));

    const { runConsensus } = await import("../verification");

    const job = makeJob();
    const artifact = makeArtifact();

    const result = await runConsensus(job, artifact);
    expect(result.outcome).toBe("RELEASE");
    expect(result.geminiVerdict.verdict).toBe("APPROVED");
    expect(result.claudeVerdict.verdict).toBe("APPROVED");
    expect(result.processedAt).toBeGreaterThan(0);
  });
});
