//! Post-purchase feedback with seller rating aggregation.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::ObscraError;
use crate::events::FeedbackPosted;
use crate::state::*;
use crate::utils::now;

pub fn post_feedback(
    ctx: Context<SubmitFeedback>,
    rating: u8,
    comment: String,
) -> Result<()> {
    require!((FEEDBACK_MIN_STARS..=FEEDBACK_MAX_STARS).contains(&rating), ObscraError::RatingInvalid);
    require!(comment.len() <= FEEDBACK_CAP, ObscraError::ReviewTooLong);

    let listing = &ctx.accounts.listing;
    require!(listing.status == OfferStatus::Sold, ObscraError::InvalidStatus);
    require_keys_eq!(listing.buyer, ctx.accounts.reviewer.key(), ObscraError::FeedbackSenderNotBuyer);

    let review = &mut ctx.accounts.review;
    review.reviewer = ctx.accounts.reviewer.key();
    review.target = listing.seller;
    review.order = listing.key();
    review.rating = rating;
    review.comment = comment;
    review.created_at = now()?;
    review.bump = ctx.bumps.review;

    let profile = &mut ctx.accounts.seller_profile;
    profile.seller_rating_sum = profile.seller_rating_sum.saturating_add(rating as u64);
    profile.seller_rating_count = profile.seller_rating_count.saturating_add(1);

    emit!(FeedbackPosted {
        review: review.key(),
        target: review.target,
        reviewer: review.reviewer,
        rating,
    });
    Ok(())
}

// ── Account structs ─────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct SubmitFeedback<'info> {
    #[account(
        seeds = [SEED_OFFER, listing.seller.as_ref(), &listing.offer_id.to_le_bytes()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, Offer>,
    #[account(
        init,
        payer = reviewer,
        space = 8 + Review::SIZE,
        seeds = [SEED_FEEDBACK, listing.key().as_ref(), reviewer.key().as_ref()],
        bump
    )]
    pub review: Account<'info, Review>,
    #[account(
        mut,
        seeds = [SEED_TRADER, listing.seller.as_ref()],
        bump = seller_profile.bump,
    )]
    pub seller_profile: Account<'info, TraderProfile>,
    #[account(mut)]
    pub reviewer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
