import * as anchor from "@coral-xyz/anchor";
import { BN, AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  GigEscrowAccount,
  FetchedEscrow,
  InitializeJobParams,
  ReleasePaymentParams,
  CancelJobParams,
} from "./types.js";
import { MAPPERS_PROGRAM_ID } from "./constants.js";
import { deriveEscrowPda, deriveVaultPda } from "./pda.js";
import { IDL } from "./idl.js";

// ─── MAPPERS CLIENT ───────────────────────────────────────────────────────────

export class MappersClient {
  readonly provider: AnchorProvider;
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
          bytes: client.toBase58(),
        },
      },
    ]) as Promise<FetchedEscrow[]>;
  }

  // ─── INSTRUCTIONS ─────────────────────────────────────────────────────────

  async initializeJob(params: InitializeJobParams): Promise<string> {
    const { jobId, amount, freelancer, oracle } = params;

    if (jobId.length > 32) {
      throw new Error(`Job ID exceeds 32-character maximum (got ${jobId.length}).`);
    }

    const signer   = this.provider.wallet.publicKey;
    const bnAmount = amount instanceof BN ? amount : new BN(amount.toString());

    const [escrowPda] = this.deriveEscrowPda(signer, jobId);
    const [vaultPda]  = this.deriveVaultPda(signer, jobId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txSig = await (this.program.methods as any)
      .initializeJob(jobId, bnAmount)
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
    const authority = this.provider.wallet.publicKey;
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
}
