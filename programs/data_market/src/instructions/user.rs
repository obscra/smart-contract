//! Trader registration and profile updates.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::ObscraError;
use crate::events::TraderOnboarded;
use crate::state::*;
use crate::utils::now;

pub fn register_trader(
    ctx: Context<RegisterTrader>,
    username: String,
    avatar_uri: String,
) -> Result<()> {
    require!(username.len() <= USERNAME_CAP, ObscraError::UsernameTooLong);
    require!(avatar_uri.len() <= URI_CAP, ObscraError::UriTooLong);

    let profile = &mut ctx.accounts.profile;
    profile.wallet = ctx.accounts.wallet.key();
    profile.username = username.clone();
    profile.avatar_uri = avatar_uri;
    profile.joined_at = now()?;
    profile.seller_rating_sum = 0;
    profile.seller_rating_count = 0;
    profile.buyer_rating_sum = 0;
    profile.buyer_rating_count = 0;
    profile.total_sales = 0;
    profile.total_purchases = 0;
    profile.total_volume_lamports = 0;
    profile.disputes_opened = 0;
    profile.disputes_lost = 0;
    profile.bump = ctx.bumps.profile;

    emit!(TraderOnboarded {
        profile: profile.key(),
        wallet: profile.wallet,
        username,
    });
    Ok(())
}

pub fn update_trader(
    ctx: Context<UpdateTrader>,
    username: Option<String>,
    avatar_uri: Option<String>,
) -> Result<()> {
    let profile = &mut ctx.accounts.profile;
    require_keys_eq!(profile.wallet, ctx.accounts.wallet.key(), ObscraError::Unauthorized);

    if let Some(u) = username {
        require!(u.len() <= USERNAME_CAP, ObscraError::UsernameTooLong);
        profile.username = u;
    }
    if let Some(a) = avatar_uri {
        require!(a.len() <= URI_CAP, ObscraError::UriTooLong);
        profile.avatar_uri = a;
    }
    Ok(())
}

// ── Account structs ─────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RegisterTrader<'info> {
    #[account(
        init,
        payer = wallet,
        space = 8 + TraderProfile::SIZE,
        seeds = [SEED_TRADER, wallet.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, TraderProfile>,
    #[account(mut)]
    pub wallet: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateTrader<'info> {
    #[account(
        mut,
        seeds = [SEED_TRADER, wallet.key().as_ref()],
        bump = profile.bump
    )]
    pub profile: Account<'info, TraderProfile>,
    pub wallet: Signer<'info>,
}
