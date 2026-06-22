import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert } from "chai";
// Generated after `anchor build` — run build before first test run
import { ProjectMappers } from "../target/types/project_mappers";
import { deriveEscrowPda, deriveVaultPda } from "../shared/pda";
import { airdrop, createEscrow, expectAnchorError } from "./helpers";

// ─── TEST SUITE ──────────────────────────────────────────────────────────────

describe("project_mappers", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ProjectMappers as Program<ProjectMappers>;
  const connection = provider.connection;

  // Two SOL — safely above rent-exempt floor (~0.00089 SOL)
  const JOB_AMOUNT = new BN(2 * LAMPORTS_PER_SOL);

  // ─── INITIALIZE JOB ────────────────────────────────────────────────────────

  describe("initialize_job", () => {
    let client: Keypair;
    let freelancer: Keypair;
    let oracle: Keypair;

    before(async () => {
      client     = Keypair.generate();
      freelancer = Keypair.generate();
      oracle     = Keypair.generate();
      await airdrop(connection, client.publicKey, 10);
    });

    it("creates escrow, locks SOL in vault, stores correct state", async () => {
      const jobId = "init-test-001";
      const [escrowPda] = deriveEscrowPda(client.publicKey, jobId, program.programId);
      const [vaultPda]  = deriveVaultPda(client.publicKey, jobId, program.programId);

      const clientBalanceBefore = await connection.getBalance(client.publicKey);

      await createEscrow({
        program, client, freelancer: freelancer.publicKey,
        oracle: oracle.publicKey, jobId, amount: JOB_AMOUNT,
      });

      const escrow = await program.account.gigEscrow.fetch(escrowPda);
      assert.equal(escrow.client.toBase58(),     client.publicKey.toBase58(),     "client mismatch");
      assert.equal(escrow.freelancer.toBase58(), freelancer.publicKey.toBase58(), "freelancer mismatch");
      assert.equal(escrow.oracle.toBase58(),     oracle.publicKey.toBase58(),     "oracle mismatch");
      assert.equal(escrow.amount.toString(),     JOB_AMOUNT.toString(),           "amount mismatch");
      assert.equal(escrow.jobId,                 jobId,                           "jobId mismatch");
      assert.deepEqual(escrow.status,            { pending: {} },                 "status should be Pending");

      const vaultBalance      = await connection.getBalance(vaultPda);
      const clientBalanceAfter = await connection.getBalance(client.publicKey);

      assert.ok(vaultBalance >= JOB_AMOUNT.toNumber(), "vault must hold at least job amount");
      assert.ok(
        clientBalanceBefore - clientBalanceAfter >= JOB_AMOUNT.toNumber(),
        "client balance must decrease by at least job amount"
      );
    });

    it("rejects job_id longer than 32 characters", async () => {
      const jobId = "this-job-id-is-way-too-long-for-the-contract-limit";

      await expectAnchorError(
        () => createEscrow({
          program, client, freelancer: freelancer.publicKey,
          oracle: oracle.publicKey, jobId, amount: JOB_AMOUNT,
        }),
        "JobIdTooLong"
      );
    });

    it("rejects zero amount", async () => {
      const jobId = "init-zero-amount";

      await expectAnchorError(
        () => createEscrow({
          program, client, freelancer: freelancer.publicKey,
          oracle: oracle.publicKey, jobId, amount: new BN(0),
        }),
        "InvalidAmount"
      );
    });

    it("rejects amount below rent-exempt floor", async () => {
      const jobId = "init-below-rent";

      await expectAnchorError(
        () => createEscrow({
          program, client, freelancer: freelancer.publicKey,
          oracle: oracle.publicKey, jobId, amount: new BN(100), // 100 lamports — far below ~890,880
        }),
        "AmountBelowRentExemption"
      );
    });
  });

  // ─── RELEASE PAYMENT ───────────────────────────────────────────────────────

  describe("release_payment", () => {
    let client:     Keypair;
    let freelancer: Keypair;
    let oracle:     Keypair;
    let escrowPda:  PublicKey;
    let vaultPda:   PublicKey;

    const jobId = "release-test-001";

    before(async () => {
      client     = Keypair.generate();
      freelancer = Keypair.generate();
      oracle     = Keypair.generate();

      await airdrop(connection, client.publicKey, 10);
      await airdrop(connection, oracle.publicKey, 1);

      const pdas = await createEscrow({
        program, client, freelancer: freelancer.publicKey,
        oracle: oracle.publicKey, jobId, amount: JOB_AMOUNT,
      });
      escrowPda = pdas.escrowPda;
      vaultPda  = pdas.vaultPda;
    });

    it("oracle releases payment to freelancer and closes escrow", async () => {
      const freelancerBalanceBefore = await connection.getBalance(freelancer.publicKey);

      await program.methods
        .releasePayment()
        .accounts({
          authority:     oracle.publicKey,
          freelancer:    freelancer.publicKey,
          client:        client.publicKey,
          escrowAccount: escrowPda,
          vaultAccount:  vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([oracle])
        .rpc({ commitment: "confirmed" });

      const freelancerBalanceAfter = await connection.getBalance(freelancer.publicKey);
      assert.ok(
        freelancerBalanceAfter - freelancerBalanceBefore >= JOB_AMOUNT.toNumber(),
        "freelancer must receive at least job amount"
      );

      // Escrow account closed — should throw on fetch
      try {
        await program.account.gigEscrow.fetch(escrowPda);
        assert.fail("Escrow account should be closed after release");
      } catch (err: any) {
        assert.ok(err.message.includes("Account does not exist") || err.message.includes("could not find account"));
      }
    });

    it("client can manually release payment", async () => {
      const clientJobId = "release-client-002";
      const freelancer2  = Keypair.generate();

      const { escrowPda: cEscrowPda, vaultPda: cVaultPda } = await createEscrow({
        program, client, freelancer: freelancer2.publicKey,
        oracle: oracle.publicKey, jobId: clientJobId, amount: JOB_AMOUNT,
      });

      const balBefore = await connection.getBalance(freelancer2.publicKey);

      await program.methods
        .releasePayment()
        .accounts({
          authority:     client.publicKey,   // client signs, not oracle
          freelancer:    freelancer2.publicKey,
          client:        client.publicKey,
          escrowAccount: cEscrowPda,
          vaultAccount:  cVaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([client])
        .rpc({ commitment: "confirmed" });

      const balAfter = await connection.getBalance(freelancer2.publicKey);
      assert.ok(balAfter - balBefore >= JOB_AMOUNT.toNumber(), "freelancer2 must receive funds");
    });

    it("rejects unauthorized signer", async () => {
      const rando   = Keypair.generate();
      const randoId = "release-unauth-003";
      const freelancer3  = Keypair.generate();

      await airdrop(connection, rando.publicKey, 1);

      const { escrowPda: rEscrowPda, vaultPda: rVaultPda } = await createEscrow({
        program, client, freelancer: freelancer3.publicKey,
        oracle: oracle.publicKey, jobId: randoId, amount: JOB_AMOUNT,
      });

      await expectAnchorError(
        () => program.methods
          .releasePayment()
          .accounts({
            authority:     rando.publicKey,
            freelancer:    freelancer3.publicKey,
            client:        client.publicKey,
            escrowAccount: rEscrowPda,
            vaultAccount:  rVaultPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([rando])
          .rpc(),
        "UnauthorizedExecution"
      );
    });

    it("rejects double-spend on completed job", async () => {
      const ds2Id = "release-doublespend-004";
      const freelancer4 = Keypair.generate();

      const { escrowPda: dsEscrow, vaultPda: dsVault } = await createEscrow({
        program, client, freelancer: freelancer4.publicKey,
        oracle: oracle.publicKey, jobId: ds2Id, amount: JOB_AMOUNT,
      });

      // First release — succeeds
      await program.methods
        .releasePayment()
        .accounts({
          authority:     oracle.publicKey,
          freelancer:    freelancer4.publicKey,
          client:        client.publicKey,
          escrowAccount: dsEscrow,
          vaultAccount:  dsVault,
          systemProgram: SystemProgram.programId,
        })
        .signers([oracle])
        .rpc({ commitment: "confirmed" });

      // Second release — must fail (account is closed)
      await expectAnchorError(
        () => program.methods
          .releasePayment()
          .accounts({
            authority:     oracle.publicKey,
            freelancer:    freelancer4.publicKey,
            client:        client.publicKey,
            escrowAccount: dsEscrow,
            vaultAccount:  dsVault,
            systemProgram: SystemProgram.programId,
          })
          .signers([oracle])
          .rpc(),
        "", // Account is closed — Anchor throws AccountNotInitialized or similar
        "Should have failed on closed account"
      );
    });
  });

  // ─── CANCEL JOB ────────────────────────────────────────────────────────────

  describe("cancel_job", () => {
    let client:     Keypair;
    let freelancer: Keypair;
    let oracle:     Keypair;
    let escrowPda:  PublicKey;
    let vaultPda:   PublicKey;

    const jobId = "cancel-test-001";

    before(async () => {
      client     = Keypair.generate();
      freelancer = Keypair.generate();
      oracle     = Keypair.generate();

      await airdrop(connection, client.publicKey, 10);
      await airdrop(connection, oracle.publicKey, 1);

      const pdas = await createEscrow({
        program, client, freelancer: freelancer.publicKey,
        oracle: oracle.publicKey, jobId, amount: JOB_AMOUNT,
      });
      escrowPda = pdas.escrowPda;
      vaultPda  = pdas.vaultPda;
    });

    it("oracle refunds client and closes escrow", async () => {
      const clientBalanceBefore = await connection.getBalance(client.publicKey);

      await program.methods
        .cancelJob()
        .accounts({
          oracle:        oracle.publicKey,
          client:        client.publicKey,
          escrowAccount: escrowPda,
          vaultAccount:  vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([oracle])
        .rpc({ commitment: "confirmed" });

      const clientBalanceAfter = await connection.getBalance(client.publicKey);
      assert.ok(
        clientBalanceAfter > clientBalanceBefore,
        "client must receive refund"
      );

      // Escrow should be closed
      try {
        await program.account.gigEscrow.fetch(escrowPda);
        assert.fail("Escrow account should be closed after cancel");
      } catch (err: any) {
        assert.ok(err.message.includes("Account does not exist") || err.message.includes("could not find account"));
      }
    });

    it("rejects cancel by non-oracle signer", async () => {
      const impostor   = Keypair.generate();
      const impostorId = "cancel-impostor-002";
      const freelancer5 = Keypair.generate();

      await airdrop(connection, impostor.publicKey, 1);

      const { escrowPda: iEscrow, vaultPda: iVault } = await createEscrow({
        program, client, freelancer: freelancer5.publicKey,
        oracle: oracle.publicKey, jobId: impostorId, amount: JOB_AMOUNT,
      });

      await expectAnchorError(
        () => program.methods
          .cancelJob()
          .accounts({
            oracle:        impostor.publicKey, // wrong oracle
            client:        client.publicKey,
            escrowAccount: iEscrow,
            vaultAccount:  iVault,
            systemProgram: SystemProgram.programId,
          })
          .signers([impostor])
          .rpc(),
        "InvalidOracleAuthority"
      );
    });
  });
});
