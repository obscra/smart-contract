//! Hidden-bid auction — commit, reveal, settle, refund.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;

use crate::constants::*;
use crate::errors::ObscraError;
use crate::events::*;
use crate::state::*;
use crate::utils::{now, drain_pda, compute_fee_split, send_lamports};

#[allow(clippy::too_many_arguments)]
pub fn open_hidden_bid(
    ctx: Context<CreateHiddenBid>,
    auction_id: u64,
    reserve_price: u64,
    commit_secs: i64,
    reveal_secs: i64,
    title: String,
    description: String,
    category: String,
    data_uri: String,
    encrypted_key_hash: [u8; DIGEST_LEN],
) -> Result<()> {
    require!(!ctx.accounts.protocol.paused, ObscraError::ProtocolHalted);
    require!(reserve_price > 0, ObscraError::InvalidPrice);
    require!(
        commit_secs >= ENGLISH_MIN_SECS && reveal_secs >= ENGLISH_MIN_SECS,
        ObscraError::DurationBeyondLimits
    );
    require!(title.len() <= TITLE_CAP, ObscraError::TitleTooLong);
    require!(description.len() <= DESC_CAP, ObscraError::DescriptionTooLong);
    require!(category.len() <= CATEGORY_CAP, ObscraError::CategoryTooLong);
    require!(data_uri.len() <= URI_CAP, ObscraError::UriTooLong);

    let t = now()?;
    let sa = &mut ctx.accounts.auction;
    sa.seller = ctx.accounts.seller.key();
    sa.auction_id = auction_id;
    sa.reserve_price = reserve_price;
    sa.commit_end = t.checked_add(commit_secs).ok_or(ObscraError::ArithmeticOverflow)?;
    sa.reveal_end = sa.commit_end.checked_add(reveal_secs).ok_or(ObscraError::ArithmeticOverflow)?;
    sa.highest_bid = 0;
    sa.highest_bidder = Pubkey::default();
    sa.commits = 0;
    sa.reveals = 0;
    sa.title = title;
    sa.description = description;
    sa.category = category;
    sa.data_uri = data_uri;
    sa.encrypted_key_hash = encrypted_key_hash;
    sa.status = HiddenBidStatus::Commit;
    sa.bump = ctx.bumps.auction;

    ctx.accounts.protocol.sealed_count =
        ctx.accounts.protocol.sealed_count.saturating_add(1);

    emit!(HiddenBidOpened {
        auction: sa.key(),
        seller: sa.seller,
        commit_end: sa.commit_end,
        reveal_end: sa.reveal_end,
    });
    Ok(())
}

pub fn commit_hidden(
    ctx: Context<CommitHidden>,
    commitment: [u8; DIGEST_LEN],
    deposit: u64,
) -> Result<()> {
    let sa = &mut ctx.accounts.auction;
    let t = now()?;
    require!(sa.status == HiddenBidStatus::Commit, ObscraError::InvalidStatus);
    require!(t < sa.commit_end, ObscraError::CommitWindowClosed);
    require!(ctx.accounts.bidder.key() != sa.seller, ObscraError::SelfBidProhibited);
    require!(deposit >= sa.reserve_price, ObscraError::DepositTooLow);

    let bid = &mut ctx.accounts.bid;
    bid.auction = sa.key();
    bid.bidder = ctx.accounts.bidder.key();
    bid.commitment = commitment;
    bid.deposit = deposit;
    bid.revealed_amount = 0;
    bid.revealed = false;
    bid.refunded = false;
    bid.bump = ctx.bumps.bid;

    send_lamports(
        &ctx.accounts.system_program,
        &ctx.accounts.bidder.to_account_info(),
        &ctx.accounts.escrow.to_account_info(),
        deposit,
    )?;

    sa.commits = sa.commits.saturating_add(1);

    emit!(HiddenBidCommitted {
        auction: sa.key(),
        bidder: bid.bidder,
        deposit,
    });
    Ok(())
}

