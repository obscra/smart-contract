//! Post-purchase feedback (1-5 star rating).

use anchor_lang::prelude::*;

use crate::constants::FEEDBACK_CAP;

#[account]
pub struct Review {
    pub reviewer: Pubkey,
    pub target: Pubkey,
    pub order: Pubkey,
    pub rating: u8,
    pub comment: String,
    pub created_at: i64,
    pub bump: u8,
}

impl Review {
    pub const SIZE: usize = 32 + 32 + 32 + 1 + (4 + FEEDBACK_CAP) + 8 + 1;
}
