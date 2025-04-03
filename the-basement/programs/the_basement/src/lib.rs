use anchor_lang::prelude::*;
use anchor_spl::{token::{self, Token, TokenAccount, Transfer, Mint}, associated_token::AssociatedToken};
use std::collections::HashMap;
use anchor_lang::solana_program::sysvar::rent::Rent;

declare_id!("GUrBCCME6Cmp9NA4yNSYy1BvKczYPwnqdXSVFAd21sAA");

#[program]
pub mod the_basement {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, bins_count: u8) -> Result<()> {
        let yield_farm = &mut ctx.accounts.yield_farm;
        yield_farm.authority = ctx.accounts.authority.key();
        yield_farm.token_mint = ctx.accounts.token_mint.key();
        yield_farm.total_deposits = 0;
        yield_farm.bins_count = bins_count;
        yield_farm.bin_allocations = vec![];
        yield_farm.bump = *ctx.bumps.get("yield_farm").unwrap();
        
        // Default allocation strategy
        // 80% to 20 BIN Step, 10% to 4 BIN Step, 10% to 1 BIN Step
        yield_farm.bin_allocations.push(BinAllocation {
            bin_type: BinType::LargeBin,
            allocation_percentage: 80,
            current_allocation: 0,
            step_size: 657, // 6.57%
            bin_count: 20,
        });
        
        yield_farm.bin_allocations.push(BinAllocation {
            bin_type: BinType::MediumBin,
            allocation_percentage: 10,
            current_allocation: 0,
            step_size: 135, // 1.35%
            bin_count: 4,
        });
        
        yield_farm.bin_allocations.push(BinAllocation {
            bin_type: BinType::SmallBin,
            allocation_percentage: 10,
            current_allocation: 0,
            step_size: 34, // 0.34%
            bin_count: 1,
        });
        