pub fn reveal_hidden(
    ctx: Context<RevealHidden>,
    amount: u64,
    nonce: [u8; DIGEST_LEN],
) -> Result<()> {
    let sa = &mut ctx.accounts.auction;
    let bid = &mut ctx.accounts.bid;
    let t = now()?;

    require!(t >= sa.commit_end, ObscraError::RevealWindowPending);
    require!(t < sa.reveal_end, ObscraError::RevealWindowClosed);
    require!(!bid.revealed, ObscraError::InvalidStatus);
    require!(amount <= bid.deposit, ObscraError::DepositTooLow);

    if sa.status == HiddenBidStatus::Commit {
        sa.status = HiddenBidStatus::Reveal;
    }

    let mut preimage = [0u8; 8 + DIGEST_LEN];
    preimage[..8].copy_from_slice(&amount.to_le_bytes());
    preimage[8..].copy_from_slice(&nonce);
    let computed = keccak::hash(&preimage).to_bytes();
    require!(computed == bid.commitment, ObscraError::CommitHashInvalid);

    bid.revealed_amount = amount;
    bid.revealed = true;
    sa.reveals = sa.reveals.saturating_add(1);

    if amount >= sa.reserve_price && amount > sa.highest_bid {
        sa.highest_bid = amount;
        sa.highest_bidder = bid.bidder;
    }

    emit!(HiddenBidRevealed {
        auction: sa.key(),
        bidder: bid.bidder,
        amount,
    });
    Ok(())
}

pub fn settle_hidden(ctx: Context<SettleHidden>) -> Result<()> {
    let sa = &mut ctx.accounts.auction;
    let t = now()?;
    require!(t >= sa.reveal_end, ObscraError::RevealWindowPending);
    require!(sa.status != HiddenBidStatus::Settled, ObscraError::InvalidStatus);

    if sa.highest_bid == 0 {
        sa.status = HiddenBidStatus::Cancelled;
        return Ok(());
    }
    require_keys_eq!(
        ctx.accounts.seller.key(),
        sa.seller,
        ObscraError::Unauthorized
    );
    require_keys_eq!(
        ctx.accounts.winner.key(),
        sa.highest_bidder,
        ObscraError::WrongWinner
    );

    let (fee, royalty, seller_net) =
        compute_fee_split(sa.highest_bid, ctx.accounts.protocol.fee_bps, 0)?;

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

    sa.status = HiddenBidStatus::Settled;

    emit!(HiddenBidSettled {
        auction: sa.key(),
        winner: sa.highest_bidder,
        amount: sa.highest_bid,
    });
    Ok(())
}

pub fn refund_hidden(ctx: Context<RefundHidden>) -> Result<()> {
    let sa = &ctx.accounts.auction;
    let bid = &mut ctx.accounts.bid;
    require!(!bid.refunded, ObscraError::InvalidStatus);
    require_keys_eq!(bid.bidder, ctx.accounts.bidder.key(), ObscraError::Unauthorized);

    let t = now()?;
    require!(t >= sa.reveal_end, ObscraError::RevealWindowPending);
    require!(bid.bidder != sa.highest_bidder, ObscraError::InvalidStatus);

    drain_pda(
        &ctx.accounts.escrow.to_account_info(),
        &ctx.accounts.bidder.to_account_info(),
        bid.deposit,
    )?;
    bid.refunded = true;
    Ok(())
}

