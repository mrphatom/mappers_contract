import { PublicKey } from "@solana/web3.js";

/**
 * Returns the PDA seed bytes for a job ID.
 *
 * Valid IDs are unchanged. Oversized IDs are bounded so the transaction can
 * reach the program's explicit JobIdTooLong validation instead of failing in
 * Solana's PDA seed-length validation first.
 */
function jobIdSeed(jobId: string): Buffer {
  const bytes = Buffer.from(jobId, "utf8");
  return bytes.subarray(0, Math.min(bytes.length, 32));
}

/**
 * Derives the GigEscrow PDA for a given client and job ID.
 */
export function deriveEscrowPda(
  client: PublicKey,
  jobId: string,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("gig-escrow"), client.toBuffer(), jobIdSeed(jobId)],
    programId,
  );
}

/**
 * Derives the Vault PDA for a given client and job ID.
 */
export function deriveVaultPda(
  client: PublicKey,
  jobId: string,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), client.toBuffer(), jobIdSeed(jobId)],
    programId,
  );
}
