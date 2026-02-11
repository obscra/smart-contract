//! English ascending auction — open, bid, settle, cancel.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::ObscraError;
use crate::events::*;
use crate::state::*;
use crate::utils::{now, drain_pda, compute_fee_split, send_lamports};

#[allow(clippy::too_many_arguments)]
pub fn open_english(
    ctx: Context<CreateEnglish>,
    auction_id: u64,
    start_price: u64,
    min_increment: u64,
    duration_secs: i64,
    title: String,
    description: String,
    category: String,
    data_uri: String,
    encrypted_key_hash: [u8; DIGEST_LEN],
    royalty_bps: u16,
) -> Result<()> {
    require!(!ctx.accounts.protocol.paused, ObscraError::ProtocolHalted);
    require!(start_price > 0, ObscraError::InvalidPrice);
    require!(min_increment > 0, ObscraError::InvalidIncrement);
    require!(
        (ENGLISH_MIN_SECS..=ENGLISH_MAX_SECS).contains(&duration_secs),
        ObscraError::DurationBeyondLimits
    );
    require!(royalty_bps <= ROYALTY_CEILING_BPS, ObscraError::RoyaltyTooHigh);
    require!(title.len() <= TITLE_CAP, ObscraError::TitleTooLong);
    require!(description.len() <= DESC_CAP, ObscraError::DescriptionTooLong);
    require!(category.len() <= CATEGORY_CAP, ObscraError::CategoryTooLong);
    require!(data_uri.len() <= URI_CAP, ObscraError::UriTooLong);

    let start_time = now()?;
    let auction = &mut ctx.accounts.auction;
    auction.seller = ctx.accounts.seller.key();
    auction.auction_id = auction_id;
    auction.start_price = start_price;
    auction.min_increment = min_increment;
    auction.highest_bid = 0;
    auction.highest_bidder = Pubkey::default();
    auction.bid_count = 0;
    auction.start_time = start_time;
    auction.end_time = start_time
        .checked_add(duration_secs)
        .ok_or(ObscraError::ArithmeticOverflow)?;
    auction.title = title;
    auction.description = description;
    auction.category = category;
    auction.data_uri = data_uri;
    auction.encrypted_key_hash = encrypted_key_hash;
    auction.royalty_bps = royalty_bps;
    auction.status = EnglishStatus::Active;
    auction.bump = ctx.bumps.auction;
    auction.escrow_bump = ctx.bumps.escrow;

    let mp = &mut ctx.accounts.protocol;
    mp.auction_count = mp.auction_count.saturating_add(1);

    emit!(EnglishOpened {
        auction: auction.key(),
        seller: auction.seller,
        start_price,
        min_increment,
        end_time: auction.end_time,
    });
    Ok(())
}

pub fn submit_english_bid(ctx: Context<SubmitEnglishBid>, amount: u64) -> Result<()> {
    let auction = &mut ctx.accounts.auction;
    let t = now()?;

    require!(auction.status == EnglishStatus::Active, ObscraError::EnglishNotLive);
    require!(t < auction.end_time, ObscraError::EnglishExpired);
    require!(ctx.accounts.bidder.key() != auction.seller, ObscraError::SelfBidProhibited);

    let min_required = if auction.highest_bid == 0 {
        auction.start_price
    } else {
        auction
            .highest_bid
            .checked_add(auction.min_increment)
            .ok_or(ObscraError::ArithmeticOverflow)?
    };
    require!(amount >= min_required, ObscraError::BidTooLow);

    if auction.highest_bid > 0 {
        let prev = ctx
            .accounts
            .previous_bidder
            .as_ref()
            .ok_or(ObscraError::MissingPreviousBidder)?;
        require_keys_eq!(
            prev.key(),
            auction.highest_bidder,
            ObscraError::WrongPreviousBidder
        );
        drain_pda(
            &ctx.accounts.escrow.to_account_info(),
            &prev.to_account_info(),
            auction.highest_bid,
        )?;
    }

    send_lamports(
        &ctx.accounts.system_program,
        &ctx.accounts.bidder.to_account_info(),
        &ctx.accounts.escrow.to_account_info(),
        amount,
    )?;

    auction.highest_bid = amount;
    auction.highest_bidder = ctx.accounts.bidder.key();
    auction.bid_count = auction.bid_count.saturating_add(1);

    if auction.end_time - t < SNIPE_GUARD_WINDOW {
        auction.end_time = t
            .checked_add(SNIPE_GUARD_EXTEND)
            .ok_or(ObscraError::ArithmeticOverflow)?;
    }

    emit!(EnglishBidSubmitted {
        auction: auction.key(),
        bidder: auction.highest_bidder,
        amount,
        new_end_time: auction.end_time,
    });
    Ok(())
}

