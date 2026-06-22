import { PublicKey } from "@solana/web3.js";

/**
 * Derives the GigEscrow PDA for a given client and job ID.
 */
export function deriveEscrowPda(
  client: PublicKey,
  jobId: string,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("gig-escrow"), client.toBuffer(), Buffer.from(jobId)],
    programId
  );
}

/**
 * Derives the Vault PDA for a given client and job ID.
 */
export function deriveVaultPda(
  client: PublicKey,
  jobId: string,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), client.toBuffer(), Buffer.from(jobId)],
    programId
  );
}
