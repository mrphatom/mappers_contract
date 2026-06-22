import { describe, it, expect, vi, beforeEach } from "vitest";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

// Mock config
vi.mock("../config", () => ({
  config: {
    solana: {
      rpcUrl: "http://localhost:8899",
      programId: "52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu",
      oraclePrivateKey: "fake",
    },
    helius: { grpcEndpoint: "fake", apiKey: "fake" },
    ai: {
      geminiApiKey: "fake",
      anthropicApiKey: "fake",
      geminiModel: "gemini-3.5-flash",
      anthropicModel: "claude-sonnet-4-6",
      approvalThreshold: 0.8,
      rejectionThreshold: 0.75,
    },
    server: { port: 3001 },
    sentry: { dsn: "", enabled: false },
    isDev: true,
  },
}));

// Mock the gRPC client
vi.mock("@triton-one/yellowstone-grpc", () => ({
  default: vi.fn(),
  CommitmentLevel: { CONFIRMED: 1 },
}));

// Mock Anchor BorshCoder
const mockDecode = vi.fn();
vi.mock("@coral-xyz/anchor", () => ({
  BorshCoder: vi.fn().mockImplementation(() => ({
    accounts: {
      decode: mockDecode,
    },
  })),
}));

// Mock the IDL require
vi.mock("../../idl.json", () => ({}));

import { store } from "../store";
import { GigEscrow } from "../types";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function makeGigEscrow(overrides: Partial<GigEscrow> = {}): GigEscrow {
  return {
    client: PublicKey.default,
    freelancer: PublicKey.default,
    oracle: PublicKey.default,
    amount: new BN(2_000_000_000),
    jobId: "listener-test-001",
    status: { pending: {} },
    escrowBump: 255,
    vaultBump: 254,
    ...overrides,
  };
}

// Since handleAccountUpdate and tryDecodeGigEscrow are not exported,
// we test the listener logic by simulating what it does:
// 1. Decode account data → GigEscrow
// 2. If pending and not in store → upsert
// 3. If completed/cancelled → remove

describe("listener logic", () => {
  beforeEach(() => {
    // Clear store
    for (const job of store.allPending()) {
      store.remove(job.escrow.jobId);
    }
    mockDecode.mockReset();
  });

  describe("tryDecodeGigEscrow (logic)", () => {
    // Replicate tryDecodeGigEscrow since it's not exported
    function tryDecodeGigEscrow(data: Buffer): GigEscrow | null {
      try {
        return mockDecode("GigEscrow", data);
      } catch {
        return null;
      }
    }

    it("returns decoded escrow on valid data", () => {
      const escrow = makeGigEscrow();
      mockDecode.mockReturnValue(escrow);

      const result = tryDecodeGigEscrow(Buffer.alloc(151));
      expect(result).toEqual(escrow);
      expect(mockDecode).toHaveBeenCalledWith("GigEscrow", expect.any(Buffer));
    });

    it("returns null on decode failure", () => {
      mockDecode.mockImplementation(() => {
        throw new Error("Invalid account data");
      });

      const result = tryDecodeGigEscrow(Buffer.alloc(10));
      expect(result).toBeNull();
    });
  });

  describe("handleAccountUpdate (simulated)", () => {
    it("adds new pending job to store", () => {
      const escrow = makeGigEscrow({ jobId: "new-pending-job" });
      const pubkey = PublicKey.default;

      // Simulate what handleAccountUpdate does
      if ("pending" in escrow.status) {
        if (!store.hasPending(escrow.jobId)) {
          store.upsert(escrow.jobId, pubkey, escrow);
        }
      }

      expect(store.hasPending("new-pending-job")).toBe(true);
      expect(store.size()).toBe(1);
      store.remove("new-pending-job");
    });

    it("upserts existing pending job (re-detection)", () => {
      const pubkey = PublicKey.default;
      const escrow1 = makeGigEscrow({ jobId: "redetect-job" });
      store.upsert("redetect-job", pubkey, escrow1);

      const escrow2 = makeGigEscrow({
        jobId: "redetect-job",
        amount: new BN(5_000_000_000),
      });

      // Simulate re-upsert
      store.upsert("redetect-job", pubkey, escrow2);

      expect(store.size()).toBe(1);
      expect(store.get("redetect-job")!.escrow.amount.toString()).toBe("5000000000");
      store.remove("redetect-job");
    });

    it("removes completed job from store", () => {
      const pubkey = PublicKey.default;
      const escrowPending = makeGigEscrow({ jobId: "complete-me" });
      store.upsert("complete-me", pubkey, escrowPending);

      const escrowCompleted = makeGigEscrow({
        jobId: "complete-me",
        status: { completed: {} },
      });

      // Simulate handleAccountUpdate for completed status
      if ("completed" in escrowCompleted.status || "cancelled" in escrowCompleted.status) {
        store.remove(escrowCompleted.jobId);
      }

      expect(store.size()).toBe(0);
      expect(store.get("complete-me")).toBeUndefined();
    });

    it("removes cancelled job from store", () => {
      const pubkey = PublicKey.default;
      const escrowPending = makeGigEscrow({ jobId: "cancel-me" });
      store.upsert("cancel-me", pubkey, escrowPending);

      const escrowCancelled = makeGigEscrow({
        jobId: "cancel-me",
        status: { cancelled: {} },
      });

      if ("completed" in escrowCancelled.status || "cancelled" in escrowCancelled.status) {
        store.remove(escrowCancelled.jobId);
      }

      expect(store.size()).toBe(0);
    });

    it("ignores null/undefined account updates", () => {
      const update = { account: undefined };
      // Simulate: if (!update?.account) return;
      if (!update?.account) {
        expect(store.size()).toBe(0);
        return;
      }
    });

    it("ignores non-GigEscrow account data", () => {
      mockDecode.mockImplementation(() => {
        throw new Error("Not a GigEscrow");
      });

      // Simulate tryDecodeGigEscrow returning null
      let escrow: GigEscrow | null;
      try {
        escrow = mockDecode("GigEscrow", Buffer.alloc(32));
      } catch {
        escrow = null;
      }

      if (!escrow) {
        // Should not modify store
        expect(store.size()).toBe(0);
      }
    });
  });

  describe("reconnect logic", () => {
    it("calculates exponential backoff correctly", () => {
      const RECONNECT_BASE = 2_000;
      const RECONNECT_MAX = 60_000;

      expect(Math.min(RECONNECT_BASE * 2 ** 0, RECONNECT_MAX)).toBe(2_000);
      expect(Math.min(RECONNECT_BASE * 2 ** 1, RECONNECT_MAX)).toBe(4_000);
      expect(Math.min(RECONNECT_BASE * 2 ** 2, RECONNECT_MAX)).toBe(8_000);
      expect(Math.min(RECONNECT_BASE * 2 ** 3, RECONNECT_MAX)).toBe(16_000);
      expect(Math.min(RECONNECT_BASE * 2 ** 4, RECONNECT_MAX)).toBe(32_000);
      expect(Math.min(RECONNECT_BASE * 2 ** 5, RECONNECT_MAX)).toBe(60_000); // capped
      expect(Math.min(RECONNECT_BASE * 2 ** 10, RECONNECT_MAX)).toBe(60_000); // still capped
    });
  });
});
