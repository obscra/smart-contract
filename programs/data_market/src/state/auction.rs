//! English ascending auction with anti-snipe guard.

use anchor_lang::prelude::*;

use crate::constants::{DIGEST_LEN, CATEGORY_CAP, DESC_CAP, TITLE_CAP, URI_CAP};

#[account]
pub struct Auction {
    pub seller: Pubkey,
    pub auction_id: u64,
    pub start_price: u64,
    pub min_increment: u64,
    pub highest_bid: u64,
    pub highest_bidder: Pubkey,
    pub bid_count: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub title: String,
    pub description: String,
    pub category: String,
    pub data_uri: String,
    pub encrypted_key_hash: [u8; DIGEST_LEN],
    pub royalty_bps: u16,
    pub status: EnglishStatus,
    pub bump: u8,
    pub escrow_bump: u8,
}

impl Auction {
    pub const SIZE: usize =
        32 + 8 + 8 + 8 + 8 + 32 + 8 + 8 + 8
        + (4 + TITLE_CAP)
        + (4 + DESC_CAP)
        + (4 + CATEGORY_CAP)
        + (4 + URI_CAP)
        + DIGEST_LEN
        + 2
        + 1 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum EnglishStatus {
    Active,
    Settled,
    Cancelled,
    EndedNoBids,
}
