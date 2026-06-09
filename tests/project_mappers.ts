import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ProjectMappers } from "../target/types/project_mappers";
import { assert } from "chai";

describe("project_mappers Integration Tests", () => {
  // 1. Configure provider and network parameters
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ProjectMappers as Program<ProjectMappers>;
  const connection = provider.connection;

  // 2. Generate separate, isolated keypairs for roles
  const client = anchor.web3.Keypair.generate();
  const freelancer = anchor.web3.Keypair.generate();
  const oracle = anchor.web3.Keypair.generate();
  const maliciousActor = anchor.web3.Keypair.generate();

  // Test state parameters
  const jobIdSuccess = "job-001-release-lifecycle";
  const jobIdCancel = "job-002-cancel-lifecycle";
  const amount = new anchor.BN(100_000_000); // 0.1 SOL (Vastly exceeds rent exemption minimum)

  // PDA Derivations for Job 1 (Release payment lifecycle)
  const [escrowPdaSuccess] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("gig-escrow"), client.publicKey.toBuffer(), Buffer.from(jobIdSuccess)],
    program.programId
  );
  const [vaultPdaSuccess] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), client.publicKey.toBuffer(), Buffer.from(jobIdSuccess)],
    program.programId
  );

  // PDA Derivations for Job 2 (Cancellation/Refund lifecycle)
  const [escrowPdaCancel] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("gig-escrow"), client.publicKey.toBuffer(), Buffer.from(jobIdCancel)],
    program.programId
  );
  const [vaultPdaCancel] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), client.publicKey.toBuffer(), Buffer.from(jobIdCancel)],
    program.programId
  );

  before(async () => {
    console.log("--- Funding Wallets with Localhost Air-Drops ---");
    // Fund all transaction-authorizing accounts
    const airdropSigs = await Promise.all([
      connection.requestAirdrop(client.publicKey, 2_000_000_000), // 2.0 SOL
      connection.requestAirdrop(oracle.publicKey, 1_000_000_000), // 1.0 SOL
      connection.requestAirdrop(maliciousActor.publicKey, 1_000_000_000), // 1.0 SOL
    ]);

    // Await transaction completion
    await Promise.all(
      airdropSigs.map((sig) => connection.confirmTransaction(sig, "confirmed"))
    );

    console.log("Client Wallet:", client.publicKey.toBase58());
    console.log("Freelancer Wallet:", freelancer.publicKey.toBase58());
    console.log("Oracle Wallet:", oracle.publicKey.toBase58());
    console.log("Malicious Actor Wallet:", maliciousActor.publicKey.toBase58());
  });

  // ==========================================
  // LIFECYCLE 1: INITIALIZE -> RELEASE PAYMENT
  // ==========================================

  it("Success: Initialize Job 1 and Lock Escrow Payment in Vault", async () => {
    console.log("\n[EXEC] Initializing Job 1...");

    const txSig = await program.methods
      .initializeJob(jobIdSuccess, amount)
      .accounts({
        client: client.publicKey,
        freelancer: freelancer.publicKey,
        oracle: oracle.publicKey,
        escrowAccount: escrowPdaSuccess,
        vaultAccount: vaultPdaSuccess,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([client])
      .rpc();

    console.log("Tx Signature:", txSig);

    // Fetch updated account state
    const escrowState = await program.account.gigEscrow.fetch(escrowPdaSuccess);
    
    // Assert on-chain state structure
    assert.deepEqual(escrowState.client, client.publicKey);
    assert.deepEqual(escrowState.freelancer, freelancer.publicKey);
    assert.deepEqual(escrowState.oracle, oracle.publicKey);
    assert.equal(escrowState.amount.toString(), amount.toString());
    assert.equal(escrowState.jobId, jobIdSuccess);
    assert.deepEqual(escrowState.status, { pending: {} }); // Pending Enum verification

    // Verify system transfer locked lamports into the vault PDA
    const vaultBalance = await connection.getBalance(vaultPdaSuccess);
    assert.equal(vaultBalance, amount.toNumber());
    console.log(`Vault successfully loaded with balance: ${vaultBalance} lamports.`);
  });

  it("Security Check: Block Client from Re-Initializing Active Escrow Account", async () => {
    console.log("\n[EXEC] Attempting double-initialization of Job 1...");
    try {
      await program.methods
        .initializeJob(jobIdSuccess, amount)
        .accounts({
          client: client.publicKey,
          freelancer: freelancer.publicKey,
          oracle: oracle.publicKey,
          escrowAccount: escrowPdaSuccess,
          vaultAccount: vaultPdaSuccess,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([client])
        .rpc();

      assert.fail("Double-initialization should have been blocked by the Solana runtime.");
    } catch (err: any) {
      assert.include(err.logs.toString(), "already in use");
      console.log("Double-initialization blocked successfully.");
    }
  });

  it("Security Check: Block Release Payment to Incorrect Target Freelancer", async () => {
    console.log("\n[EXEC] Requesting payment release to wrong freelancer...");
    try {
      await program.methods
        .releasePayment()
        .accounts({
          authority: oracle.publicKey,
          freelancer: maliciousActor.publicKey, // Attempting to route payment to hacker
          client: client.publicKey,
          escrowAccount: escrowPdaSuccess,
          vaultAccount: vaultPdaSuccess,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([oracle])
        .rpc();

      assert.fail("Release payment should have failed target validation.");
    } catch (err: any) {
      assert.equal(err.error.errorCode.code, "InvalidFreelancerTarget");
      console.log("Wrong freelancer transfer blocked successfully by dynamic constraint.");
    }
  });

  it("Success: Release Payment Transfers Locked Lamports to the Freelancer", async () => {
    console.log("\n[EXEC] Releasing escrow payment to freelancer...");

    const initialFreelancerBalance = await connection.getBalance(freelancer.publicKey);
    const initialClientBalance = await connection.getBalance(client.publicKey);

    const txSig = await program.methods
      .releasePayment()
      .accounts({
        authority: oracle.publicKey,
        freelancer: freelancer.publicKey,
        client: client.publicKey,
        escrowAccount: escrowPdaSuccess,
        vaultAccount: vaultPdaSuccess,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([oracle])
      .rpc();

    console.log("Release Tx Signature:", txSig);

    // Verify balance adjustments
    const finalFreelancerBalance = await connection.getBalance(freelancer.publicKey);
    assert.equal(
      finalFreelancerBalance - initialFreelancerBalance,
      amount.toNumber()
    );

    // Verify client received the closed escrow account rent refund (close = client)
    const finalClientBalance = await connection.getBalance(client.publicKey);
    assert.isTrue(finalClientBalance > initialClientBalance);

    // Verify accounts closed successfully
    const closedEscrowAccount = await connection.getAccountInfo(escrowPdaSuccess);
    assert.isNull(closedEscrowAccount, "Escrow state account was not successfully reaped.");

    const closedVaultAccount = await connection.getAccountInfo(vaultPdaSuccess);
    assert.equal(closedVaultAccount ? closedVaultAccount.lamports : 0, 0, "Vault was not emptied.");

    console.log("Escrow payout and complete rent reclamation verified.");
  });

  // ==========================================
  // LIFECYCLE 2: INITIALIZE -> CANCEL GATING
  // ==========================================

  it("Success: Initialize Job 2 for Cancellation/Arbitration Lifecycle", async () => {
    console.log("\n[EXEC] Initializing Job 2...");

    await program.methods
      .initializeJob(jobIdCancel, amount)
      .accounts({
        client: client.publicKey,
        freelancer: freelancer.publicKey,
        oracle: oracle.publicKey,
        escrowAccount: escrowPdaCancel,
        vaultAccount: vaultPdaCancel,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([client])
      .rpc();

    const vaultBalance = await connection.getBalance(vaultPdaCancel);
    assert.equal(vaultBalance, amount.toNumber());
    console.log("Job 2 state successfully initialized.");
  });

  it("Security Check: Block Non-Oracle Signature on Job Cancel Attempt", async () => {
    console.log("\n[EXEC] Attempting unauthorized cancel...");
    try {
      await program.methods
        .cancelJob()
        .accounts({
          oracle: maliciousActor.publicKey, // Hacker tries to sign as the oracle
          client: client.publicKey,
          escrowAccount: escrowPdaCancel,
          vaultAccount: vaultPdaCancel,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([maliciousActor])
        .rpc();

      assert.fail("Should have failed to bypass Oracle signature authority checks.");
    } catch (err: any) {
      assert.equal(err.error.errorCode.code, "InvalidOracleAuthority");
      console.log("Unauthorized cancel rejected by has_one constraint.");
    }
  });

  it("Success: Authorized Oracle Cancels Job and Issues Full Refund to Client", async () => {
    console.log("\n[EXEC] Authorized Oracle executing job cancellation...");

    const initialClientBalance = await connection.getBalance(client.publicKey);

    const txSig = await program.methods
      .cancelJob()
      .accounts({
        oracle: oracle.publicKey, // Verified Oracle signs transaction
        client: client.publicKey,
        escrowAccount: escrowPdaCancel,
        vaultAccount: vaultPdaCancel,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([oracle])
      .rpc();

    console.log("Tx Signature:", txSig);

    // Verify refund amount returned to client + rent reclamation
    const finalClientBalance = await connection.getBalance(client.publicKey);
    assert.isTrue(
      finalClientBalance > initialClientBalance,
      "Refund did not land in client wallet."
    );

    // Verify state accounts closed
    const closedEscrowAccount = await connection.getAccountInfo(escrowPdaCancel);
    assert.isNull(closedEscrowAccount, "Arbitrated escrow account remained on-chain.");

    console.log("Arbitration, refund, and state clean-up executed successfully.");
  });
});