// ── Account structs ─────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(auction_id: u64)]
pub struct CreateHiddenBid<'info> {
    #[account(mut, seeds = [SEED_PROTOCOL], bump = protocol.bump)]
    pub protocol: Account<'info, ProtocolState>,
    #[account(
        init,
        payer = seller,
        space = 8 + SealedAuction::SIZE,
        seeds = [SEED_HIDDEN, seller.key().as_ref(), &auction_id.to_le_bytes()],
        bump
    )]
    pub auction: Account<'info, SealedAuction>,
    /// CHECK: escrow PDA
    #[account(seeds = [SEED_VAULT, auction.key().as_ref()], bump)]
    /// CHECK: escrow vault PDA — seeds verified by program; lamport-only, no deserialization
    pub escrow: UncheckedAccount<'info>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CommitHidden<'info> {
    #[account(
        mut,
        seeds = [SEED_HIDDEN, auction.seller.as_ref(), &auction.auction_id.to_le_bytes()],
        bump = auction.bump,
    )]
    pub auction: Account<'info, SealedAuction>,
    #[account(
        init,
        payer = bidder,
        space = 8 + SealedBid::SIZE,
        seeds = [SEED_HIDDEN_BID, auction.key().as_ref(), bidder.key().as_ref()],
        bump
    )]
    pub bid: Account<'info, SealedBid>,
    /// CHECK: escrow PDA
    #[account(mut, seeds = [SEED_VAULT, auction.key().as_ref()], bump)]
    /// CHECK: escrow vault PDA — seeds verified by program; lamport-only, no deserialization
    pub escrow: UncheckedAccount<'info>,
    #[account(mut)]
    pub bidder: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevealHidden<'info> {
    #[account(
        mut,
        seeds = [SEED_HIDDEN, auction.seller.as_ref(), &auction.auction_id.to_le_bytes()],
        bump = auction.bump,
    )]
    pub auction: Account<'info, SealedAuction>,
    #[account(
        mut,
        seeds = [SEED_HIDDEN_BID, auction.key().as_ref(), bidder.key().as_ref()],
        bump = bid.bump,
    )]
    pub bid: Account<'info, SealedBid>,
    pub bidder: Signer<'info>,
}

#[derive(Accounts)]
pub struct SettleHidden<'info> {
    #[account(seeds = [SEED_PROTOCOL], bump = protocol.bump)]
    pub protocol: Account<'info, ProtocolState>,
    #[account(
        mut,
        seeds = [SEED_HIDDEN, auction.seller.as_ref(), &auction.auction_id.to_le_bytes()],
        bump = auction.bump,
    )]
    pub auction: Account<'info, SealedAuction>,
    /// CHECK: escrow PDA
    #[account(mut, seeds = [SEED_VAULT, auction.key().as_ref()], bump)]
    /// CHECK: escrow vault PDA — seeds verified by program; lamport-only, no deserialization
    pub escrow: UncheckedAccount<'info>,
    /// CHECK: validated against auction.seller
    #[account(mut)]
    /// CHECK: seller receives payment — address validated against listing/auction state
    pub seller: UncheckedAccount<'info>,
    /// CHECK: validated against auction.highest_bidder
    #[account(mut)]
    /// CHECK: auction winner — address validated against auction highest_bidder field
    pub winner: UncheckedAccount<'info>,
    /// CHECK: must match protocol.treasury
    #[account(mut, address = protocol.treasury)]
    /// CHECK: treasury receives fees — address validated against protocol state
    pub treasury: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct RefundHidden<'info> {
    #[account(
        seeds = [SEED_HIDDEN, auction.seller.as_ref(), &auction.auction_id.to_le_bytes()],
        bump = auction.bump,
    )]
    pub auction: Account<'info, SealedAuction>,
    #[account(
        mut,
        seeds = [SEED_HIDDEN_BID, auction.key().as_ref(), bidder.key().as_ref()],
        bump = bid.bump,
    )]
    pub bid: Account<'info, SealedBid>,
    /// CHECK: escrow PDA
    #[account(mut, seeds = [SEED_VAULT, auction.key().as_ref()], bump)]
    /// CHECK: escrow vault PDA — seeds verified by program; lamport-only, no deserialization
    pub escrow: UncheckedAccount<'info>,
    #[account(mut)]
    pub bidder: Signer<'info>,
}
