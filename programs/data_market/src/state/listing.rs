//! Fixed-price data offer account.

use anchor_lang::prelude::*;

use crate::constants::{
    DIGEST_LEN, CATEGORY_CAP, DESC_CAP, TAG_LIMIT, TITLE_CAP, URI_CAP,
};

#[account]
pub struct Offer {
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub offer_id: u64,
    pub price: u64,
    pub title: String,
    pub description: String,
    pub category: String,
    pub tags: Vec<String>,
    pub data_uri: String,
    pub preview_uri: String,
    pub encrypted_key_hash: [u8; DIGEST_LEN],
    pub royalty_bps: u16,
    pub status: OfferStatus,
    pub private_sale: bool,
    pub whitelisted_buyer: Pubkey,
    pub created_at: i64,
    pub settled_at: i64,
    pub bump: u8,
}

impl Offer {
    pub const SIZE: usize =
        32 + 32 + 8 + 8
        + (4 + TITLE_CAP)
        + (4 + DESC_CAP)
        + (4 + CATEGORY_CAP)
        + (4 + TAG_LIMIT * (4 + CATEGORY_CAP))
        + (4 + URI_CAP)
        + (4 + URI_CAP)
        + DIGEST_LEN
        + 2
        + 1
        + 1
        + 32
        + 8 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum OfferStatus {
    Active,
    Sold,
    Cancelled,
}
