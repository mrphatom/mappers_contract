# ADR 0001: Dual PDA Architecture (GigEscrow + Vault)

## Status
Accepted

## Context
Each job needs an account to store metadata (client, freelancer, oracle, status) and a separate mechanism to hold escrowed SOL. A single combined account was considered first.

## Decision
Use two separate PDAs per job: `GigEscrow` (Anchor-owned, stores state) and `Vault` (System Program-owned, holds lamports only).

## Rationale
Native SOL transfers via CPI require the sending account to be owned by the System Program. Anchor's `#[account]` macro assigns program ownership to the account for data validation — this conflicts with the System Program's signer-authority requirements needed for a lamport transfer CPI. Merging state and vault into one account would require either:
1. Routing transfers through `**lamports().borrow_mut()`* manual manipulation (bypasses System Program safety checks, higher audit risk), or
2. A custom CPI wrapper (added complexity, no compute savings).

Two PDAs, each derived deterministically from `(client_pubkey, job_id)`, is the standard, auditable pattern for this problem on Solana.

## Consequences
- Two account creations per job instead of one → slightly higher rent cost (recovered on close via `close = client`).
- Both PDA bumps must be stored on `GigEscrow` at init to avoid recomputing `find_program_address` on every resolution call (~50,000 CU savings per settlement transaction — see ADR 0003).
- Any future audit needs to verify both PDAs independently, which is more auditing surface than a single-account design, but each account has a narrower, easier-to-reason-about responsibility.
