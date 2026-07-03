use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu");

/// Minimum settlement window a client may set at job creation.
/// Prevents griefing via a near-instant timeout that undermines the
/// freelancer's ability to deliver before a permissionless refund fires.
pub const MIN_DURATION_SECONDS: i64 = 3_600; // 1 hour

/// Maximum settlement window a client may set at job creation.
/// Prevents indefinite fund lockup caused by an accidental or malicious
/// multi-year duration value.
pub const MAX_DURATION_SECONDS: i64 = 15_552_000; // 180 days

#[program]
pub mod project_mappers {
    use super::*;

    pub fn initialize_job(
        ctx: Context<InitializeJob>,
        job_id: String,
        amount: u64,
        duration_seconds: i64,
    ) -> Result<()> {
        require!(job_id.len() <= 32, EscrowError::JobIdTooLong);
        require!(amount > 0, EscrowError::InvalidAmount);
        require!(
            amount >= Rent::get()?.minimum_balance(0),
            EscrowError::AmountBelowRentExemption
        );
        require!(
            duration_seconds >= MIN_DURATION_SECONDS
                && duration_seconds <= MAX_DURATION_SECONDS,
            EscrowError::InvalidDuration
        );

        let now = Clock::get()?.unix_timestamp;
        let deadline = now
            .checked_add(duration_seconds)
            .ok_or(EscrowError::DurationOverflow)?;

        let escrow = &mut ctx.accounts.escrow_account;
        escrow.client      = ctx.accounts.client.key();
        escrow.freelancer  = ctx.accounts.freelancer.key();
        escrow.oracle      = ctx.accounts.oracle.key();
        escrow.amount      = amount;
        escrow.job_id      = job_id;
        escrow.status      = JobStatus::Pending;
        escrow.escrow_bump = ctx.bumps.escrow_account;
        escrow.vault_bump  = ctx.bumps.vault_account;
        escrow.deadline    = deadline;

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

        msg!(
            "Escrow initialized. Job: {} | Deadline (unix): {}",
            escrow.job_id,
            escrow.deadline
        );
        Ok(())
    }

    pub fn release_payment(ctx: Context<ReleasePayment>) -> Result<()> {
        let client_key = ctx.accounts.escrow_account.client;
        let oracle_key = ctx.accounts.escrow_account.oracle;
        let vault_bump = ctx.accounts.escrow_account.vault_bump;
        let job_id     = ctx.accounts.escrow_account.job_id.clone();
        let status     = ctx.accounts.escrow_account.status;

        require!(status == JobStatus::Pending, EscrowError::JobNotPending);
        require!(
            ctx.accounts.authority.key() == client_key
                || ctx.accounts.authority.key() == oracle_key,
            EscrowError::UnauthorizedExecution
        );

        // Drain the vault's live balance rather than the amount recorded at
        // initialization. Any lamports that arrived after init (dust,
        // accidental overfunding) settle to the freelancer instead of being
        // stranded once the escrow account closes.
        let vault_balance = ctx.accounts.vault_account.lamports();

        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_account.to_account_info(),
                    to:   ctx.accounts.freelancer.to_account_info(),
                },
                &[&[b"vault", client_key.as_ref(), job_id.as_bytes(), &[vault_bump]]],
            ),
            vault_balance,
        )?;

        ctx.accounts.escrow_account.status = JobStatus::Completed;
        msg!("Payment of {} lamports released.", vault_balance);
        Ok(())
    }

    pub fn cancel_job(ctx: Context<CancelJob>) -> Result<()> {
        let client_key = ctx.accounts.escrow_account.client;
        let vault_bump = ctx.accounts.escrow_account.vault_bump;
        let job_id     = ctx.accounts.escrow_account.job_id.clone();
        let status     = ctx.accounts.escrow_account.status;

        require!(status == JobStatus::Pending, EscrowError::JobNotPending);

        let vault_balance = ctx.accounts.vault_account.lamports();

        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_account.to_account_info(),
                    to:   ctx.accounts.client.to_account_info(),
                },
                &[&[b"vault", client_key.as_ref(), job_id.as_bytes(), &[vault_bump]]],
            ),
            vault_balance,
        )?;

        ctx.accounts.escrow_account.status = JobStatus::Cancelled;
        msg!("Job cancelled. {} lamports refunded.", vault_balance);
        Ok(())
    }

    /// Permissionless liveness escape hatch. Anyone may call this once the
    /// job's deadline has passed — the caller only pays the transaction fee;
    /// funds always flow to the stored `client`, never to the caller. This
    /// closes the fund-lock risk that exists if the oracle key is lost,
    /// offline, or the AI consensus loop escalates a job and no human ever
    /// resolves it. The vault's full live balance is refunded, matching the
    /// dust-sweep behavior of `release_payment` and `cancel_job`.
    pub fn refund_after_timeout(ctx: Context<RefundAfterTimeout>) -> Result<()> {
        let client_key = ctx.accounts.escrow_account.client;
        let vault_bump = ctx.accounts.escrow_account.vault_bump;
        let job_id     = ctx.accounts.escrow_account.job_id.clone();
        let status     = ctx.accounts.escrow_account.status;
        let deadline   = ctx.accounts.escrow_account.deadline;

        require!(status == JobStatus::Pending, EscrowError::JobNotPending);

        let now = Clock::get()?.unix_timestamp;
        require!(now >= deadline, EscrowError::DeadlineNotReached);

        let vault_balance = ctx.accounts.vault_account.lamports();

        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_account.to_account_info(),
                    to:   ctx.accounts.client.to_account_info(),
                },
                &[&[b"vault", client_key.as_ref(), job_id.as_bytes(), &[vault_bump]]],
            ),
            vault_balance,
        )?;

        ctx.accounts.escrow_account.status = JobStatus::Cancelled;
        msg!(
            "Deadline reached ({} >= {}). {} lamports permissionlessly refunded to client.",
            now,
            deadline,
            vault_balance
        );
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(job_id: String)]
pub struct InitializeJob<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    /// CHECK: Stored; enforced at release via has_one.
    pub freelancer: AccountInfo<'info>,
    /// CHECK: Stored; enforced at cancel via has_one.
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
    /// CHECK: Validated by has_one on escrow_account.
    pub freelancer: AccountInfo<'info>,
    #[account(mut)]
    /// CHECK: Validated by has_one. Receives rent on close.
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
    /// CHECK: Receives refund and reclaimed rent on close.
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

