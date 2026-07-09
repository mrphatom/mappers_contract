import { Connection, PublicKey } from "@solana/web3.js";
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
const RECONNECT_BASE = 2_000;
const RECONNECT_MAX  = 60_000;

// ─── ACCOUNT DECODER ─────────────────────────────────────────────────────────

function tryDecodeGigEscrow(data: Buffer): GigEscrow | null {
  try {
    return coder.accounts.decode<GigEscrow>("GigEscrow", data);
  } catch {
    return null;
  }
}

// ─── ACCOUNT UPDATE HANDLER ───────────────────────────────────────────────────

function handleAccountUpdate(
  pubkeyBytes: Uint8Array,
  dataBytes: Uint8Array
): void {
  const pubkey = new PublicKey(Buffer.from(pubkeyBytes));
  const data   = Buffer.from(dataBytes);
  const escrow = tryDecodeGigEscrow(data);
  if (!escrow) return;

  const escrowKey = pubkey.toBase58(); // keyed by escrow pubkey, not bare jobId

  if ("pending" in escrow.status) {
    if (!store.hasPending(escrowKey)) {
      console.log(`[listener] New pending job detected: ${escrow.jobId} | escrow: ${escrowKey}`);
    }
    store.upsert(escrowKey, pubkey, escrow);
    return;
  }

  if ("completed" in escrow.status || "cancelled" in escrow.status) {
    const status = "completed" in escrow.status ? "COMPLETED" : "CANCELLED";
    console.log(`[listener] Job ${escrow.jobId} resolved: ${status} — removing from store`);
    store.remove(escrowKey);
  }
}

// ─── STARTUP BACKFILL ─────────────────────────────────────────────────────────
//
// Before opening the gRPC stream, do one getProgramAccounts call to seed the
// store with all currently-Pending jobs. Without this backfill, a restart makes
// the oracle blind to jobs that already existed on-chain.

export async function backfillFromChain(): Promise<void> {
  const connection = new Connection(config.solana.rpcUrl, "confirmed");
  console.log("[listener] Backfilling pending jobs from chain...");

  let accounts: Awaited<ReturnType<typeof connection.getProgramAccounts>>;
  try {
    accounts = await connection.getProgramAccounts(PROGRAM_ID);
  } catch (err) {
    console.error("[listener] Backfill failed — getProgramAccounts error:", err);
    return;
  }

  let seeded = 0;
  for (const { pubkey, account } of accounts) {
    const escrow = tryDecodeGigEscrow(account.data);
    if (!escrow) continue;
    if (!("pending" in escrow.status)) continue;

    const escrowKey = pubkey.toBase58();
    store.upsert(escrowKey, pubkey, escrow);
    seeded++;
  }

  console.log(`[listener] Backfill complete — seeded ${seeded} pending job(s)`);
}

// ─── GRPC SUBSCRIPTION ───────────────────────────────────────────────────────

async function startSubscription(attempt: number = 0): Promise<void> {
  const client = new Client(
    config.helius.grpcEndpoint,
    config.helius.apiKey,
    { "grpc.max_receive_message_length": 64 * 1024 * 1024 }
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
        if (data.account?.account) {
          const { pubkey, data: accountData } = data.account.account;
          handleAccountUpdate(pubkey, accountData);
        }
      });

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
  } catch (err) {
    const delay = Math.min(RECONNECT_BASE * 2 ** attempt, RECONNECT_MAX);
    console.error(`[listener] Connection failed. Reconnecting in ${delay}ms... (attempt ${attempt + 1})`);
    await new Promise((r) => setTimeout(r, delay));
    return startSubscription(attempt + 1);
  }

  const delay = Math.min(RECONNECT_BASE * 2 ** attempt, RECONNECT_MAX);
  console.log(`[listener] Reconnecting in ${delay}ms...`);
  await new Promise((r) => setTimeout(r, delay));
  return startSubscription(0);
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export function startListener(): void {
  console.log("[listener] Starting Helius gRPC listener...");
  startSubscription(0).catch((err) => {
    console.error("[listener] Fatal unhandled error:", err);
    process.exit(1);
  });
}
