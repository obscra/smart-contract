//! OBSCRA event definitions emitted for off-chain indexers.

use anchor_lang::prelude::*;

// ── Marketplace events ──────────────────────────────────────────────────────

#[event]
pub struct ProtocolStateInitialized {
    pub protocol: Pubkey,
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
}

#[event]
pub struct ProtocolStateConfigUpdated {
    pub protocol: Pubkey,
    pub fee_bps: u16,
    pub paused: bool,
}

#[event]
pub struct TraderOnboarded {
    pub profile: Pubkey,
    pub wallet: Pubkey,
    pub username: String,
}

// ── Fixed-price listing events ──────────────────────────────────────────────

#[event]
pub struct OfferPublished {
    pub listing: Pubkey,
    pub seller: Pubkey,
    pub offer_id: u64,
    pub price: u64,
    pub category: String,
    pub private_sale: bool,
}

#[event]
pub struct OfferAmended {
    pub listing: Pubkey,
    pub new_price: u64,
}

#[event]
pub struct OfferFulfilled {
    pub listing: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub price: u64,
    pub fee: u64,
    pub royalty: u64,
}

#[event]
pub struct OfferRevoked {
    pub listing: Pubkey,
}

// ── English auction events ──────────────────────────────────────────────────

#[event]
pub struct EnglishOpened {
    pub auction: Pubkey,
    pub seller: Pubkey,
    pub start_price: u64,
    pub min_increment: u64,
    pub end_time: i64,
}

#[event]
pub struct EnglishBidSubmitted {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
    pub new_end_time: i64,
}

#[event]
pub struct EnglishSettled {
    pub auction: Pubkey,
    pub winner: Pubkey,
    pub amount: u64,
    pub fee: u64,
}

#[event]
pub struct EnglishCancelled {
    pub auction: Pubkey,
}

// ── Dutch auction events ────────────────────────────────────────────────────

#[event]
pub struct DecliningOpened {
    pub auction: Pubkey,
    pub seller: Pubkey,
    pub start_price: u64,
    pub floor_price: u64,
    pub start_time: i64,
    pub end_time: i64,
}

#[event]
pub struct DecliningFilled {
    pub auction: Pubkey,
    pub buyer: Pubkey,
    pub price: u64,
}

// ── Sealed-bid auction events ───────────────────────────────────────────────

#[event]
pub struct HiddenBidOpened {
    pub auction: Pubkey,
    pub seller: Pubkey,
    pub commit_end: i64,
    pub reveal_end: i64,
}

#[event]
pub struct HiddenBidCommitted {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub deposit: u64,
}

#[event]
pub struct HiddenBidRevealed {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
}

#[event]
pub struct HiddenBidSettled {
    pub auction: Pubkey,
    pub winner: Pubkey,
    pub amount: u64,
}

// ── Subscription events ─────────────────────────────────────────────────────

#[event]
pub struct AccessPlanCreated {
    pub plan: Pubkey,
    pub seller: Pubkey,
    pub price_per_day: u64,
}

#[event]
pub struct AccessGranted {
    pub plan: Pubkey,
    pub subscriber: Pubkey,
    pub expires_at: i64,
}

// ── Reputation & dispute events ─────────────────────────────────────────────

#[event]
pub struct FeedbackPosted {
    pub review: Pubkey,
    pub target: Pubkey,
    pub reviewer: Pubkey,
    pub rating: u8,
}

#[event]
pub struct ClaimOpened {
    pub dispute: Pubkey,
    pub order: Pubkey,
    pub opener: Pubkey,
}

#[event]
pub struct ClaimResolved {
    pub dispute: Pubkey,
    pub outcome_buyer_favored: bool,
    pub refunded_amount: u64,
}
