import { describe, it, expect, beforeEach } from "vitest";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { GigEscrow } from "../types";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function makeEscrow(overrides: Partial<GigEscrow> = {}): GigEscrow {
  return {
    client:     PublicKey.default,
    freelancer: PublicKey.default,
    oracle:     PublicKey.default,
    amount:     new BN(2_000_000_000),
    jobId:      "test-job-001",
    status:     { pending: {} },
    escrowBump: 255,
    vaultBump:  254,
    deadline:   new BN(Math.floor(Date.now() / 1000) + 7 * 86_400),
    ...overrides,
  };
}

import { store } from "../store";

// ─── TEST SUITE ───────────────────────────────────────────────────────────────

describe("JobStore", () => {
  const escrowPubkey = PublicKey.default;

  beforeEach(() => {
    // Drain pending entries. Store is now keyed by escrow pubkey (base58).
    for (const job of store.allPending()) {
      store.remove(job.escrowPubkey.toBase58());
    }
  });

  // ── upsert ────────────────────────────────────────────────────────────────

  describe("upsert", () => {
    it("inserts a new job (keyed by escrow pubkey)", () => {
      const pk  = PublicKey.default;
      const key = pk.toBase58();

      store.upsert(key, pk, makeEscrow({ jobId: "job-upsert-1" }));
      expect(store.size()).toBe(1);

      const fetched = store.get(key);
      expect(fetched).toBeDefined();
      expect(fetched!.escrow.jobId).toBe("job-upsert-1");
      expect(fetched!.escrowPubkey.equals(pk)).toBe(true);

      store.remove(key);
    });

    it("preserves original detectedAt on re-upsert", async () => {
      const key = PublicKey.default.toBase58();

      store.upsert(key, escrowPubkey, makeEscrow({ jobId: "job-upsert-2" }));
      const firstDetectedAt = store.get(key)!.detectedAt;

      await new Promise((r) => setTimeout(r, 5));

      store.upsert(key, escrowPubkey, makeEscrow({ jobId: "job-upsert-2", amount: new BN(5_000_000_000) }));

      expect(store.get(key)!.detectedAt).toBe(firstDetectedAt);
      expect(store.get(key)!.escrow.amount.toString()).toBe("5000000000");

      store.remove(key);
    });

    it("sets detectedAt to Date.now() for new entries", () => {
      const key = PublicKey.default.toBase58();

      const before = Date.now();
      store.upsert(key, escrowPubkey, makeEscrow({ jobId: "job-upsert-3" }));
      const after = Date.now();

      const { detectedAt } = store.get(key)!;
      expect(detectedAt).toBeGreaterThanOrEqual(before);
      expect(detectedAt).toBeLessThanOrEqual(after);

      store.remove(key);
    });
  });

  // ── get ────────────────────────────────────────────────────────────────────

  describe("get", () => {
    it("returns undefined for non-existent key", () => {
      expect(store.get("nonexistent")).toBeUndefined();
    });

    it("returns the stored job when present", () => {
      const key = PublicKey.default.toBase58();
      store.upsert(key, escrowPubkey, makeEscrow({ jobId: "job-get-1" }));

      const result = store.get(key);
      expect(result).toBeDefined();
      expect(result!.escrow.jobId).toBe("job-get-1");

      store.remove(key);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe("remove", () => {
    it("removes an existing job", () => {
      const key = PublicKey.default.toBase58();
      store.upsert(key, escrowPubkey, makeEscrow({ jobId: "job-rm-1" }));
      expect(store.size()).toBe(1);

      store.remove(key);
      expect(store.size()).toBe(0);
      expect(store.get(key)).toBeUndefined();
    });

    it("is a no-op for non-existent key", () => {
      store.remove("does-not-exist");
      expect(store.size()).toBe(0);
    });
  });

  // ── hasPending ────────────────────────────────────────────────────────────

  describe("hasPending", () => {
    it("returns true for a pending job", () => {
      const key = PublicKey.default.toBase58();
      store.upsert(key, escrowPubkey, makeEscrow({ status: { pending: {} } }));
      expect(store.hasPending(key)).toBe(true);
      store.remove(key);
    });

    it("returns false for a completed job", () => {
      const key = PublicKey.default.toBase58();
      store.upsert(key, escrowPubkey, makeEscrow({ status: { completed: {} } }));
      expect(store.hasPending(key)).toBe(false);
      store.remove(key);
    });

    it("returns false for a cancelled job", () => {
      const key = PublicKey.default.toBase58();
      store.upsert(key, escrowPubkey, makeEscrow({ status: { cancelled: {} } }));
      expect(store.hasPending(key)).toBe(false);
      store.remove(key);
    });

    it("returns false for non-existent key", () => {
      expect(store.hasPending("nope")).toBe(false);
    });
  });

  // ── lock / unlock ──────────────────────────────────────────────────────────

  describe("lock / unlock", () => {
    it("acquires lock when key is free", () => {
      expect(store.lock("lock-a")).toBe(true);
      store.unlock("lock-a");
    });

    it("rejects a second lock attempt while still locked", () => {
      expect(store.lock("lock-b")).toBe(true);
      expect(store.lock("lock-b")).toBe(false);
      store.unlock("lock-b");
    });

    it("allows re-lock after unlock", () => {
      store.lock("lock-c");
      store.unlock("lock-c");
      expect(store.lock("lock-c")).toBe(true);
      store.unlock("lock-c");
    });

    it("remove clears the lock too", () => {
      const key = PublicKey.default.toBase58();
      store.upsert(key, escrowPubkey, makeEscrow());
      store.lock(key);
      store.remove(key);           // should clear job + lock
      expect(store.lock(key)).toBe(true); // can now acquire
      store.unlock(key);
    });
  });

  // ── allPending ────────────────────────────────────────────────────────────

  describe("allPending", () => {
    it("returns only pending jobs", () => {
      const keys = ["ap-key-1", "ap-key-2", "ap-key-3"];
      store.upsert(keys[0], escrowPubkey, makeEscrow({ jobId: "ap-1", status: { pending: {}   } }));
      store.upsert(keys[1], escrowPubkey, makeEscrow({ jobId: "ap-2", status: { completed: {} } }));
      store.upsert(keys[2], escrowPubkey, makeEscrow({ jobId: "ap-3", status: { pending: {}   } }));

      const pending = store.allPending();
      expect(pending).toHaveLength(2);
      const ids = pending.map((j) => j.escrow.jobId).sort();
      expect(ids).toEqual(["ap-1", "ap-3"]);

      for (const k of keys) store.remove(k);
    });

    it("returns empty array when no pending jobs exist", () => {
      const key = "ap-completed-key";
      store.upsert(key, escrowPubkey, makeEscrow({ status: { completed: {} } }));
      expect(store.allPending()).toHaveLength(0);
      store.remove(key);
    });
  });

  // ── size ──────────────────────────────────────────────────────────────────

  describe("size", () => {
    it("returns 0 for empty store", () => {
      expect(store.size()).toBe(0);
    });

    it("reflects total count including non-pending jobs", () => {
      store.upsert("sz-1", escrowPubkey, makeEscrow({ status: { pending: {}   } }));
      store.upsert("sz-2", escrowPubkey, makeEscrow({ status: { completed: {} } }));
      expect(store.size()).toBe(2);

      store.remove("sz-1");
      store.remove("sz-2");
    });
  });
});
