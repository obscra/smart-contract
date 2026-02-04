//! Commit-reveal hidden-bid auction (keccak256 scheme).

use anchor_lang::prelude::*;

use crate::constants::{DIGEST_LEN, CATEGORY_CAP, DESC_CAP, TITLE_CAP, URI_CAP};

#[account]
pub struct SealedAuction {
    pub seller: Pubkey,
    pub auction_id: u64,
    pub reserve_price: u64,
    pub commit_end: i64,
    pub reveal_end: i64,
    pub highest_bid: u64,
    pub highest_bidder: Pubkey,
    pub commits: u32,
    pub reveals: u32,
    pub title: String,
    pub description: String,
    pub category: String,
    pub data_uri: String,
    pub encrypted_key_hash: [u8; DIGEST_LEN],
    pub status: HiddenBidStatus,
    pub bump: u8,
}

impl SealedAuction {
    pub const SIZE: usize =
        32 + 8 + 8 + 8 + 8 + 8 + 32 + 4 + 4
        + (4 + TITLE_CAP)
        + (4 + DESC_CAP)
        + (4 + CATEGORY_CAP)
        + (4 + URI_CAP)
        + DIGEST_LEN
        + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum HiddenBidStatus {
    Commit,
    Reveal,
    Settled,
    Cancelled,
}

#[account]
pub struct SealedBid {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub commitment: [u8; DIGEST_LEN],
    pub deposit: u64,
    pub revealed_amount: u64,
    pub revealed: bool,
    pub refunded: bool,
    pub bump: u8,
}

impl SealedBid {
    pub const SIZE: usize = 32 + 32 + DIGEST_LEN + 8 + 8 + 1 + 1 + 1;
}
