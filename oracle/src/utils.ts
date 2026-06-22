import { PublicKey } from "@solana/web3.js";
import { ModelVerdict, Verdict } from "./types";

/**
 * Parsed JSON shape returned by both AI models.
 */
export interface ParsedModelResponse {
  verdict: string;
  confidence: number;
  reasoning: string;
  criteria_met: string[];
  criteria_failed: string[];
}

/**
 * Converts a parsed AI response into a typed ModelVerdict.
 */
export function toModelVerdict(
  modelName: string,
  parsed: ParsedModelResponse
): ModelVerdict {
  return {
    model: modelName,
    verdict: parsed.verdict as Verdict,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
    criteriaMet: parsed.criteria_met,
    criteriaFailed: parsed.criteria_failed,
  };
}

/**
 * Derives the Vault PDA for a given client and job ID.
 */
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
