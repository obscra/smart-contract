//! Singleton protocol configuration — fee rate, authorities, counters.

use anchor_lang::prelude::*;

#[account]
pub struct ProtocolState {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub arbitrator: Pubkey,
    pub fee_bps: u16,
    pub paused: bool,
    pub offer_count: u64,
    pub auction_count: u64,
    pub dutch_count: u64,
    pub sealed_count: u64,
    pub subscription_count: u64,
    pub dispute_count: u64,
    pub bump: u8,
}

impl Marketplace {
    pub const SIZE: usize =
        32      // authority
        + 32   // treasury
        + 32   // arbitrator
        + 2    // fee_bps
        + 1    // paused
        + 8 * 6 // 6 counters
        + 1;   // bump
}
