//! Access plan lifecycle — create, toggle, purchase.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::ObscraError;
use crate::events::*;
use crate::state::*;
use crate::utils::{now, compute_fee_split, send_lamports};

#[allow(clippy::too_many_arguments)]
pub fn create_access_plan(
    ctx: Context<CreateAccessPlan>,
    plan_id: u64,
    price_per_day: u64,
    min_days: u32,
    max_days: u32,
    title: String,
    description: String,
    access_uri: String,
    encrypted_key_hash: [u8; DIGEST_LEN],
) -> Result<()> {
    require!(!ctx.accounts.protocol.paused, ObscraError::ProtocolHalted);
    require!(price_per_day > 0, ObscraError::InvalidPrice);
    require!(
        min_days >= 1 && max_days >= min_days && (max_days as i64) <= ACCESS_MAX_DAYS,
        ObscraError::SubscriptionDurationBeyondLimits
    );
    require!(title.len() <= TITLE_CAP, ObscraError::TitleTooLong);
    require!(description.len() <= DESC_CAP, ObscraError::DescriptionTooLong);
    require!(access_uri.len() <= URI_CAP, ObscraError::UriTooLong);

    let plan = &mut ctx.accounts.plan;
    plan.seller = ctx.accounts.seller.key();
    plan.plan_id = plan_id;
    plan.price_per_day = price_per_day;
    plan.min_days = min_days;
    plan.max_days = max_days;
    plan.title = title;
    plan.description = description;
    plan.access_uri = access_uri;
    plan.encrypted_key_hash = encrypted_key_hash;
    plan.subscriber_count = 0;
    plan.active = true;
    plan.bump = ctx.bumps.plan;

    ctx.accounts.protocol.subscription_count =
        ctx.accounts.protocol.subscription_count.saturating_add(1);

    emit!(AccessPlanCreated {
        plan: plan.key(),
        seller: plan.seller,
        price_per_day,
    });
    Ok(())
}

pub fn toggle_access_plan(
    ctx: Context<ToggleAccessPlan>,
    active: bool,
) -> Result<()> {
    let plan = &mut ctx.accounts.plan;
    require_keys_eq!(plan.seller, ctx.accounts.seller.key(), ObscraError::Unauthorized);
    plan.active = active;
    Ok(())
}

pub fn purchase_access(
    ctx: Context<PurchaseAccess>,
    days: u32,
) -> Result<()> {
    require!(!ctx.accounts.protocol.paused, ObscraError::ProtocolHalted);

    let plan = &mut ctx.accounts.plan;
    require!(plan.active, ObscraError::AccessPlanInactive);
    require!(
        (plan.min_days..=plan.max_days).contains(&days),
        ObscraError::SubscriptionDurationBeyondLimits
    );

    let total = plan
        .price_per_day
        .checked_mul(days as u64)
        .ok_or(ObscraError::ArithmeticOverflow)?;

    let (fee, _royalty, seller_net) =
        compute_fee_split(total, ctx.accounts.protocol.fee_bps, 0)?;

    send_lamports(
        &ctx.accounts.system_program,
        &ctx.accounts.subscriber.to_account_info(),
        &ctx.accounts.seller.to_account_info(),
        seller_net,
    )?;
    send_lamports(
        &ctx.accounts.system_program,
        &ctx.accounts.subscriber.to_account_info(),
        &ctx.accounts.treasury.to_account_info(),
        fee,
    )?;

    let t = now()?;
    let sub = &mut ctx.accounts.subscription;

    let base = if sub.expires_at > t { sub.expires_at } else { t };
    let new_expiry = base
        .checked_add((days as i64).checked_mul(DAY_IN_SECONDS).ok_or(ObscraError::ArithmeticOverflow)?)
        .ok_or(ObscraError::ArithmeticOverflow)?;

    if sub.started_at == 0 {
        sub.started_at = t;
        sub.plan = plan.key();
        sub.subscriber = ctx.accounts.subscriber.key();
        sub.bump = ctx.bumps.subscription;
        plan.subscriber_count = plan.subscriber_count.saturating_add(1);
    }
    sub.expires_at = new_expiry;
    sub.total_paid = sub.total_paid.saturating_add(total);

    emit!(AccessGranted {
        plan: plan.key(),
        subscriber: sub.subscriber,
        expires_at: sub.expires_at,
    });
    Ok(())
}

// ── Account structs ─────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(plan_id: u64)]
pub struct CreateAccessPlan<'info> {
    #[account(mut, seeds = [SEED_PROTOCOL], bump = protocol.bump)]
    pub protocol: Account<'info, ProtocolState>,
    #[account(
        init,
        payer = seller,
        space = 8 + SubscriptionPlan::SIZE,
        seeds = [SEED_ACCESS, seller.key().as_ref(), &plan_id.to_le_bytes()],
        bump
    )]
    pub plan: Account<'info, SubscriptionPlan>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ToggleAccessPlan<'info> {
    #[account(
        mut,
        seeds = [SEED_ACCESS, seller.key().as_ref(), &plan.plan_id.to_le_bytes()],
        bump = plan.bump,
    )]
    pub plan: Account<'info, SubscriptionPlan>,
    pub seller: Signer<'info>,
}

#[derive(Accounts)]
pub struct PurchaseAccess<'info> {
    #[account(seeds = [SEED_PROTOCOL], bump = protocol.bump)]
    pub protocol: Account<'info, ProtocolState>,
    #[account(
        mut,
        seeds = [SEED_ACCESS, seller.key().as_ref(), &plan.plan_id.to_le_bytes()],
        bump = plan.bump,
        has_one = seller,
    )]
    pub plan: Account<'info, SubscriptionPlan>,
    #[account(
        init_if_needed,
        payer = subscriber,
        space = 8 + Subscription::SIZE,
        seeds = [SEED_ACCESS, plan.key().as_ref(), subscriber.key().as_ref()],
        bump
    )]
    pub subscription: Account<'info, Subscription>,
    #[account(mut)]
    pub subscriber: Signer<'info>,
    /// CHECK: validated via plan.has_one
    #[account(mut)]
    /// CHECK: seller receives payment — address validated against listing/auction state
    pub seller: UncheckedAccount<'info>,
    /// CHECK: must match protocol.treasury
    #[account(mut, address = protocol.treasury)]
    /// CHECK: treasury receives fees — address validated against protocol state
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
