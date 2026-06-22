import { PublicKey } from "@solana/web3.js";

export const MAPPERS_PROGRAM_ID = new PublicKey(
  "52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu"
);

export const PDA_SEEDS = {
  ESCROW: "gig-escrow",
  VAULT:  "vault",
} as const;

export const JOB_ID_MAX_LENGTH = 32;

export const MINIMUM_ESCROW_LAMPORTS = 890_880;
