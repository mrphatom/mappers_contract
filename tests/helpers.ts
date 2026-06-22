import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert } from "chai";
import { ProjectMappers } from "../target/types/project_mappers";
import { deriveEscrowPda, deriveVaultPda } from "../shared/pda";

export async function airdrop(
  connection: anchor.web3.Connection,
  pubkey: PublicKey,
  sol: number
): Promise<void> {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

export interface EscrowAccounts {
  escrowPda: PublicKey;
  vaultPda: PublicKey;
}

/**
 * Initializes a job escrow on-chain and returns the derived PDA addresses.
 */
export async function createEscrow(opts: {
  program: Program<ProjectMappers>;
  client: Keypair;
  freelancer: PublicKey;
  oracle: PublicKey;
  jobId: string;
  amount: BN;
}): Promise<EscrowAccounts> {
  const { program, client, freelancer, oracle, jobId, amount } = opts;

  const [escrowPda] = deriveEscrowPda(client.publicKey, jobId, program.programId);
  const [vaultPda] = deriveVaultPda(client.publicKey, jobId, program.programId);

  await program.methods
    .initializeJob(jobId, amount)
    .accounts({
      client: client.publicKey,
      freelancer,
      oracle,
      escrowAccount: escrowPda,
      vaultAccount: vaultPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([client])
    .rpc({ commitment: "confirmed" });

  return { escrowPda, vaultPda };
}

/**
 * Asserts that an async operation fails with an Anchor error whose message
 * contains the given substring.
 */
export async function expectAnchorError(
  fn: () => Promise<unknown>,
  expectedError: string,
  failMsg?: string
): Promise<void> {
  try {
    await fn();
    assert.fail(failMsg ?? `Should have thrown ${expectedError}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("AssertionError") || message.includes("assert.fail")) {
      throw err;
    }
    assert.include(message, expectedError);
  }
}
