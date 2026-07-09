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
import { airdrop, createEscrow, expectAnchorError, DEFAULT_DURATION_SECONDS } from "./helpers";

// ─── TEST SUITE ──────────────────────────────────────────────────────────────

describe("project_mappers", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program    = anchor.workspace.ProjectMappers as Program<ProjectMappers>;
  const connection = provider.connection;

  const JOB_AMOUNT = new BN(2 * LAMPORTS_PER_SOL);

  // ─── INITIALIZE JOB ────────────────────────────────────────────────────────

  describe("initialize_job", () => {
    let client:     Keypair;
    let freelancer: Keypair;
    let oracle:     Keypair;

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
      assert.ok(escrow.deadline.toNumber() > 0, "deadline should be set");

      const vaultBalance       = await connection.getBalance(vaultPda);
      const clientBalanceAfter = await connection.getBalance(client.publicKey);

      assert.ok(vaultBalance >= JOB_AMOUNT.toNumber(), "vault must hold at least job amount");
      assert.ok(
        clientBalanceBefore - clientBalanceAfter >= JOB_AMOUNT.toNumber(),
        "client balance must decrease by at least job amount"
      );
    });

    it("rejects job_id longer than 32 bytes (ASCII overflow)", async () => {
      const jobId = "this-job-id-is-way-too-long-for-the-contract-limit";

      await expectAnchorError(
        () => createEscrow({
          program, client, freelancer: freelancer.publicKey,
          oracle: oracle.publicKey, jobId, amount: JOB_AMOUNT,
        }),
        "JobIdTooLong"
      );
    });

    it("rejects a multi-byte UTF-8 jobId that is under 32 JS chars but over 32 UTF-8 bytes", async () => {
      // 9 emoji × 4 bytes each = 36 bytes, but only 9 JS characters.
      // A naive `.length > 32` check would pass this (9 ≤ 32), but the
      // on-chain check is `job_id.len() <= 32` (UTF-8 bytes), so it must reject.
      const jobId = "🚀🚀🚀🚀🚀🚀🚀🚀🚀"; // 9 emoji = 36 bytes

      await expectAnchorError(
        () => createEscrow({
          program, client, freelancer: freelancer.publicKey,
          oracle: oracle.publicKey, jobId, amount: JOB_AMOUNT,
        }),
        "JobIdTooLong"
      );
    });

    it("rejects zero amount", async () => {
      await expectAnchorError(
        () => createEscrow({
          program, client, freelancer: freelancer.publicKey,
          oracle: oracle.publicKey, jobId: "init-zero-amount", amount: new BN(0),
        }),
        "InvalidAmount"
      );
    });

    it("rejects amount below rent-exempt floor", async () => {
      await expectAnchorError(
        () => createEscrow({
          program, client, freelancer: freelancer.publicKey,
          oracle: oracle.publicKey, jobId: "init-below-rent", amount: new BN(100),
        }),
        "AmountBelowRentExemption"
      );
    });

    it("rejects duration below 1 hour", async () => {
      await expectAnchorError(
        () => createEscrow({
          program, client, freelancer: freelancer.publicKey,
          oracle: oracle.publicKey, jobId: "init-short-dur",
          amount: JOB_AMOUNT, durationSeconds: 1800, // 30 min
        }),
        "InvalidDuration"
      );
    });

    it("rejects duration above 180 days", async () => {
      await expectAnchorError(
        () => createEscrow({
          program, client, freelancer: freelancer.publicKey,
          oracle: oracle.publicKey, jobId: "init-long-dur",
          amount: JOB_AMOUNT, durationSeconds: 15_552_001,
        }),
        "InvalidDuration"
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

      try {
        await program.account.gigEscrow.fetch(escrowPda);
        assert.fail("Escrow account should be closed after release");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        assert.ok(
          msg.includes("Account does not exist") || msg.includes("could not find account"),
          `Unexpected error: ${msg}`
        );
      }
    });

    it("drains the full live vault balance, not just the recorded amount", async () => {
      const extraJobId  = "release-liveball-001";
      const freelancer2 = Keypair.generate();

      const { escrowPda: eP, vaultPda: vP } = await createEscrow({
        program, client, freelancer: freelancer2.publicKey,
        oracle: oracle.publicKey, jobId: extraJobId, amount: JOB_AMOUNT,
      });

      // Send extra lamports directly to the vault after init
      const extraLamports = 50_000;
      const tx = new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: client.publicKey,
          toPubkey:   vP,
          lamports:   extraLamports,
        })
      );
      await provider.sendAndConfirm(tx, [client]);

      const vaultBalanceBefore       = await connection.getBalance(vP);
      const freelancerBalanceBefore  = await connection.getBalance(freelancer2.publicKey);

      assert.ok(vaultBalanceBefore >= JOB_AMOUNT.toNumber() + extraLamports, "vault should hold extra lamports");

      await program.methods
        .releasePayment()
        .accounts({
          authority:     oracle.publicKey,
          freelancer:    freelancer2.publicKey,
          client:        client.publicKey,
          escrowAccount: eP,
          vaultAccount:  vP,
          systemProgram: SystemProgram.programId,
        })
        .signers([oracle])
        .rpc({ commitment: "confirmed" });

      const freelancerBalanceAfter = await connection.getBalance(freelancer2.publicKey);
      const received = freelancerBalanceAfter - freelancerBalanceBefore;

      assert.ok(
        received > JOB_AMOUNT.toNumber(),
        `Freelancer should receive more than recorded amount (got ${received}, expected > ${JOB_AMOUNT.toNumber()})`
      );
    });

    it("client can manually release payment", async () => {
      const clientJobId  = "release-client-002";
      const freelancer2  = Keypair.generate();

      const { escrowPda: cEscrowPda, vaultPda: cVaultPda } = await createEscrow({
        program, client, freelancer: freelancer2.publicKey,
        oracle: oracle.publicKey, jobId: clientJobId, amount: JOB_AMOUNT,
      });

      const balBefore = await connection.getBalance(freelancer2.publicKey);

      await program.methods
        .releasePayment()
        .accounts({
          authority:     client.publicKey,
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
      const rando      = Keypair.generate();
      const freelancer3 = Keypair.generate();

      await airdrop(connection, rando.publicKey, 1);

      const { escrowPda: rEscrowPda, vaultPda: rVaultPda } = await createEscrow({
        program, client, freelancer: freelancer3.publicKey,
        oracle: oracle.publicKey, jobId: "release-unauth-003", amount: JOB_AMOUNT,
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

    it("rejects double-spend on a closed escrow account", async () => {
      const freelancer4 = Keypair.generate();

      const { escrowPda: dsEscrow, vaultPda: dsVault } = await createEscrow({
        program, client, freelancer: freelancer4.publicKey,
        oracle: oracle.publicKey, jobId: "release-doublespend-004", amount: JOB_AMOUNT,
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

      // Second release — must fail because the account was closed.
      // Anchor throws "AccountNotInitialized" (or similar) when an account
      // discriminator can't be read from a closed/zero-lamport account.
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
        "AccountNotInitialized"
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
      assert.ok(clientBalanceAfter > clientBalanceBefore, "client must receive refund");

      try {
        await program.account.gigEscrow.fetch(escrowPda);
        assert.fail("Escrow account should be closed after cancel");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        assert.ok(
          msg.includes("Account does not exist") || msg.includes("could not find account"),
          `Unexpected error: ${msg}`
        );
      }
    });

    it("rejects cancel by non-oracle signer", async () => {
      const impostor    = Keypair.generate();
      const freelancer5 = Keypair.generate();

      await airdrop(connection, impostor.publicKey, 1);

      const { escrowPda: iEscrow, vaultPda: iVault } = await createEscrow({
        program, client, freelancer: freelancer5.publicKey,
        oracle: oracle.publicKey, jobId: "cancel-impostor-002", amount: JOB_AMOUNT,
      });

      await expectAnchorError(
        () => program.methods
          .cancelJob()
          .accounts({
            oracle:        impostor.publicKey,
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

  // ─── REFUND AFTER TIMEOUT ──────────────────────────────────────────────────

  describe("refund_after_timeout", () => {
    it("rejects refund when deadline has not been reached", async () => {
      const client     = Keypair.generate();
      const freelancer = Keypair.generate();
      const oracle     = Keypair.generate();

      await airdrop(connection, client.publicKey, 10);

      const { escrowPda, vaultPda } = await createEscrow({
        program, client, freelancer: freelancer.publicKey,
        oracle: oracle.publicKey, jobId: "timeout-early-001",
        amount: JOB_AMOUNT,
        durationSeconds: DEFAULT_DURATION_SECONDS, // 7 days from now — far in the future
      });

      const rando = Keypair.generate();
      await airdrop(connection, rando.publicKey, 1);

      await expectAnchorError(
        () => program.methods
          .refundAfterTimeout()
          .accounts({
            payer:         rando.publicKey,
            client:        client.publicKey,
            escrowAccount: escrowPda,
            vaultAccount:  vaultPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([rando])
          .rpc(),
        "DeadlineNotReached"
      );
    });
  });
});
