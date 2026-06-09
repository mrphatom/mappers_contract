use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

// Replace this with your actual key from the Playground sidebar after building
declare_id!("52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu");

#[program]
pub mod project_mappers {
    use super::*;

    pub fn initialize_job(ctx: Context<InitializeJob>, job_id: String, amount: u64) -> Result<()> {
        require!(job_id.len() <= 32, EscrowError::JobIdTooLong);
        require!(amount > 0, EscrowError::InvalidAmount);
        require!(amount >= Rent::get()?.minimum_balance(0), EscrowError::AmountBelowRentExemption);

        let escrow = &mut ctx.accounts.escrow_account;
        escrow.client = ctx.accounts.client.key();
        escrow.freelancer = ctx.accounts.freelancer.key();
        escrow.oracle = ctx.accounts.oracle.key();
        escrow.amount = amount;
        escrow.job_id = job_id;
        escrow.status = JobStatus::Pending;
        escrow.escrow_bump = ctx.bumps.escrow_account;
        escrow.vault_bump = ctx.bumps.vault_account;

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
        Ok(())
    }

    pub fn release_payment(ctx: Context<ReleasePayment>) -> Result<()> {
        let client_key = ctx.accounts.escrow_account.client;
        let amount = ctx.accounts.escrow_account.amount;
        let vault_bump = ctx.accounts.escrow_account.vault_bump;
        let job_id = ctx.accounts.escrow_account.job_id.clone();
        let status = ctx.accounts.escrow_account.status;

        require!(status == JobStatus::Pending, EscrowError::JobNotPending);

        let vault_seeds: &[&[u8]] = &[b"vault", client_key.as_ref(), job_id.as_bytes(), &[vault_bump]];

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
        Ok(())
    }

    pub fn cancel_job(ctx: Context<CancelJob>) -> Result<()> {
        let client_key = ctx.accounts.escrow_account.client;
        let amount = ctx.accounts.escrow_account.amount;
        let vault_bump = ctx.accounts.escrow_account.vault_bump;
        let job_id = ctx.accounts.escrow_account.job_id.clone();
        let status = ctx.accounts.escrow_account.status;

        require!(status == JobStatus::Pending, EscrowError::JobNotPending);

        let vault_seeds: &[&[u8]] = &[b"vault", client_key.as_ref(), job_id.as_bytes(), &[vault_bump]];

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
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(job_id: String)]
pub struct InitializeJob<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    /// CHECK: Target worker wallet
    pub freelancer: AccountInfo<'info>,
    /// CHECK: Oracle authority middleware wallet
    pub oracle: AccountInfo<'info>,
    #[account(
        init,
        payer = client,
        space = GigEscrow::MAXIMUM_SPACE,
        seeds = [b"gig-escrow", client.key().as_ref(), job_id.as_bytes()],
        bump
    )]
    pub escrow_account: Account<'info, GigEscrow>,
    #[account(mut, seeds = [b"vault", client.key().as_ref(), job_id.as_bytes()], bump)]
    /// CHECK: System-owned PDA vault
    pub vault_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleasePayment<'info> {
    pub authority: Signer<'info>,
    #[account(mut)]
    /// CHECK: Enforced via has_one
    pub freelancer: AccountInfo<'info>,
    #[account(mut)]
    /// CHECK: Receives rent reclamation
    pub client: AccountInfo<'info>,
    #[account(
        mut,
        has_one = freelancer @ EscrowError::InvalidFreelancerTarget,
        has_one = client @ EscrowError::InvalidClientAuthority,
        seeds = [b"gig-escrow", escrow_account.client.key().as_ref(), escrow_account.job_id.as_bytes()],
        bump = escrow_account.escrow_bump,
        close = client
    )]
    pub escrow_account: Account<'info, GigEscrow>,
    #[account(mut, seeds = [b"vault", escrow_account.client.key().as_ref(), escrow_account.job_id.as_bytes()], bump = escrow_account.vault_bump)]
    /// CHECK: Verified by seeds
    pub vault_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelJob<'info> {
    pub oracle: Signer<'info>,
    #[account(mut)]
    /// CHECK: Receives refund and rent reclamation
    pub client: AccountInfo<'info>,
    #[account(
        mut,
        has_one = oracle @ EscrowError::InvalidOracleAuthority,
        has_one = client @ EscrowError::InvalidClientAuthority,
        seeds = [b"gig-escrow", escrow_account.client.key().as_ref(), escrow_account.job_id.as_bytes()],
        bump = escrow_account.escrow_bump,
        close = client
    )]
    pub escrow_account: Account<'info, GigEscrow>,
    #[account(mut, seeds = [b"vault", escrow_account.client.key().as_ref(), escrow_account.job_id.as_bytes()], bump = escrow_account.vault_bump)]
    /// CHECK: Verified by seeds
    pub vault_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct GigEscrow {
    pub client: Pubkey,
    pub freelancer: Pubkey,
    pub oracle: Pubkey,
    pub amount: u64,
    pub job_id: String,
    pub status: JobStatus,
    pub escrow_bump: u8,
    pub vault_bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub enum JobStatus {
    Pending,
    Completed,
    Cancelled,
}

impl GigEscrow {
    pub const MAXIMUM_SPACE: usize = 8 + 32 + 32 + 32 + 8 + 4 + 32 + 1 + 1 + 1;
}

#[error_code]
pub enum EscrowError {
    #[msg("Job ID exceeds the 32-character maximum.")]
    JobIdTooLong,
    #[msg("Funding amount must be greater than zero lamports.")]
    InvalidAmount,
    #[msg("Amount is below the vault's rent-exempt minimum.")]
    AmountBelowRentExemption,
    #[msg("Job is not in a Pending state.")]
    JobNotPending,
    #[msg("Target account does not match the escrow's assigned freelancer.")]
    InvalidFreelancerTarget,
    #[msg("Only the designated oracle account can authorize cancellation.")]
    InvalidOracleAuthority,
    #[msg("Refund target does not match the original client.")]
    InvalidClientAuthority,
}
