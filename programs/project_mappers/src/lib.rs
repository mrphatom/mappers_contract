use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu");

#[program]
pub mod project_mappers {
    use super::*;

    pub fn initialize_job(
        ctx: Context<InitializeJob>,
        job_id: String,
        amount: u64,
    ) -> Result<()> {
        require!(job_id.len() <= 32, EscrowError::JobIdTooLong);
        require!(amount > 0, EscrowError::InvalidAmount);
        require!(
            amount >= Rent::get()?.minimum_balance(0),
            EscrowError::AmountBelowRentExemption
        );

        let escrow          = &mut ctx.accounts.escrow_account;
        escrow.client       = ctx.accounts.client.key();
        escrow.freelancer   = ctx.accounts.freelancer.key();
        escrow.oracle       = ctx.accounts.oracle.key();
        escrow.amount       = amount;
        escrow.job_id       = job_id;
        escrow.status       = JobStatus::Pending;
        escrow.escrow_bump  = ctx.bumps.escrow_account;
        escrow.vault_bump   = ctx.bumps.vault_account;

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.client.to_account_info(),
                    to:   ctx.accounts.vault_account.to_account_info(),
                },
            ),
            amount,
        )?;

        msg!("Escrow initialized. Job: {}", escrow.job_id);
        Ok(())
    }

    pub fn release_payment(ctx: Context<ReleasePayment>) -> Result<()> {
        let client_key  = ctx.accounts.escrow_account.client;
        let oracle_key  = ctx.accounts.escrow_account.oracle;
        let amount      = ctx.accounts.escrow_account.amount;
        let vault_bump  = ctx.accounts.escrow_account.vault_bump;
        let job_id      = ctx.accounts.escrow_account.job_id.clone();
        let status      = ctx.accounts.escrow_account.status;

        require!(status == JobStatus::Pending, EscrowError::JobNotPending);
        require!(
            ctx.accounts.authority.key() == client_key
                || ctx.accounts.authority.key() == oracle_key,
            EscrowError::UnauthorizedExecution
        );

        let vault_seeds: &[&[u8]] = &[
            b"vault",
            client_key.as_ref(),
            job_id.as_bytes(),
            &[vault_bump],
        ];

        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_account.to_account_info(),
                    to:   ctx.accounts.freelancer.to_account_info(),
                },
                &[vault_seeds],
            ),
            amount,
        )?;

        ctx.accounts.escrow_account.status = JobStatus::Completed;
        msg!("Payment of {} lamports released to freelancer.", amount);
        Ok(())
    }

    pub fn cancel_job(ctx: Context<CancelJob>) -> Result<()> {
        let client_key  = ctx.accounts.escrow_account.client;
        let amount      = ctx.accounts.escrow_account.amount;
        let vault_bump  = ctx.accounts.escrow_account.vault_bump;
        let job_id      = ctx.accounts.escrow_account.job_id.clone();
        let status      = ctx.accounts.escrow_account.status;

        require!(status == JobStatus::Pending, EscrowError::JobNotPending);

        let vault_seeds: &[&[u8]] = &[
            b"vault",
            client_key.as_ref(),
            job_id.as_bytes(),
            &[vault_bump],
        ];

        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_account.to_account_info(),
                    to:   ctx.accounts.client.to_account_info(),
                },
                &[vault_seeds],
            ),
            amount,
        )?;

        ctx.accounts.escrow_account.status = JobStatus::Cancelled;
        msg!("Job cancelled. {} lamports refunded to client.", amount);
        Ok(())
    }
}

// ─── ACCOUNT VALIDATION STRUCTURES ──────────────────────────────────────────

