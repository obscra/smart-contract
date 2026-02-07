//! Protocol bootstrap and configuration management.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::ObscraError;
use crate::events::*;
use crate::state::*;

pub fn bootstrap_protocol(ctx: Context<BootstrapProtocol>, fee_bps: u16) -> Result<()> {
    require!(fee_bps <= FEE_CEILING_BPS, ObscraError::FeeTooHigh);

    let mp = &mut ctx.accounts.protocol;
    mp.authority = ctx.accounts.authority.key();
    mp.treasury = ctx.accounts.treasury.key();
    mp.arbitrator = ctx.accounts.arbitrator.key();
    mp.fee_bps = fee_bps;
    mp.paused = false;
    mp.offer_count = 0;
    mp.auction_count = 0;
    mp.dutch_count = 0;
    mp.sealed_count = 0;
    mp.subscription_count = 0;
    mp.dispute_count = 0;
    mp.bump = ctx.bumps.protocol;

    emit!(ProtocolBootstrapped {
        protocol: mp.key(),
        authority: mp.authority,
        treasury: mp.treasury,
        fee_bps,
    });
    Ok(())
}

pub fn reconfigure_protocol(
    ctx: Context<ReconfigureProtocol>,
    fee_bps: Option<u16>,
    paused: Option<bool>,
    new_treasury: Option<Pubkey>,
    new_arbitrator: Option<Pubkey>,
) -> Result<()> {
    let mp = &mut ctx.accounts.protocol;
    require_keys_eq!(mp.authority, ctx.accounts.authority.key(), ObscraError::Unauthorized);

    if let Some(f) = fee_bps {
        require!(f <= FEE_CEILING_BPS, ObscraError::FeeTooHigh);
        mp.fee_bps = f;
    }
    if let Some(p) = paused {
        mp.paused = p;
    }
    if let Some(t) = new_treasury {
        mp.treasury = t;
    }
    if let Some(a) = new_arbitrator {
        mp.arbitrator = a;
    }

    emit!(ProtocolConfigChanged {
        protocol: mp.key(),
        fee_bps: mp.fee_bps,
        paused: mp.paused,
    });
    Ok(())
}

// ── Account structs ─────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct BootstrapProtocol<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Marketplace::SIZE,
        seeds = [SEED_PROTOCOL],
        bump
    )]
    pub protocol: Account<'info, ProtocolState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: treasury collects fees
    /// CHECK: treasury receives fees — address validated against protocol state
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: wallet authorised to resolve disputes
    /// CHECK: arbitrator identity — validated against protocol state on dispute resolution
    pub arbitrator: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReconfigureProtocol<'info> {
    #[account(mut, seeds = [SEED_PROTOCOL], bump = protocol.bump)]
    pub protocol: Account<'info, ProtocolState>,
    pub authority: Signer<'info>,
}