#[derive(Accounts)]
pub struct RefundAfterTimeout<'info> {
    /// CHECK: Permissionless caller — pays the transaction fee only. Funds
    /// always flow to the stored `client`, never to this signer, so any
    /// party (the client themselves, or an automated keeper) may trigger
    /// the timeout refund once the deadline has passed.
    pub payer: Signer<'info>,
    #[account(mut)]
    /// CHECK: Validated by has_one; receives the timeout refund and reclaimed rent.
    pub client: AccountInfo<'info>,
    #[account(
        mut,
        has_one = client @ EscrowError::InvalidClientAuthority,
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

#[account]
pub struct GigEscrow {
    pub client:      Pubkey,
    pub freelancer:  Pubkey,
    pub oracle:      Pubkey,
    pub amount:      u64,
    pub job_id:      String,
    pub status:      JobStatus,
    pub escrow_bump: u8,
    pub vault_bump:  u8,
    pub deadline:    i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub enum JobStatus {
    Pending,
    Completed,
    Cancelled,
}

impl GigEscrow {
    // 8 (discriminator) + 32*3 (pubkeys) + 8 (amount) + 4+32 (job_id) +
    // 1 (status) + 1 (escrow_bump) + 1 (vault_bump) + 8 (deadline) = 159
    pub const MAXIMUM_SPACE: usize = 8 + 32 + 32 + 32 + 8 + 4 + 32 + 1 + 1 + 1 + 8;
}

#[error_code]
pub enum EscrowError {
    #[msg("Job ID exceeds the 32-character maximum.")]
    JobIdTooLong,
    #[msg("Funding amount must be greater than zero lamports.")]
    InvalidAmount,
    #[msg("Amount is below the vault rent-exempt minimum.")]
    AmountBelowRentExemption,
    #[msg("Job is not in a Pending state.")]
    JobNotPending,
    #[msg("Signer is neither the escrow client nor the designated oracle.")]
    UnauthorizedExecution,
    #[msg("Target account does not match the assigned freelancer.")]
    InvalidFreelancerTarget,
    #[msg("Only the designated oracle can authorize cancellation.")]
    InvalidOracleAuthority,
    #[msg("Refund target does not match the original client.")]
    InvalidClientAuthority,
    #[msg("The settlement deadline has not been reached yet.")]
    DeadlineNotReached,
    #[msg("Duration must be between 1 hour and 180 days.")]
    InvalidDuration,
    #[msg("Deadline calculation overflowed the i64 range.")]
    DurationOverflow,
}