#[derive(Accounts)]
#[instruction(job_id: String)]
pub struct InitializeJob<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    /// CHECK: Public key stored; enforced at release via has_one.
    pub freelancer: AccountInfo<'info>,
    /// CHECK: Public key stored; enforced at cancel via has_one.
    pub oracle: AccountInfo<'info>,
    #[account(
        init,
        payer = client,
        space = GigEscrow::MAXIMUM_SPACE,
        seeds = [b"gig-escrow", client.key().as_ref(), job_id.as_bytes()],
        bump
    )]
    pub escrow_account: Account<'info, GigEscrow>,
    #[account(
        mut,
        seeds = [b"vault", client.key().as_ref(), job_id.as_bytes()],
        bump
    )]
    /// CHECK: Lamport-only system-owned PDA. Bump stored on escrow.
    pub vault_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleasePayment<'info> {
    pub authority: Signer<'info>,
    #[account(mut)]
    /// CHECK: Validated by has_one = freelancer on escrow_account.
    pub freelancer: AccountInfo<'info>,
    #[account(mut)]
    /// CHECK: Validated by has_one = client. Receives reclaimed rent on close.
    pub client: AccountInfo<'info>,
    #[account(
        mut,
        has_one = freelancer @ EscrowError::InvalidFreelancerTarget,
        has_one = client     @ EscrowError::InvalidClientAuthority,
        seeds = [b"gig-escrow", escrow_account.client.key().as_ref(), escrow_account.job_id.as_bytes()],
        bump = escrow_account.escrow_bump,
        close = client
    )]
    pub escrow_account: Account<'info, GigEscrow>,
    #[account(
        mut,
        seeds = [b"vault", escrow_account.client.key().as_ref(), escrow_account.job_id.as_bytes()],
        bump = escrow_account.vault_bump
    )]
    /// CHECK: Lamport-only PDA vault; verified by seeds + stored vault_bump.
    pub vault_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelJob<'info> {
    pub oracle: Signer<'info>,
    #[account(mut)]
    /// CHECK: Receives refund and reclaimed escrow rent on close.
    pub client: AccountInfo<'info>,
    #[account(
        mut,
        has_one = oracle  @ EscrowError::InvalidOracleAuthority,
        has_one = client  @ EscrowError::InvalidClientAuthority,
        seeds = [b"gig-escrow", escrow_account.client.key().as_ref(), escrow_account.job_id.as_bytes()],
        bump = escrow_account.escrow_bump,
        close = client
    )]
    pub escrow_account: Account<'info, GigEscrow>,
    #[account(
        mut,
        seeds = [b"vault", escrow_account.client.key().as_ref(), escrow_account.job_id.as_bytes()],
        bump = escrow_account.vault_bump
    )]
    /// CHECK: Lamport-only PDA vault; verified by seeds + stored vault_bump.
    pub vault_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

// ─── STATE ───────────────────────────────────────────────────────────────────

#[account]
pub struct GigEscrow {
    pub client:      Pubkey,    // 32
    pub freelancer:  Pubkey,    // 32
    pub oracle:      Pubkey,    // 32
    pub amount:      u64,       // 8
    pub job_id:      String,    // 4 + 32
    pub status:      JobStatus, // 1
    pub escrow_bump: u8,        // 1
    pub vault_bump:  u8,        // 1
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub enum JobStatus {
    Pending,
    Completed,
    Cancelled,
}

impl GigEscrow {
    // 8 + 32 + 32 + 32 + 8 + (4+32) + 1 + 1 + 1 = 151
    pub const MAXIMUM_SPACE: usize = 8 + 32 + 32 + 32 + 8 + 4 + 32 + 1 + 1 + 1;
}

// ─── ERRORS ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum EscrowError {
    #[msg("Job ID exceeds the 32-character maximum.")]
    JobIdTooLong,
    #[msg("Funding amount must be greater than zero lamports.")]
    InvalidAmount,
    #[msg("Amount is below the vault rent-exempt minimum (~890,880 lamports).")]
    AmountBelowRentExemption,
    #[msg("Job is not in a Pending state.")]
    JobNotPending,
    #[msg("Signer is neither the escrow client nor the designated oracle.")]
    UnauthorizedExecution,
    #[msg("Target account does not match the escrow assigned freelancer.")]
    InvalidFreelancerTarget,
    #[msg("Only the designated oracle account can authorize cancellation.")]
    InvalidOracleAuthority,
    #[msg("Refund target does not match the original client.")]
    InvalidClientAuthority,
}
