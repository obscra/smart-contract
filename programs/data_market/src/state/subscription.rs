//! Recurring access plans and subscriber state.

use anchor_lang::prelude::*;

use crate::constants::{DIGEST_LEN, DESC_CAP, TITLE_CAP, URI_CAP};

#[account]
pub struct SubscriptionPlan {
    pub seller: Pubkey,
    pub plan_id: u64,
    pub price_per_day: u64,
    pub min_days: u32,
    pub max_days: u32,
    pub title: String,
    pub description: String,
    pub access_uri: String,
    pub encrypted_key_hash: [u8; DIGEST_LEN],
    pub subscriber_count: u64,
    pub active: bool,
    pub bump: u8,
}

impl SubscriptionPlan {
    pub const SIZE: usize =
        32 + 8 + 8 + 4 + 4
        + (4 + TITLE_CAP)
        + (4 + DESC_CAP)
        + (4 + URI_CAP)
        + DIGEST_LEN
        + 8 + 1 + 1;
}

#[account]
pub struct Subscription {
    pub plan: Pubkey,
    pub subscriber: Pubkey,
    pub started_at: i64,
    pub expires_at: i64,
    pub total_paid: u64,
    pub bump: u8,
}

impl Subscription {
    pub const SIZE: usize = 32 + 32 + 8 + 8 + 8 + 1;
}
