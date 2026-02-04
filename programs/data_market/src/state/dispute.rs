//! Buyer-initiated claims resolved by protocol arbitrator.

use anchor_lang::prelude::*;

use crate::constants::CLAIM_REASON_CAP;

#[account]
pub struct Dispute {
    pub order: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub opener: Pubkey,
    pub reason: String,
    pub opened_at: i64,
    pub resolved_at: i64,
    pub refund_amount: u64,
    pub buyer_favored: bool,
    pub status: ClaimStatus,
    pub bump: u8,
}

impl Dispute {
    pub const SIZE: usize =
        32 + 32 + 32 + 32
        + (4 + CLAIM_REASON_CAP)
        + 8 + 8 + 8 + 1 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ClaimStatus {
    Open,
    Resolved,
    Rejected,
}
