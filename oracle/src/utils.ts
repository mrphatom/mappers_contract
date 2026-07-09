import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { ModelVerdict, Verdict } from "./types";

// ─── ZOD SCHEMA FOR AI RESPONSE ───────────────────────────────────────────────

export const ModelResponseSchema = z.object({
  verdict:         z.enum(["APPROVED", "REJECTED"]),
  confidence:      z.number().min(0).max(1),
  reasoning:       z.string(),
  criteria_met:    z.array(z.string()),
  criteria_failed: z.array(z.string()),
});

export type ParsedModelResponse = z.infer<typeof ModelResponseSchema>;

// ─── CONVERT PARSED RESPONSE → TYPED VERDICT ─────────────────────────────────

export function toModelVerdict(
  modelName: string,
  parsed: ParsedModelResponse
): ModelVerdict {
  return {
    model:         modelName,
    verdict:       parsed.verdict as Verdict,
    confidence:    parsed.confidence,
    reasoning:     parsed.reasoning,
    criteriaMet:   parsed.criteria_met,
    criteriaFailed: parsed.criteria_failed,
  };
}

// ─── VAULT PDA DERIVATION ─────────────────────────────────────────────────────

export function deriveVaultPda(
  client: PublicKey,
  jobId: string,
  programId: PublicKey
): PublicKey {
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), client.toBuffer(), Buffer.from(jobId)],
    programId
  );
  return vaultPda;
}