pub fn settle_english(ctx: Context<SettleEnglish>) -> Result<()> {
    let auction = &mut ctx.accounts.auction;
    let t = now()?;

    require!(auction.status == EnglishStatus::Active, ObscraError::EnglishNotLive);
    require!(t >= auction.end_time, ObscraError::EnglishStillLive);

    if auction.highest_bid == 0 {
        auction.status = EnglishStatus::EndedNoBids;
        emit!(EnglishSettled {
            auction: auction.key(),
            winner: Pubkey::default(),
            amount: 0,
            fee: 0,
        });
        return Ok(());
    }

    require_keys_eq!(
        ctx.accounts.winner.key(),
        auction.highest_bidder,
        ObscraError::WrongWinner
    );
    require_keys_eq!(
        ctx.accounts.seller.key(),
        auction.seller,
        ObscraError::Unauthorized
    );

    let (fee, royalty, seller_net) =
        compute_fee_split(auction.highest_bid, ctx.accounts.protocol.fee_bps, auction.royalty_bps)?;

    drain_pda(
        &ctx.accounts.escrow.to_account_info(),
        &ctx.accounts.seller.to_account_info(),
        seller_net,
    )?;
    drain_pda(
        &ctx.accounts.escrow.to_account_info(),
        &ctx.accounts.treasury.to_account_info(),
        fee.checked_add(royalty).ok_or(ObscraError::ArithmeticOverflow)?,
    )?;

    auction.status = EnglishStatus::Settled;

    emit!(EnglishSettled {
        auction: auction.key(),
        winner: auction.highest_bidder,
        amount: auction.highest_bid,
        fee,
    });
    Ok(())
}

pub fn cancel_english(ctx: Context<CancelEnglish>) -> Result<()> {
    let auction = &mut ctx.accounts.auction;
    require!(auction.status == EnglishStatus::Active, ObscraError::EnglishNotLive);
    require!(auction.highest_bid == 0, ObscraError::CancelBlockedByBids);
    require_keys_eq!(auction.seller, ctx.accounts.seller.key(), ObscraError::Unauthorized);
    auction.status = EnglishStatus::Cancelled;
    emit!(EnglishCancelled { auction: auction.key() });
    Ok(())
}

// ── Account structs ─────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(auction_id: u64)]
pub struct CreateEnglish<'info> {
    #[account(mut, seeds = [SEED_PROTOCOL], bump = protocol.bump)]
    pub protocol: Account<'info, ProtocolState>,
    #[account(
        init,
        payer = seller,
        space = 8 + Auction::SIZE,
        seeds = [SEED_ENGLISH, seller.key().as_ref(), &auction_id.to_le_bytes()],
        bump
    )]
    pub auction: Account<'info, Auction>,
    /// CHECK: lamport-only escrow PDA
    #[account(seeds = [SEED_VAULT, auction.key().as_ref()], bump)]
    /// CHECK: escrow vault PDA — seeds verified by program; lamport-only, no deserialization
    pub escrow: UncheckedAccount<'info>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitEnglishBid<'info> {
    #[account(
        mut,
        seeds = [SEED_ENGLISH, auction.seller.as_ref(), &auction.auction_id.to_le_bytes()],
        bump = auction.bump,
    )]
    pub auction: Account<'info, Auction>,
    /// CHECK: escrow PDA, lamports-only
    #[account(
        mut,
        seeds = [SEED_VAULT, auction.key().as_ref()],
        bump = auction.escrow_bump
    )]
    /// CHECK: escrow vault PDA — seeds verified by program; lamport-only, no deserialization
    pub escrow: UncheckedAccount<'info>,
    #[account(mut)]
    pub bidder: Signer<'info>,
    /// CHECK: must equal auction.highest_bidder when present
    #[account(mut)]
    /// CHECK: refund recipient — validated against auction previous highest_bidder
    pub previous_bidder: Option<UncheckedAccount<'info>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleEnglish<'info> {
    #[account(seeds = [SEED_PROTOCOL], bump = protocol.bump)]
    pub protocol: Account<'info, ProtocolState>,
    #[account(
        mut,
        seeds = [SEED_ENGLISH, auction.seller.as_ref(), &auction.auction_id.to_le_bytes()],
        bump = auction.bump,
    )]
    pub auction: Account<'info, Auction>,
    /// CHECK: escrow PDA
    #[account(
        mut,
        seeds = [SEED_VAULT, auction.key().as_ref()],
        bump = auction.escrow_bump
    )]
    /// CHECK: escrow vault PDA — seeds verified by program; lamport-only, no deserialization
    pub escrow: UncheckedAccount<'info>,
    /// CHECK: validated vs auction.seller
    #[account(mut)]
    /// CHECK: seller receives payment — address validated against listing/auction state
    pub seller: UncheckedAccount<'info>,
    /// CHECK: validated vs auction.highest_bidder
    #[account(mut)]
    /// CHECK: auction winner — address validated against auction highest_bidder field
    pub winner: UncheckedAccount<'info>,
    /// CHECK: must match protocol.treasury
    #[account(mut, address = protocol.treasury)]
    /// CHECK: treasury receives fees — address validated against protocol state
    pub treasury: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CancelEnglish<'info> {
    #[account(
        mut,
        seeds = [SEED_ENGLISH, seller.key().as_ref(), &auction.auction_id.to_le_bytes()],
        bump = auction.bump,
    )]
    pub auction: Account<'info, Auction>,
    pub seller: Signer<'info>,
}
