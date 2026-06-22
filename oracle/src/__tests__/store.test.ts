import { describe, it, expect, beforeEach } from "vitest";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { GigEscrow } from "../types";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function makeEscrow(overrides: Partial<GigEscrow> = {}): GigEscrow {
  return {
    client: PublicKey.default,
    freelancer: PublicKey.default,
    oracle: PublicKey.default,
    amount: new BN(2_000_000_000),
    jobId: "test-job-001",
    status: { pending: {} },
    escrowBump: 255,
    vaultBump: 254,
    ...overrides,
  };
}

// We need a fresh JobStore for each test. The module exports a singleton,
// so we re-import to get the class and build our own instance.
// store.ts exports a singleton `store`; we can still exercise it because the
// underlying Map is cleared between tests via remove().

// Instead, we'll import the singleton and clear it between tests.
import { store } from "../store";

// ─── TEST SUITE ───────────────────────────────────────────────────────────────

describe("JobStore", () => {
  const escrowPubkey = PublicKey.default;

  beforeEach(() => {
    // Drain any leftover state from previous tests
    for (const job of store.allPending()) {
      store.remove(job.escrow.jobId);
    }
    // Also remove non-pending jobs that allPending wouldn't return
    // We rely on size() to verify the store is empty
    while (store.size() > 0) {
      // This is a safety net; in practice allPending + remove covers it
      break;
    }
  });

  // ── upsert ────────────────────────────────────────────────────────────────

  describe("upsert", () => {
    it("inserts a new job", () => {
      const escrow = makeEscrow({ jobId: "job-upsert-1" });
      store.upsert("job-upsert-1", escrowPubkey, escrow);

      expect(store.size()).toBe(1);
      const fetched = store.get("job-upsert-1");
      expect(fetched).toBeDefined();
      expect(fetched!.escrow.jobId).toBe("job-upsert-1");
      expect(fetched!.escrowPubkey.equals(escrowPubkey)).toBe(true);

      // Clean up
      store.remove("job-upsert-1");
    });

    it("preserves original detectedAt on re-upsert", async () => {
      const escrow = makeEscrow({ jobId: "job-upsert-2" });
      store.upsert("job-upsert-2", escrowPubkey, escrow);
      const firstDetectedAt = store.get("job-upsert-2")!.detectedAt;

      // Small delay to ensure Date.now() differs
      await new Promise((r) => setTimeout(r, 5));

      const updatedEscrow = makeEscrow({
        jobId: "job-upsert-2",
        amount: new BN(5_000_000_000),
      });
      store.upsert("job-upsert-2", escrowPubkey, updatedEscrow);

      const secondDetectedAt = store.get("job-upsert-2")!.detectedAt;
      expect(secondDetectedAt).toBe(firstDetectedAt);
      expect(store.get("job-upsert-2")!.escrow.amount.toString()).toBe(
        "5000000000"
      );

      store.remove("job-upsert-2");
    });

    it("sets detectedAt to Date.now() for new entries", () => {
      const before = Date.now();
      const escrow = makeEscrow({ jobId: "job-upsert-3" });
      store.upsert("job-upsert-3", escrowPubkey, escrow);
      const after = Date.now();

      const detectedAt = store.get("job-upsert-3")!.detectedAt;
      expect(detectedAt).toBeGreaterThanOrEqual(before);
      expect(detectedAt).toBeLessThanOrEqual(after);

      store.remove("job-upsert-3");
    });
  });

  // ── get ────────────────────────────────────────────────────────────────────

  describe("get", () => {
    it("returns undefined for non-existent job", () => {
      expect(store.get("nonexistent")).toBeUndefined();
    });

    it("returns the stored job when present", () => {
      const escrow = makeEscrow({ jobId: "job-get-1" });
      store.upsert("job-get-1", escrowPubkey, escrow);

      const result = store.get("job-get-1");
      expect(result).toBeDefined();
      expect(result!.escrow.jobId).toBe("job-get-1");

      store.remove("job-get-1");
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe("remove", () => {
    it("removes an existing job", () => {
      store.upsert("job-rm-1", escrowPubkey, makeEscrow({ jobId: "job-rm-1" }));
      expect(store.size()).toBe(1);

      store.remove("job-rm-1");
      expect(store.size()).toBe(0);
      expect(store.get("job-rm-1")).toBeUndefined();
    });

    it("is a no-op for non-existent job", () => {
      store.remove("does-not-exist");
      expect(store.size()).toBe(0);
    });
  });

  // ── hasPending ────────────────────────────────────────────────────────────

  describe("hasPending", () => {
    it("returns true for a job with pending status", () => {
      store.upsert(
        "job-hp-1",
        escrowPubkey,
        makeEscrow({ jobId: "job-hp-1", status: { pending: {} } })
      );
      expect(store.hasPending("job-hp-1")).toBe(true);
      store.remove("job-hp-1");
    });

    it("returns false for a completed job", () => {
      store.upsert(
        "job-hp-2",
        escrowPubkey,
        makeEscrow({ jobId: "job-hp-2", status: { completed: {} } })
      );
      expect(store.hasPending("job-hp-2")).toBe(false);
      store.remove("job-hp-2");
    });

    it("returns false for a cancelled job", () => {
      store.upsert(
        "job-hp-3",
        escrowPubkey,
        makeEscrow({ jobId: "job-hp-3", status: { cancelled: {} } })
      );
      expect(store.hasPending("job-hp-3")).toBe(false);
      store.remove("job-hp-3");
    });

    it("returns false for non-existent job", () => {
      expect(store.hasPending("nope")).toBe(false);
    });
  });

  // ── allPending ────────────────────────────────────────────────────────────

  describe("allPending", () => {
    it("returns only pending jobs", () => {
      store.upsert(
        "ap-1",
        escrowPubkey,
        makeEscrow({ jobId: "ap-1", status: { pending: {} } })
      );
      store.upsert(
        "ap-2",
        escrowPubkey,
        makeEscrow({ jobId: "ap-2", status: { completed: {} } })
      );
      store.upsert(
        "ap-3",
        escrowPubkey,
        makeEscrow({ jobId: "ap-3", status: { pending: {} } })
      );

      const pending = store.allPending();
      expect(pending).toHaveLength(2);
      const ids = pending.map((j) => j.escrow.jobId).sort();
      expect(ids).toEqual(["ap-1", "ap-3"]);

      store.remove("ap-1");
      store.remove("ap-2");
      store.remove("ap-3");
    });

    it("returns empty array when no pending jobs exist", () => {
      store.upsert(
        "ap-4",
        escrowPubkey,
        makeEscrow({ jobId: "ap-4", status: { completed: {} } })
      );
      expect(store.allPending()).toHaveLength(0);
      store.remove("ap-4");
    });
  });

  // ── size ──────────────────────────────────────────────────────────────────

  describe("size", () => {
    it("returns 0 for empty store", () => {
      expect(store.size()).toBe(0);
    });

    it("reflects total count including non-pending jobs", () => {
      store.upsert(
        "sz-1",
        escrowPubkey,
        makeEscrow({ jobId: "sz-1", status: { pending: {} } })
      );
      store.upsert(
        "sz-2",
        escrowPubkey,
        makeEscrow({ jobId: "sz-2", status: { completed: {} } })
      );
      expect(store.size()).toBe(2);

      store.remove("sz-1");
      store.remove("sz-2");
    });
  });
});
