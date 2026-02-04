//! Trader profile with aggregated reputation metrics.

use anchor_lang::prelude::*;

use crate::constants::{URI_CAP, USERNAME_CAP};

#[account]
pub struct TraderProfile {
    pub wallet: Pubkey,
    pub username: String,
    pub avatar_uri: String,
    pub joined_at: i64,
    pub seller_rating_sum: u64,
    pub seller_rating_count: u64,
    pub buyer_rating_sum: u64,
    pub buyer_rating_count: u64,
    pub total_sales: u64,
    pub total_purchases: u64,
    pub total_volume_lamports: u64,
    pub disputes_opened: u32,
    pub disputes_lost: u32,
    pub bump: u8,
}

impl TraderProfile {
    pub const SIZE: usize =
        32
        + (4 + USERNAME_CAP)
        + (4 + URI_CAP)
        + 8
        + 8 + 8 + 8 + 8
        + 8 + 8 + 8
        + 4 + 4
        + 1;

    pub fn seller_avg_x100(&self) -> u64 {
        if self.seller_rating_count == 0 {
            0
        } else {
            self.seller_rating_sum * 100 / self.seller_rating_count
        }
    }
}
