import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, Connection } from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "./config";
import { GigEscrow, StoredJob } from "./types";
import { deriveVaultPda } from "./utils";

// ─── PROGRAM SETUP ────────────────────────────────────────────────────────────

function loadOracleKeypair(): Keypair {
  const decoded = bs58.decode(config.solana.oraclePrivateKey);
  return Keypair.fromSecretKey(decoded);
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const idl = require("../idl.json");

function buildProgram() {
  const oracleKeypair = loadOracleKeypair();
  const connection    = new Connection(config.solana.rpcUrl, "confirmed");
  const wallet        = new anchor.Wallet(oracleKeypair);
  const provider      = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  // Inject the deployed program ID from config, in case idl.json address is a placeholder
  const idlWithAddress = { ...idl, address: config.solana.programId };
  const program = new anchor.Program(idlWithAddress as anchor.Idl, provider);

  return { program, oracleKeypair, connection };
}

// Build once and reuse across all calls
const { program, oracleKeypair, connection } = buildProgram();
const programId = new PublicKey(config.solana.programId);

// ─── FETCH ESCROW ─────────────────────────────────────────────────────────────

export async function fetchEscrow(escrowPubkey: PublicKey): Promise<GigEscrow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const escrow = await (program.account as any).gigEscrow.fetch(escrowPubkey) as GigEscrow;
  return escrow;
}

// ─── TRANSACTION HELPER ──────────────────────────────────────────────────────

async function sendOracleTx(
  method: string,
  job: StoredJob,
  extraAccounts: Record<string, PublicKey>
): Promise<string> {
  const { escrow, escrowPubkey } = job;
  const vaultPda = deriveVaultPda(escrow.client, escrow.jobId, programId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txSig = await (program.methods as any)
    [method]()
    .accounts({
      ...extraAccounts,
      client:        escrow.client,
      escrowAccount: escrowPubkey,
      vaultAccount:  vaultPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([oracleKeypair])
    .rpc({ commitment: "confirmed" });

  return txSig as string;
}

// ─── RELEASE PAYMENT ───────────────────────────────────────────────────────────

export async function releasePayment(job: StoredJob): Promise<string> {
  return sendOracleTx("releasePayment", job, {
    authority:  oracleKeypair.publicKey,
    freelancer: job.escrow.freelancer,
  });
}

// ─── CANCEL JOB ───────────────────────────────────────────────────────────────

export async function cancelJob(job: StoredJob): Promise<string> {
  return sendOracleTx("cancelJob", job, {
    oracle: oracleKeypair.publicKey,
  });
}

export { connection, oracleKeypair };
