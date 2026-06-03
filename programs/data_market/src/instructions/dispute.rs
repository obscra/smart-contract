//! Buyer claim submission and arbitrator resolution.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::ObscraError;
use crate::events::*;
use crate::state::*;
use crate::utils::now;

pub fn open_claim(
    ctx: Context<OpenClaim>,
    reason: String,
) -> Result<()> {
    require!(reason.len() <= CLAIM_REASON_CAP, ObscraError::DisputeReasonTooLong);

    let listing = &ctx.accounts.listing;
    require!(listing.status == OfferStatus::Sold, ObscraError::InvalidStatus);
    require_keys_eq!(listing.buyer, ctx.accounts.opener.key(), ObscraError::Unauthorized);

    let t = now()?;
    let window_end = listing.settled_at.saturating_add(7 * DAY_IN_SECONDS);
    require!(t <= window_end, ObscraError::ClaimWindowExpired);

    let d = &mut ctx.accounts.dispute;
    d.order = listing.key();
    d.buyer = listing.buyer;
    d.seller = listing.seller;
    d.opener = ctx.accounts.opener.key();
    d.reason = reason;
    d.opened_at = t;
    d.resolved_at = 0;
    d.refund_amount = 0;
    d.buyer_favored = false;
    d.status = ClaimStatus::Open;
    d.bump = ctx.bumps.dispute;

    ctx.accounts.protocol.dispute_count =
        ctx.accounts.protocol.dispute_count.saturating_add(1);

    if let Some(p) = ctx.accounts.buyer_profile.as_mut() {
        p.disputes_opened = p.disputes_opened.saturating_add(1);
    }

    emit!(ClaimOpened {
        dispute: d.key(),
        order: d.order,
        opener: d.opener,
    });
    Ok(())
}

pub fn resolve_claim(
    ctx: Context<ResolveClaim>,
    buyer_favored: bool,
    refund_amount: u64,
) -> Result<()> {
    let mp = &ctx.accounts.protocol;
    require_keys_eq!(mp.arbitrator, ctx.accounts.arbitrator.key(), ObscraError::UnauthorizedArbiter);

    let d = &mut ctx.accounts.dispute;
    require!(d.status == ClaimStatus::Open, ObscraError::ClaimAlreadySettled);

    d.resolved_at = now()?;
    d.buyer_favored = buyer_favored;
    d.refund_amount = refund_amount;
    d.status = if buyer_favored { ClaimStatus::Resolved } else { ClaimStatus::Rejected };

    if !buyer_favored {
        if let Some(p) = ctx.accounts.buyer_profile.as_mut() {
            p.disputes_lost = p.disputes_lost.saturating_add(1);
        }
    }

    emit!(ClaimResolved {
        dispute: d.key(),
        outcome_buyer_favored: buyer_favored,
        refunded_amount: refund_amount,
    });
    Ok(())
}

// ── Account structs ─────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct OpenClaim<'info> {
    #[account(mut, seeds = [SEED_PROTOCOL], bump = protocol.bump)]
    pub protocol: Account<'info, ProtocolState>,
    #[account(
        seeds = [SEED_OFFER, listing.seller.as_ref(), &listing.offer_id.to_le_bytes()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, Offer>,
    #[account(
        init,
        payer = opener,
        space = 8 + Dispute::SIZE,
        seeds = [SEED_CLAIM, listing.key().as_ref()],
        bump
    )]
    pub dispute: Account<'info, Dispute>,
    #[account(
        mut,
        seeds = [SEED_TRADER, opener.key().as_ref()],
        bump = buyer_profile.bump,
    )]
    pub buyer_profile: Option<Account<'info, TraderProfile>>,
    #[account(mut)]
    pub opener: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveClaim<'info> {
    #[account(seeds = [SEED_PROTOCOL], bump = protocol.bump)]
    pub protocol: Account<'info, ProtocolState>,
    #[account(
        mut,
        seeds = [SEED_CLAIM, dispute.order.as_ref()],
        bump = dispute.bump,
    )]
    pub dispute: Account<'info, Dispute>,
    #[account(
        mut,
        seeds = [SEED_TRADER, dispute.buyer.as_ref()],
        bump = buyer_profile.bump,
    )]
    pub buyer_profile: Option<Account<'info, TraderProfile>>,
    pub arbitrator: Signer<'info>,
}
