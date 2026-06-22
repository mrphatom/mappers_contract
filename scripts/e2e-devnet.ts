/**
 * Mappers Protocol — End-to-End Devnet Test Script
 *
 * What this does:
 *   1. Loads client + oracle keypairs
 *   2. Creates a real job escrow on devnet
 *   3. Waits for the oracle to detect it via gRPC
 *   4. Posts a test submission to the oracle HTTP server
 *   5. Polls until the oracle resolves it on-chain
 *   6. Prints the final transaction signature
 *
 * Run: ts-node scripts/e2e-devnet.ts
 * Make sure the oracle is already running: cd oracle && npm run dev
 */

import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import { deriveEscrowPda, deriveVaultPda } from "../shared/pda";

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const RPC_URL       = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const ORACLE_URL    = process.env.ORACLE_URL      || "http://localhost:3001";
const PROGRAM_ID    = new PublicKey("52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu");
const JOB_AMOUNT    = new BN(0.01 * LAMPORTS_PER_SOL); // 0.01 SOL — minimal devnet test
const JOB_ID        = `e2e-test-${Date.now()}`;
const POLL_INTERVAL = 3000;  // ms between oracle polls
const MAX_POLLS     = 20;    // 60 second timeout

// ─── KEYPAIR LOADER ───────────────────────────────────────────────────────────

