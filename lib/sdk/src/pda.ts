import { PublicKey } from "@solana/web3.js";
import { MAPPERS_PROGRAM_ID, PDA_SEEDS } from "./constants.js";

export function deriveEscrowPda(
  client: PublicKey,
  jobId: string,
  programId: PublicKey = MAPPERS_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.ESCROW), client.toBuffer(), Buffer.from(jobId)],
    programId
  );
}

export function deriveVaultPda(
  client: PublicKey,
  jobId: string,
  programId: PublicKey = MAPPERS_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.VAULT), client.toBuffer(), Buffer.from(jobId)],
    programId
  );
}
