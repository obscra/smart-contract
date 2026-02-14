//! Declining-price auction — open, fill, cancel.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::ObscraError;
use crate::events::*;
use crate::state::*;
use crate::utils::{interpolate_declining_price, now, compute_fee_split, send_lamports};

#[allow(clippy::too_many_arguments)]
pub fn open_declining(
    ctx: Context<CreateDeclining>,
    auction_id: u64,
    start_price: u64,
    floor_price: u64,
    duration_secs: i64,
    tick_seconds: i64,
    title: String,
    description: String,
    category: String,
    data_uri: String,
    encrypted_key_hash: [u8; DIGEST_LEN],
    royalty_bps: u16,
) -> Result<()> {
    require!(!ctx.accounts.protocol.paused, ObscraError::ProtocolHalted);
    require!(start_price > floor_price && floor_price > 0, ObscraError::DecliningRangeInvalid);
    require!(tick_seconds >= DECLINING_MIN_TICK, ObscraError::DecliningTickTooShort);
    require!(
        (ENGLISH_MIN_SECS..=ENGLISH_MAX_SECS).contains(&duration_secs),
        ObscraError::DurationBeyondLimits
    );
    require!(royalty_bps <= ROYALTY_CEILING_BPS, ObscraError::RoyaltyTooHigh);
    require!(title.len() <= TITLE_CAP, ObscraError::TitleTooLong);
    require!(description.len() <= DESC_CAP, ObscraError::DescriptionTooLong);
    require!(category.len() <= CATEGORY_CAP, ObscraError::CategoryTooLong);
    require!(data_uri.len() <= URI_CAP, ObscraError::UriTooLong);

    let t = now()?;
    let da = &mut ctx.accounts.auction;
    da.seller = ctx.accounts.seller.key();
    da.auction_id = auction_id;
    da.start_price = start_price;
    da.floor_price = floor_price;
    da.start_time = t;
    da.end_time = t.checked_add(duration_secs).ok_or(ObscraError::ArithmeticOverflow)?;
    da.tick_seconds = tick_seconds;
    da.title = title;
    da.description = description;
    da.category = category;
    da.data_uri = data_uri;
    da.encrypted_key_hash = encrypted_key_hash;
    da.royalty_bps = royalty_bps;
    da.buyer = Pubkey::default();
    da.filled_price = 0;
    da.status = DecliningStatus::Active;
    da.bump = ctx.bumps.auction;

    ctx.accounts.protocol.dutch_count =
        ctx.accounts.protocol.dutch_count.saturating_add(1);

    emit!(DecliningOpened {
        auction: da.key(),
        seller: da.seller,
        start_price,
        floor_price,
        start_time: da.start_time,
        end_time: da.end_time,
    });
    Ok(())
}

pub fn fill_declining(ctx: Context<FillDeclining>, max_price: u64) -> Result<()> {
    require!(!ctx.accounts.protocol.paused, ObscraError::ProtocolHalted);

    let da = &mut ctx.accounts.auction;
    require!(da.status == DecliningStatus::Active, ObscraError::InvalidStatus);
    require!(ctx.accounts.buyer.key() != da.seller, ObscraError::SelfFillForbidden);

    let t = now()?;
    require!(t >= da.start_time, ObscraError::DecliningNotStarted);

    let current_price = interpolate_declining_price(t, da.start_time, da.end_time, da.start_price, da.floor_price)?;
    require!(current_price <= max_price, ObscraError::BidTooLow);

    let (fee, royalty, seller_net) =
        compute_fee_split(current_price, ctx.accounts.protocol.fee_bps, da.royalty_bps)?;

    send_lamports(
        &ctx.accounts.system_program,
        &ctx.accounts.buyer.to_account_info(),
        &ctx.accounts.seller.to_account_info(),
        seller_net,
    )?;
    send_lamports(
        &ctx.accounts.system_program,
        &ctx.accounts.buyer.to_account_info(),
        &ctx.accounts.treasury.to_account_info(),
        fee.checked_add(royalty).ok_or(ObscraError::ArithmeticOverflow)?,
    )?;

    da.buyer = ctx.accounts.buyer.key();
    da.filled_price = current_price;
    da.status = DecliningStatus::Filled;

    emit!(DecliningFilled {
        auction: da.key(),
        buyer: da.buyer,
        price: current_price,
    });
    Ok(())
}

pub fn cancel_declining(ctx: Context<CancelDeclining>) -> Result<()> {
    let da = &mut ctx.accounts.auction;
    require!(da.status == DecliningStatus::Active, ObscraError::InvalidStatus);
    require_keys_eq!(da.seller, ctx.accounts.seller.key(), ObscraError::Unauthorized);
    da.status = DecliningStatus::Cancelled;
    Ok(())
}

// ── Account structs ─────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(auction_id: u64)]
pub struct CreateDeclining<'info> {
    #[account(mut, seeds = [SEED_PROTOCOL], bump = protocol.bump)]
    pub protocol: Account<'info, ProtocolState>,
    #[account(
        init,
        payer = seller,
        space = 8 + DutchAuction::SIZE,
        seeds = [SEED_DECLINING, seller.key().as_ref(), &auction_id.to_le_bytes()],
        bump
    )]
    pub auction: Account<'info, DutchAuction>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FillDeclining<'info> {
    #[account(seeds = [SEED_PROTOCOL], bump = protocol.bump)]
    pub protocol: Account<'info, ProtocolState>,
    #[account(
        mut,
        seeds = [SEED_DECLINING, auction.seller.as_ref(), &auction.auction_id.to_le_bytes()],
        bump = auction.bump,
        has_one = seller,
    )]
    pub auction: Account<'info, DutchAuction>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: validated via has_one
    #[account(mut)]
    /// CHECK: seller receives payment — address validated against listing/auction state
    pub seller: UncheckedAccount<'info>,
    /// CHECK: must match protocol.treasury
    #[account(mut, address = protocol.treasury)]
    /// CHECK: treasury receives fees — address validated against protocol state
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelDeclining<'info> {
    #[account(
        mut,
        seeds = [SEED_DECLINING, seller.key().as_ref(), &auction.auction_id.to_le_bytes()],
        bump = auction.bump,
    )]
    pub auction: Account<'info, DutchAuction>,
    pub seller: Signer<'info>,
}
