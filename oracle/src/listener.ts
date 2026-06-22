import { PublicKey } from "@solana/web3.js";
import { BorshCoder } from "@coral-xyz/anchor";
import Client, {
  CommitmentLevel,
  SubscribeUpdate,
} from "@triton-one/yellowstone-grpc";
import { config } from "./config";
import { store } from "./store";
import { GigEscrow } from "./types";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const idl    = require("../idl.json");
const coder  = new BorshCoder(idl);

const PROGRAM_ID     = new PublicKey(config.solana.programId);
const RECONNECT_BASE = 2_000;  // ms
const RECONNECT_MAX  = 60_000; // ms

// ─── ACCOUNT DECODER ─────────────────────────────────────────────────────────

function tryDecodeGigEscrow(data: Buffer): GigEscrow | null {
  try {
    return coder.accounts.decode<GigEscrow>("GigEscrow", data);
  } catch (err: unknown) {
    // Accounts with fewer than 8 bytes or a non-matching discriminator are
    // expected (non-GigEscrow program accounts). Only log when the buffer
    // *looks* like it should decode (8-byte discriminator present, size
    // roughly matches) to surface real deserialization bugs.
    if (data.length >= 151) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[listener] Failed to decode GigEscrow from ${data.length}-byte account: ${message}`
      );
    }
    return null;
  }
}

// ─── ACCOUNT UPDATE HANDLER ───────────────────────────────────────────────────

function handleAccountUpdate(update: SubscribeUpdate["account"]): void {
  if (!update?.account) return;

  const { pubkey: pubkeyBytes, data: dataBytes } = update.account;

  const pubkey = new PublicKey(Buffer.from(pubkeyBytes));
  const data   = Buffer.from(dataBytes);

  const escrow = tryDecodeGigEscrow(data);
  if (!escrow) return;

  const jobId = escrow.jobId;

  if ("pending" in escrow.status) {
    // New or re-detected pending job
    if (!store.hasPending(jobId)) {
      console.log(`[listener] New pending job detected: ${jobId} | escrow: ${pubkey.toBase58()}`);
    }
    store.upsert(jobId, pubkey, escrow);
    return;
  }

  // Job resolved on-chain — remove from store
  if ("completed" in escrow.status || "cancelled" in escrow.status) {
    const status = "completed" in escrow.status ? "COMPLETED" : "CANCELLED";
    console.log(`[listener] Job ${jobId} resolved: ${status} — removing from store`);
    store.remove(jobId);
  }
}

// ─── GRPC SUBSCRIPTION ───────────────────────────────────────────────────────

async function startSubscription(attempt: number = 0): Promise<void> {
  const client = new Client(
    config.helius.grpcEndpoint,
    config.helius.apiKey,
    { "grpc.max_receive_message_length": 64 * 1024 * 1024 } // 64MB
  );

  try {
    const stream = await client.subscribe();

    await new Promise<void>((resolve, reject) => {
      stream.on("error", (err) => {
        console.error("[listener] gRPC stream error:", err.message);
        reject(err);
      });

      stream.on("end", () => {
        console.warn("[listener] gRPC stream ended");
        resolve();
      });

      stream.on("data", (data: SubscribeUpdate) => {
        if (data.account) {
          try {
            handleAccountUpdate(data.account);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[listener] Error processing account update: ${message}`);
          }
        }
      });

      // Subscribe to all accounts owned by the Mappers program
      stream.write(
        {
          accounts: {
            "mappers-program": {
              account: [],
              owner:   [PROGRAM_ID.toBase58()],
              filters: [],
            },
          },
          slots:             {},
          transactions:      {},
          blocks:            {},
          blocksMeta:        {},
          entry:             {},
          accountsDataSlice: [],
          commitment:        CommitmentLevel.CONFIRMED,
          ping:              undefined,
        },
        (err) => {
          if (err) {
            console.error("[listener] Failed to write subscription request:", err);
            reject(err);
          } else {
            console.log(
              `[listener] gRPC subscription active — watching program: ${PROGRAM_ID.toBase58()}`
            );
          }
        }
      );
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const delay = Math.min(RECONNECT_BASE * 2 ** attempt, RECONNECT_MAX);
    console.error(
      `[listener] Connection failed (attempt ${attempt + 1}): ${message}. Reconnecting in ${delay}ms...`
    );
    await new Promise((r) => setTimeout(r, delay));
    return startSubscription(attempt + 1);
  }

  // Stream ended cleanly — reconnect
  const delay = Math.min(RECONNECT_BASE * 2 ** attempt, RECONNECT_MAX);
  console.log(`[listener] Reconnecting in ${delay}ms...`);
  await new Promise((r) => setTimeout(r, delay));
  return startSubscription(0);
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export function startListener(): void {
  console.log("[listener] Starting Helius gRPC listener...");
  // Non-blocking — run as background async loop
  startSubscription(0).catch((err) => {
    console.error("[listener] Fatal unhandled error:", err);
    process.exit(1);
  });
}
