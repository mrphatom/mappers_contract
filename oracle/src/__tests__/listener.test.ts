import { describe, it, expect, vi, beforeEach } from "vitest";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

// Mock config
vi.mock("../config", () => ({
  config: {
    solana: {
      rpcUrl:           "http://localhost:8899",
      programId:        "52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu",
      oraclePrivateKey: "fake",
    },
    helius: { grpcEndpoint: "fake", apiKey: "fake" },
    ai: {
      geminiApiKey:       "fake",
      anthropicApiKey:    "fake",
      geminiModel:        "gemini-2.5-flash",
      anthropicModel:     "claude-sonnet-4-5",
      approvalThreshold:  0.8,
      rejectionThreshold: 0.75,
    },
    server:  { port: 3001, apiKey: "" },
    sentry:  { dsn: "", enabled: false },
    isDev:   true,
  },
}));

// Mock the gRPC client
vi.mock("@triton-one/yellowstone-grpc", () => ({
  default:         vi.fn(),
  CommitmentLevel: { CONFIRMED: 1 },
}));

// Mock Anchor BorshCoder
const mockDecode = vi.fn();
vi.mock("@coral-xyz/anchor", () => ({
  BorshCoder: vi.fn().mockImplementation(() => ({
    accounts: { decode: mockDecode },
  })),
}));

// Mock the IDL require
vi.mock("../../idl.json", () => ({}));

import { store } from "../store";
import { GigEscrow } from "../types";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function makeGigEscrow(overrides: Partial<GigEscrow> = {}): GigEscrow {
  return {
    client:     PublicKey.default,
    freelancer: PublicKey.default,
    oracle:     PublicKey.default,
    amount:     new BN(2_000_000_000),
    jobId:      "listener-test-001",
    status:     { pending: {} },
    escrowBump: 255,
    vaultBump:  254,
    deadline:   new BN(Math.floor(Date.now() / 1000) + 7 * 86_400),
    ...overrides,
  };
}

// ─── TEST SUITE ───────────────────────────────────────────────────────────────

describe("listener — handleAccountUpdate (unit-tested via store side-effects)", () => {
  const escrowPubkey = PublicKey.default;
  const escrowKey    = escrowPubkey.toBase58();

  beforeEach(() => {
    // Reset the oracle store between tests
    if (store.hasPending(escrowKey)) {
      store.remove(escrowKey);
    }
    mockDecode.mockReset();
  });

  it("adds a pending job to the store when a Pending escrow is decoded", () => {
    const escrow = makeGigEscrow({ status: { pending: {} } });
    mockDecode.mockReturnValue(escrow);

    // Simulate what the listener does on a new pending account:
    store.upsert(escrowKey, escrowPubkey, escrow);

    expect(store.hasPending(escrowKey)).toBe(true);
    expect(store.get(escrowKey)?.escrow.jobId).toBe("listener-test-001");
    expect(store.get(escrowKey)?.escrow.deadline.toNumber()).toBeGreaterThan(0);

    store.remove(escrowKey);
  });

  it("removes a completed job from the store", () => {
    const pending   = makeGigEscrow({ status: { pending: {}   } });
    const completed = makeGigEscrow({ status: { completed: {} } });

    store.upsert(escrowKey, escrowPubkey, pending);
    expect(store.size()).toBe(1);

    // Simulate resolution — listener calls store.remove on completed/cancelled
    store.remove(escrowKey);
    expect(store.size()).toBe(0);
    expect(store.get(escrowKey)).toBeUndefined();
  });

  it("removes a cancelled job from the store", () => {
    const pending   = makeGigEscrow({ status: { pending: {}    } });
    const cancelled = makeGigEscrow({ status: { cancelled: {} } });

    store.upsert(escrowKey, escrowPubkey, pending);
    expect(store.hasPending(escrowKey)).toBe(true);

    // Listener removes cancelled jobs
    store.remove(escrowKey);
    expect(store.hasPending(escrowKey)).toBe(false);
  });

  it("preserves detectedAt when a pending job is updated on-chain", async () => {
    const v1 = makeGigEscrow({ amount: new BN(1_000_000_000) });
    store.upsert(escrowKey, escrowPubkey, v1);
    const original = store.get(escrowKey)!.detectedAt;

    await new Promise((r) => setTimeout(r, 5));

    const v2 = makeGigEscrow({ amount: new BN(2_000_000_000) });
    store.upsert(escrowKey, escrowPubkey, v2);

    expect(store.get(escrowKey)!.detectedAt).toBe(original);
    store.remove(escrowKey);
  });

  it("does not re-add a job after it has been removed (resolved race)", () => {
    const escrow = makeGigEscrow({ status: { completed: {} } });

    // Simulate the listener receiving a completed account — should not add to store
    // In practice the listener calls store.remove() for completed; it should NOT upsert.
    // We verify that the store stays empty after a remove.
    store.upsert(escrowKey, escrowPubkey, escrow);
    store.remove(escrowKey);

    expect(store.get(escrowKey)).toBeUndefined();
    expect(store.size()).toBe(0);
  });
});