        Ok(())
    }

    pub fn create_vault(ctx: Context<CreateVault>) -> Result<()> {
        // This instruction initializes the vault token account for the yield farm
        // The vault will be a PDA owned by the yield farm
        msg!("Vault created for yield farm");
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        // Transfer tokens from user to yield farm vault
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.yield_farm_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, amount)?;
        
        // Update user deposit account
        let user_deposit = &mut ctx.accounts.user_deposit;
        let yield_farm = &mut ctx.accounts.yield_farm;
        
        user_deposit.user = ctx.accounts.user.key();
        user_deposit.amount += amount;
        user_deposit.last_update_time = Clock::get()?.unix_timestamp;
        
        // Update yield farm state
        yield_farm.total_deposits += amount;
        
        // Allocate funds according to the strategy
        // Note: In a real implementation, we would call external contracts to interact with DEX LPs
        // This would be handled by the off-chain keeper for efficiency
        
        msg!("Deposited {} tokens", amount);
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let user_deposit = &mut ctx.accounts.user_deposit;
        require!(user_deposit.amount >= amount, ErrorCode::InsufficientFunds);
        
        let yield_farm = &ctx.accounts.yield_farm;
        let seeds = &[
            b"yield_farm".as_ref(),
            yield_farm.token_mint.as_ref(),
            &[yield_farm.bump],
        ];
        let signer = &[&seeds[..]];
        
        // Transfer tokens from yield farm vault to user
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.yield_farm_vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.yield_farm.to_account_info(),
            },
            signer,
        );
        token::transfer(transfer_ctx, amount)?;
        
        // Update user deposit account
        user_deposit.amount -= amount;
        user_deposit.last_update_time = Clock::get()?.unix_timestamp;
        
        // Update yield farm state
        ctx.accounts.yield_farm.total_deposits -= amount;
        
        msg!("Withdrawn {} tokens", amount);
        Ok(())
    }
    
    pub fn rebalance(ctx: Context<Rebalance>) -> Result<()> {
        // Only keeper can call this function
        require!(
            ctx.accounts.keeper.key() == ctx.accounts.yield_farm.authority,
            ErrorCode::Unauthorized
        );
        
        // Logic for rebalancing based on current yields and price movements
        // In a real implementation, this would be triggered by the off-chain keeper
        // and would interact with DEX pools to optimize allocations
        
        msg!("Rebalanced yield farm allocations");
        Ok(())
    }
    
    pub fn compound_rewards(ctx: Context<CompoundRewards>) -> Result<()> {
        // Only keeper can call this function
        require!(
            ctx.accounts.keeper.key() == ctx.accounts.yield_farm.authority,
            ErrorCode::Unauthorized
        );
        
        // Logic for claiming rewards from LPs and reinvesting them
        // In a real implementation, this would be triggered by the off-chain keeper
        
        msg!("Compounded rewards");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + YieldFarm::INIT_SPACE,
        seeds = [b"yield_farm".as_ref(), token_mint.key().as_ref()],
        bump
    )]
    pub yield_farm: Account<'info, YieldFarm>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"yield_farm".as_ref(), yield_farm.token_mint.as_ref()],
        bump = yield_farm.bump
    )]
    pub yield_farm: Account<'info, YieldFarm>,
    
    #[account(
        init,
        payer = authority,
        seeds = [b"vault".as_ref(), yield_farm.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = yield_farm
    )]
    pub yield_farm_vault: Account<'info, TokenAccount>,
    
    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        constraint = user_token_account.owner == user.key(),
        constraint = user_token_account.mint == yield_farm.token_mint
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"yield_farm".as_ref(), yield_farm.token_mint.as_ref()],
        bump = yield_farm.bump
    )]
    pub yield_farm: Account<'info, YieldFarm>,
    
    #[account(
        mut,
        seeds = [b"vault".as_ref(), yield_farm.key().as_ref()],
        bump,
        token::mint = yield_farm.token_mint,
        token::authority = yield_farm
    )]
    pub yield_farm_vault: Account<'info, TokenAccount>,
    
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserDeposit::INIT_SPACE,
        seeds = [b"user_deposit".as_ref(), user.key().as_ref(), yield_farm.key().as_ref()],
        bump
    )]
    pub user_deposit: Account<'info, UserDeposit>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        constraint = user_token_account.owner == user.key(),
        constraint = user_token_account.mint == yield_farm.token_mint
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"yield_farm".as_ref(), yield_farm.token_mint.as_ref()],
        bump = yield_farm.bump
    )]
    pub yield_farm: Account<'info, YieldFarm>,
    
    #[account(
        mut,
        seeds = [b"vault".as_ref(), yield_farm.key().as_ref()],
        bump,
        token::mint = yield_farm.token_mint,
        token::authority = yield_farm
    )]
    pub yield_farm_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"user_deposit".as_ref(), user.key().as_ref(), yield_farm.key().as_ref()],
        bump,
        constraint = user_deposit.user == user.key()
    )]
    pub user_deposit: Account<'info, UserDeposit>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Rebalance<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"yield_farm".as_ref(), yield_farm.token_mint.as_ref()],
        bump = yield_farm.bump
    )]
    pub yield_farm: Account<'info, YieldFarm>,
}

#[derive(Accounts)]
pub struct CompoundRewards<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"yield_farm".as_ref(), yield_farm.token_mint.as_ref()],
        bump = yield_farm.bump
    )]
    pub yield_farm: Account<'info, YieldFarm>,
}

#[account]
pub struct YieldFarm {
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub total_deposits: u64,
    pub bins_count: u8,
    pub bin_allocations: Vec<BinAllocation>,
    pub bump: u8,
}

impl YieldFarm {
    pub const INIT_SPACE: usize = 32 + 32 + 8 + 1 + (4 + 3 * BinAllocation::SIZE) + 1;
}

#[account]
pub struct UserDeposit {
    pub user: Pubkey,
    pub amount: u64,
    pub last_update_time: i64,
}

impl UserDeposit {
    pub const INIT_SPACE: usize = 32 + 8 + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum BinType {
    LargeBin,
    MediumBin,
    SmallBin,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BinAllocation {
    pub bin_type: BinType,
    pub allocation_percentage: u8,
    pub current_allocation: u64,
    pub step_size: u16,  // in basis points (1/100 of a percent)
    pub bin_count: u8,
}

impl BinAllocation {
    pub const SIZE: usize = 1 + 1 + 8 + 2 + 1;
}

#[error_code]
pub enum ErrorCode {
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid allocation")]
    InvalidAllocation,
}
