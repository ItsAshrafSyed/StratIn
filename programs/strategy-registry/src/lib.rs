use anchor_lang::prelude::*;

declare_id!("2zDw6KYfMJRMVfNvShy5XHM1t6tvvTYEoDeLZ87VTEFX");

#[program]
pub mod strategy_registry {
    use super::*;

    pub fn create_strategy(
        ctx: Context<CreateStrategy>,
        strategy_id: [u8; 16],
        allocation_hash: [u8; 32],
    ) -> Result<()> {
        let clock = Clock::get()?;
        let strategy = &mut ctx.accounts.strategy;
        strategy.creator = ctx.accounts.creator.key();
        strategy.strategy_id = strategy_id;
        strategy.current_version = 1;
        strategy.current_allocation_hash = allocation_hash;
        strategy.status = StrategyStatus::Active;
        strategy.bump = ctx.bumps.strategy;
        strategy.created_at = clock.unix_timestamp;
        strategy.updated_at = clock.unix_timestamp;

        write_version(
            &mut ctx.accounts.version,
            strategy.key(),
            ctx.accounts.creator.key(),
            1,
            allocation_hash,
            ctx.bumps.version,
            clock.unix_timestamp,
        );

        emit!(StrategyCreated {
            creator: ctx.accounts.creator.key(),
            strategy: strategy.key(),
            version: 1,
            allocation_hash
        });

        Ok(())
    }

    pub fn publish_rebalance(
        ctx: Context<PublishRebalance>,
        allocation_hash: [u8; 32],
    ) -> Result<()> {
        require!(
            ctx.accounts.strategy.status == StrategyStatus::Active,
            RegistryError::StrategyClosed
        );
        require_keys_eq!(
            ctx.accounts.strategy.creator,
            ctx.accounts.creator.key(),
            RegistryError::Unauthorized
        );

        let clock = Clock::get()?;
        let next_version = ctx
            .accounts
            .strategy
            .current_version
            .checked_add(1)
            .ok_or(RegistryError::VersionOverflow)?;

        ctx.accounts.strategy.current_version = next_version;
        ctx.accounts.strategy.current_allocation_hash = allocation_hash;
        ctx.accounts.strategy.updated_at = clock.unix_timestamp;

        write_version(
            &mut ctx.accounts.version,
            ctx.accounts.strategy.key(),
            ctx.accounts.creator.key(),
            next_version,
            allocation_hash,
            ctx.bumps.version,
            clock.unix_timestamp,
        );

        emit!(RebalancePublished {
            creator: ctx.accounts.creator.key(),
            strategy: ctx.accounts.strategy.key(),
            version: next_version,
            allocation_hash
        });

        Ok(())
    }

    pub fn close_strategy(ctx: Context<CloseStrategy>) -> Result<()> {
        require!(
            ctx.accounts.strategy.status == StrategyStatus::Active,
            RegistryError::InvalidTransition
        );
        require_keys_eq!(
            ctx.accounts.strategy.creator,
            ctx.accounts.creator.key(),
            RegistryError::Unauthorized
        );

        let clock = Clock::get()?;
        ctx.accounts.strategy.status = StrategyStatus::Closed;
        ctx.accounts.strategy.updated_at = clock.unix_timestamp;

        emit!(StrategyClosed {
            creator: ctx.accounts.creator.key(),
            strategy: ctx.accounts.strategy.key()
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(strategy_id: [u8; 16])]
pub struct CreateStrategy<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + StrategyAccount::INIT_SPACE,
        seeds = [b"strategy", creator.key().as_ref(), strategy_id.as_ref()],
        bump
    )]
    pub strategy: Account<'info, StrategyAccount>,
    #[account(
        init,
        payer = creator,
        space = 8 + StrategyVersionAccount::INIT_SPACE,
        seeds = [b"version", strategy.key().as_ref(), &1u32.to_le_bytes()],
        bump
    )]
    pub version: Account<'info, StrategyVersionAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PublishRebalance<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        mut,
        seeds = [b"strategy", strategy.creator.as_ref(), strategy.strategy_id.as_ref()],
        bump = strategy.bump
    )]
    pub strategy: Account<'info, StrategyAccount>,
    #[account(
        init,
        payer = creator,
        space = 8 + StrategyVersionAccount::INIT_SPACE,
        seeds = [b"version", strategy.key().as_ref(), &(strategy.current_version + 1).to_le_bytes()],
        bump
    )]
    pub version: Account<'info, StrategyVersionAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseStrategy<'info> {
    pub creator: Signer<'info>,
    #[account(
        mut,
        seeds = [b"strategy", strategy.creator.as_ref(), strategy.strategy_id.as_ref()],
        bump = strategy.bump
    )]
    pub strategy: Account<'info, StrategyAccount>,
}

#[account]
#[derive(InitSpace)]
pub struct StrategyAccount {
    pub creator: Pubkey,
    pub strategy_id: [u8; 16],
    pub current_version: u32,
    pub current_allocation_hash: [u8; 32],
    pub status: StrategyStatus,
    pub bump: u8,
    pub created_at: i64,
    pub updated_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct StrategyVersionAccount {
    pub strategy: Pubkey,
    pub creator: Pubkey,
    pub version: u32,
    pub allocation_hash: [u8; 32],
    pub bump: u8,
    pub created_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum StrategyStatus {
    Active,
    Closed,
}

#[event]
pub struct StrategyCreated {
    pub creator: Pubkey,
    pub strategy: Pubkey,
    pub version: u32,
    pub allocation_hash: [u8; 32],
}

#[event]
pub struct RebalancePublished {
    pub creator: Pubkey,
    pub strategy: Pubkey,
    pub version: u32,
    pub allocation_hash: [u8; 32],
}

#[event]
pub struct StrategyClosed {
    pub creator: Pubkey,
    pub strategy: Pubkey,
}

#[error_code]
pub enum RegistryError {
    #[msg("Only the strategy creator can modify this strategy.")]
    Unauthorized,
    #[msg("Strategy is closed.")]
    StrategyClosed,
    #[msg("Invalid strategy status transition.")]
    InvalidTransition,
    #[msg("Strategy version overflow.")]
    VersionOverflow,
}

fn write_version(
    version_account: &mut Account<StrategyVersionAccount>,
    strategy: Pubkey,
    creator: Pubkey,
    version: u32,
    allocation_hash: [u8; 32],
    bump: u8,
    created_at: i64,
) {
    version_account.strategy = strategy;
    version_account.creator = creator;
    version_account.version = version;
    version_account.allocation_hash = allocation_hash;
    version_account.bump = bump;
    version_account.created_at = created_at;
}
