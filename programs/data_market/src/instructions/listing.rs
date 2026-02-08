//! Publish, amend, fill, and revoke fixed-price offers.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::ObscraError;
use crate::events::*;
use crate::state::*;
use crate::utils::{now, compute_fee_split, send_lamports};

#[allow(clippy::too_many_arguments)]
pub fn publish_offer(
    ctx: Context<PublishOffer>,
    offer_id: u64,
    price: u64,
    title: String,
    description: String,
    category: String,
    tags: Vec<String>,
    data_uri: String,
    preview_uri: String,
    encrypted_key_hash: [u8; DIGEST_LEN],
    royalty_bps: u16,
    private_sale: bool,
    whitelisted_buyer: Option<Pubkey>,
) -> Result<()> {
    require!(!ctx.accounts.protocol.paused, ObscraError::ProtocolHalted);
    require!(price > 0, ObscraError::InvalidPrice);
    require!(royalty_bps <= ROYALTY_CEILING_BPS, ObscraError::RoyaltyTooHigh);
    require!(title.len() <= TITLE_CAP, ObscraError::TitleTooLong);
    require!(description.len() <= DESC_CAP, ObscraError::DescriptionTooLong);
    require!(category.len() <= CATEGORY_CAP, ObscraError::CategoryTooLong);
    require!(tags.len() <= TAG_LIMIT, ObscraError::TooManyTags);
    for t in &tags {
        require!(t.len() <= CATEGORY_CAP, ObscraError::CategoryTooLong);
    }
    require!(data_uri.len() <= URI_CAP, ObscraError::UriTooLong);
    require!(preview_uri.len() <= URI_CAP, ObscraError::UriTooLong);

    let listing = &mut ctx.accounts.listing;
    listing.seller = ctx.accounts.seller.key();
    listing.buyer = Pubkey::default();
    listing.offer_id = offer_id;
    listing.price = price;
    listing.title = title;
    listing.description = description;
    listing.category = category.clone();
    listing.tags = tags;
    listing.data_uri = data_uri;
    listing.preview_uri = preview_uri;
    listing.encrypted_key_hash = encrypted_key_hash;
    listing.royalty_bps = royalty_bps;
    listing.private_sale = private_sale;
    listing.whitelisted_buyer = whitelisted_buyer.unwrap_or_default();
    listing.status = OfferStatus::Active;
    listing.created_at = now()?;
    listing.settled_at = 0;
    listing.bump = ctx.bumps.listing;

    let mp = &mut ctx.accounts.protocol;
    mp.offer_count = mp.offer_count.saturating_add(1);

    emit!(OfferPublished {
        listing: listing.key(),
        seller: listing.seller,
        offer_id,
        price,
        category,
        private_sale,
    });
    Ok(())
}

pub fn amend_offer_price(ctx: Context<UpdateOffer>, new_price: u64) -> Result<()> {
    require!(new_price > 0, ObscraError::InvalidPrice);
    let listing = &mut ctx.accounts.listing;
    require!(listing.status == OfferStatus::Active, ObscraError::InvalidStatus);
    require_keys_eq!(listing.seller, ctx.accounts.seller.key(), ObscraError::Unauthorized);
    listing.price = new_price;
    emit!(OfferAmended { listing: listing.key(), new_price });
    Ok(())
}

pub fn fill_offer(ctx: Context<FillOffer>) -> Result<()> {
    require!(!ctx.accounts.protocol.paused, ObscraError::ProtocolHalted);

    let listing = &mut ctx.accounts.listing;
    require!(listing.status == OfferStatus::Active, ObscraError::OfferUnavailable);
    require!(
        ctx.accounts.buyer.key() != listing.seller,
        ObscraError::SelfFillForbidden
    );
    if listing.private_sale {
        require!(
            listing.whitelisted_buyer == ctx.accounts.buyer.key(),
            ObscraError::NotWhitelisted
        );
    }

    let (fee, royalty, seller_net) =
        compute_fee_split(listing.price, ctx.accounts.protocol.fee_bps, listing.royalty_bps)?;

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
        fee,
    )?;
    send_lamports(
        &ctx.accounts.system_program,
        &ctx.accounts.buyer.to_account_info(),
        &ctx.accounts.treasury.to_account_info(),
        royalty,
    )?;

    listing.status = OfferStatus::Sold;
    listing.buyer = ctx.accounts.buyer.key();
    listing.settled_at = now()?;

    if let Some(p) = ctx.accounts.seller_profile.as_mut() {
        p.total_sales = p.total_sales.saturating_add(1);
        p.total_volume_lamports = p.total_volume_lamports.saturating_add(listing.price);
    }
    if let Some(p) = ctx.accounts.buyer_profile.as_mut() {
        p.total_purchases = p.total_purchases.saturating_add(1);
    }

    emit!(OfferFulfilled {
        listing: listing.key(),
        seller: listing.seller,
        buyer: listing.buyer,
        price: listing.price,
        fee,
        royalty,
    });
    Ok(())
}

pub fn revoke_offer(ctx: Context<RevokeOffer>) -> Result<()> {
    let listing = &mut ctx.accounts.listing;
    require!(listing.status == OfferStatus::Active, ObscraError::OfferUnavailable);
    require_keys_eq!(listing.seller, ctx.accounts.seller.key(), ObscraError::Unauthorized);
    listing.status = OfferStatus::Cancelled;
    emit!(OfferRevoked { listing: listing.key() });
    Ok(())
}

// ── Account structs ─────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(offer_id: u64)]
pub struct PublishOffer<'info> {
    #[account(mut, seeds = [SEED_PROTOCOL], bump = protocol.bump)]
    pub protocol: Account<'info, ProtocolState>,
    #[account(
        init,
        payer = seller,
        space = 8 + Offer::SIZE,
        seeds = [SEED_OFFER, seller.key().as_ref(), &offer_id.to_le_bytes()],
        bump
    )]
    pub listing: Account<'info, Offer>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateOffer<'info> {
    #[account(
        mut,
        seeds = [SEED_OFFER, seller.key().as_ref(), &listing.offer_id.to_le_bytes()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, Offer>,
    pub seller: Signer<'info>,
}

#[derive(Accounts)]
pub struct FillOffer<'info> {
    #[account(seeds = [SEED_PROTOCOL], bump = protocol.bump)]
    pub protocol: Account<'info, ProtocolState>,
    #[account(
        mut,
        seeds = [SEED_OFFER, seller.key().as_ref(), &listing.offer_id.to_le_bytes()],
        bump = listing.bump,
        has_one = seller
    )]
    pub listing: Account<'info, Offer>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: verified via has_one on listing
    #[account(mut)]
    /// CHECK: seller receives payment — address validated against listing/auction state
    pub seller: UncheckedAccount<'info>,
    /// CHECK: must match protocol.treasury
    #[account(mut, address = protocol.treasury)]
    /// CHECK: treasury receives fees — address validated against protocol state
    pub treasury: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [SEED_TRADER, seller.key().as_ref()],
        bump = seller_profile.bump,
    )]
    pub seller_profile: Option<Account<'info, TraderProfile>>,
    #[account(
        mut,
        seeds = [SEED_TRADER, buyer.key().as_ref()],
        bump = buyer_profile.bump,
    )]
    pub buyer_profile: Option<Account<'info, TraderProfile>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeOffer<'info> {
    #[account(
        mut,
        seeds = [SEED_OFFER, seller.key().as_ref(), &listing.offer_id.to_le_bytes()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, Offer>,
    pub seller: Signer<'info>,
}