function loadKeypair(envKey: string, fileFallback: string): Keypair {
  if (process.env[envKey]) {
    const bs58 = require("bs58");
    return Keypair.fromSecretKey(bs58.decode(process.env[envKey]!));
  }
  if (fs.existsSync(fileFallback)) {
    const raw = JSON.parse(fs.readFileSync(fileFallback, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  throw new Error(
    `Could not load keypair. Set env var ${envKey} or provide file at ${fileFallback}`
  );
}

// ─── ORACLE HTTP HELPERS ──────────────────────────────────────────────────────

async function checkOracleHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${ORACLE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function checkJobInOracle(jobId: string): Promise<boolean> {
  try {
    const res = await fetch(`${ORACLE_URL}/jobs/${jobId}`);
    return res.ok;
  } catch {
    return false;
  }
}

async function submitToOracle(jobId: string): Promise<{
  success: boolean;
  outcome?: string;
  txSig?: string;
  error?: string;
}> {
  const res = await fetch(`${ORACLE_URL}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jobId,
      description:
        "Write a TypeScript function that takes an array of numbers and returns their sum.",
      acceptanceCriteria: [
        "Function must be written in TypeScript",
        "Function must accept an array of numbers as its only parameter",
        "Function must return a number",
        "Function must correctly compute the sum",
      ],
      deliverable: `
function sumArray(numbers: number[]): number {
  return numbers.reduce((acc, n) => acc + n, 0);
}

// Tests
console.log(sumArray([1, 2, 3]));       // 6
console.log(sumArray([10, -5, 3]));     // 8
console.log(sumArray([]));              // 0
      `.trim(),
      deliverableType: "text",
    }),
  });
  return res.json();
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🚀 Mappers Protocol — End-to-End Devnet Test");
  console.log("═".repeat(50));

  // 1. Load keypairs
  const clientKeypair = loadKeypair(
    "CLIENT_PRIVATE_KEY",
    path.join(process.env.HOME || "~", ".config/solana/id.json")
  );
  const oracleKeypair = loadKeypair(
    "ORACLE_PRIVATE_KEY",
    "./oracle-keypair.json"
  );

  console.log(`\n📋 Test Config`);
  console.log(`   Job ID:    ${JOB_ID}`);
  console.log(`   Client:    ${clientKeypair.publicKey.toBase58()}`);
  console.log(`   Oracle:    ${oracleKeypair.publicKey.toBase58()}`);
  console.log(`   Amount:    ${JOB_AMOUNT.toNumber() / LAMPORTS_PER_SOL} SOL`);

  // 2. Check oracle is running
  console.log(`\n⏳ Checking oracle at ${ORACLE_URL}...`);
  const oracleUp = await checkOracleHealth();
  if (!oracleUp) {
    console.error("❌ Oracle is not running. Start it with: cd oracle && npm run dev");
    process.exit(1);
  }
  console.log("✅ Oracle is up");

  // 3. Set up Anchor program
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet     = new anchor.Wallet(clientKeypair);
  const provider   = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const idl = require("../oracle/idl.json");
  const idlWithAddress = { ...idl, address: PROGRAM_ID.toBase58() };
  const program = new anchor.Program(idlWithAddress as anchor.Idl, provider);

  // 4. Check client balance
  const balance = await connection.getBalance(clientKeypair.publicKey);
  console.log(`\n💰 Client balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  if (balance < JOB_AMOUNT.toNumber() + 0.01 * LAMPORTS_PER_SOL) {
    console.error("❌ Insufficient balance. Airdrop some devnet SOL:");
    console.error(`   solana airdrop 1 ${clientKeypair.publicKey.toBase58()} --url devnet`);
    process.exit(1);
  }

  // 5. Create escrow on-chain
  const freelancer = Keypair.generate(); // random for test
  const [escrowPda] = deriveEscrowPda(clientKeypair.publicKey, JOB_ID, PROGRAM_ID);
  const [vaultPda]  = deriveVaultPda(clientKeypair.publicKey, JOB_ID, PROGRAM_ID);

  console.log(`\n📝 Creating escrow on devnet...`);
  console.log(`   Escrow PDA: ${escrowPda.toBase58()}`);
  console.log(`   Vault PDA:  ${vaultPda.toBase58()}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initTx = await (program.methods as any)
    .initializeJob(JOB_ID, JOB_AMOUNT)
    .accounts({
      client:        clientKeypair.publicKey,
      freelancer:    freelancer.publicKey,
      oracle:        oracleKeypair.publicKey,
      escrowAccount: escrowPda,
      vaultAccount:  vaultPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([clientKeypair])
    .rpc({ commitment: "confirmed" });

  console.log(`✅ Escrow created`);
  console.log(`   Tx: https://explorer.solana.com/tx/${initTx}?cluster=devnet`);

  // 6. Wait for oracle to detect the job via gRPC
  console.log(`\n⏳ Waiting for oracle to detect job via gRPC stream...`);
  let detected = false;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    detected = await checkJobInOracle(JOB_ID);
    if (detected) break;
    process.stdout.write(".");
  }

  if (!detected) {
    console.log("\n⚠️  Oracle hasn't picked up the job via gRPC yet.");
    console.log("   This can happen on slow devnet. Submitting anyway...");
  } else {
    console.log(`\n✅ Oracle detected job: ${JOB_ID}`);
  }

  // 7. Submit deliverable to oracle
  console.log(`\n🤖 Submitting deliverable for AI verification...`);
  console.log("   Running Gemini + Claude consensus pipeline...");

  const result = await submitToOracle(JOB_ID);

  console.log(`\n📊 Verification Result`);
  console.log(`   Success:  ${result.success}`);
  console.log(`   Outcome:  ${result.outcome}`);

  if (result.txSig) {
    console.log(`   Tx:       https://explorer.solana.com/tx/${result.txSig}?cluster=devnet`);
  }
  if (result.error) {
    console.log(`   Error:    ${result.error}`);
  }

  // 8. Final on-chain state check
  if (result.outcome === "RELEASE" || result.outcome === "REFUND") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (program.account as any).gigEscrow.fetch(escrowPda);
      console.log("\n⚠️  Escrow account still exists — close may be pending");
    } catch {
      console.log("\n✅ Escrow account closed — rent returned to client");
    }
  }

  console.log("\n" + "═".repeat(50));
  if (result.success && result.outcome !== "ESCALATE") {
    console.log("✅ END-TO-END TEST PASSED");
  } else if (result.outcome === "ESCALATE") {
    console.log("⚠️  TEST COMPLETE — Oracle escalated to human arbitration");
    console.log("   (Models disagreed — expected occasionally on test data)");
  } else {
    console.log("❌ TEST FAILED — Check oracle logs above");
  }
  console.log("═".repeat(50) + "\n");
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err.message);
  process.exit(1);
});
