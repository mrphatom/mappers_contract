import * as anchor from "@coral-xyz/anchor";
import { BN, AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  GigEscrowAccount,
  FetchedEscrow,
  InitializeJobParams,
  ReleasePaymentParams,
  CancelJobParams,
  RefundAfterTimeoutParams,
} from "./types.js";
import { MAPPERS_PROGRAM_ID, MINIMUM_ESCROW_LAMPORTS } from "./constants.js";
import { deriveEscrowPda, deriveVaultPda } from "./pda.js";
import { IDL } from "./idl.js";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const MIN_DURATION_SECONDS = 3_600;      // 1 hour
const MAX_DURATION_SECONDS = 15_552_000; // 180 days

// ─── MAPPERS CLIENT ───────────────────────────────────────────────────────────

export class MappersClient {
  readonly provider:  AnchorProvider;
  readonly programId: PublicKey;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly program: Program<Idl>;

  constructor(provider: AnchorProvider, programId: PublicKey = MAPPERS_PROGRAM_ID) {
    this.provider  = provider;
    this.programId = programId;

    const idlWithAddress = { ...IDL, address: programId.toBase58() } as unknown as Idl;
    this.program = new anchor.Program(idlWithAddress, provider);
  }

  // ─── PDA HELPERS ─────────────────────────────────────────────────────────

  deriveEscrowPda(client: PublicKey, jobId: string): [PublicKey, number] {
    return deriveEscrowPda(client, jobId, this.programId);
  }

  deriveVaultPda(client: PublicKey, jobId: string): [PublicKey, number] {
    return deriveVaultPda(client, jobId, this.programId);
  }

  // ─── READS ───────────────────────────────────────────────────────────────

  async fetchEscrow(escrowPubkey: PublicKey): Promise<GigEscrowAccount> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.program.account as any).gigEscrow.fetch(escrowPubkey) as Promise<GigEscrowAccount>;
  }

  async fetchEscrowByJobId(client: PublicKey, jobId: string): Promise<GigEscrowAccount> {
    const [escrowPda] = this.deriveEscrowPda(client, jobId);
    return this.fetchEscrow(escrowPda);
  }

  async fetchAllEscrows(): Promise<FetchedEscrow[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.program.account as any).gigEscrow.all() as Promise<FetchedEscrow[]>;
  }

  async fetchEscrowsByClient(client: PublicKey): Promise<FetchedEscrow[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.program.account as any).gigEscrow.all([
      {
        memcmp: {
          offset: 8,
          bytes:  client.toBase58(),
        },
      },
    ]) as Promise<FetchedEscrow[]>;
  }

  // ─── INSTRUCTIONS ─────────────────────────────────────────────────────────

  async initializeJob(params: InitializeJobParams): Promise<string> {
    const { jobId, amount, durationSeconds, freelancer, oracle } = params;

    // Validate jobId by UTF-8 byte length, not JS character count.
    // A jobId with multi-byte characters (accents, emoji) can pass a naive
    // .length check while exceeding the on-chain 32-byte limit.
    const jobIdByteLength = Buffer.from(jobId).length;
    if (jobIdByteLength > 32) {
      throw new Error(
        `Job ID exceeds 32-byte UTF-8 limit (got ${jobIdByteLength} bytes, ${jobId.length} chars).`
      );
    }

    if (durationSeconds < MIN_DURATION_SECONDS || durationSeconds > MAX_DURATION_SECONDS) {
      throw new Error(
        `durationSeconds must be between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS} (got ${durationSeconds}).`
      );
    }

    const signer   = this.provider.wallet.publicKey;
    const bnAmount = amount instanceof BN ? amount : new BN(amount.toString());

    if (bnAmount.toNumber() < MINIMUM_ESCROW_LAMPORTS) {
      throw new Error(
        `Amount ${bnAmount.toString()} lamports is below the minimum ${MINIMUM_ESCROW_LAMPORTS} lamports.`
      );
    }

    const [escrowPda] = this.deriveEscrowPda(signer, jobId);
    const [vaultPda]  = this.deriveVaultPda(signer, jobId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txSig = await (this.program.methods as any)
      .initializeJob(jobId, bnAmount, new BN(durationSeconds))
      .accounts({
        client:        signer,
        freelancer,
        oracle,
        escrowAccount: escrowPda,
        vaultAccount:  vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });

    return txSig as string;
  }

  async releasePayment(params: ReleasePaymentParams): Promise<string> {
    const { escrowPubkey, escrow } = params;
    const authority  = this.provider.wallet.publicKey;
    const [vaultPda] = deriveVaultPda(escrow.client, escrow.jobId, this.programId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txSig = await (this.program.methods as any)
      .releasePayment()
      .accounts({
        authority,
        freelancer:    escrow.freelancer,
        client:        escrow.client,
        escrowAccount: escrowPubkey,
        vaultAccount:  vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });

    return txSig as string;
  }

  async cancelJob(params: CancelJobParams): Promise<string> {
    const { escrowPubkey, escrow } = params;
    const oracle     = this.provider.wallet.publicKey;
    const [vaultPda] = deriveVaultPda(escrow.client, escrow.jobId, this.programId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txSig = await (this.program.methods as any)
      .cancelJob()
      .accounts({
        oracle,
        client:        escrow.client,
        escrowAccount: escrowPubkey,
        vaultAccount:  vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });

    return txSig as string;
  }

  /**
   * Permissionless timeout refund — anyone can call once the deadline has
   * passed. Funds always go to the stored client, not the caller (payer).
   */
  async refundAfterTimeout(params: RefundAfterTimeoutParams): Promise<string> {
    const { escrowPubkey, escrow } = params;
    const payer      = params.payer ?? this.provider.wallet.publicKey;
    const [vaultPda] = deriveVaultPda(escrow.client, escrow.jobId, this.programId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txSig = await (this.program.methods as any)
      .refundAfterTimeout()
      .accounts({
        payer,
        client:        escrow.client,
        escrowAccount: escrowPubkey,
        vaultAccount:  vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });

    return txSig as string;
  }
}
