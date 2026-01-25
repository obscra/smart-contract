//! OBSCRA — decentralised encrypted-data marketplace on Solana.
//!
//! Supports fixed-price offers, English / declining / hidden-bid auctions,
//! recurring access plans, on-chain reputation, and arbitrated claims.

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("DatMktLe1AucN1oNRust1111111111111111111111111");

#[program]
pub mod data_market {
    use super::*;

    // ── Admin ───────────────────────────────────────────────────────────

    pub fn bootstrap_protocol(
        ctx: Context<BootstrapProtocol>,
        fee_bps: u16,
    ) -> Result<()> {
        admin::bootstrap_protocol(ctx, fee_bps)
    }

    pub fn reconfigure_protocol(
        ctx: Context<ReconfigureProtocol>,
        fee_bps: Option<u16>,
        paused: Option<bool>,
        new_treasury: Option<Pubkey>,
        new_arbitrator: Option<Pubkey>,
    ) -> Result<()> {
        admin::reconfigure_protocol(ctx, fee_bps, paused, new_treasury, new_arbitrator)
    }

    // ── User Profiles ───────────────────────────────────────────────────

    pub fn register_trader(
        ctx: Context<RegisterTrader>,
        username: String,
        avatar_uri: String,
    ) -> Result<()> {
        user::register_user(ctx, username, avatar_uri)
    }

    pub fn update_trader(
        ctx: Context<UpdateTrader>,
        username: Option<String>,
        avatar_uri: Option<String>,
    ) -> Result<()> {
        user::update_profile(ctx, username, avatar_uri)
    }

    // ── Fixed-Price Listings ────────────────────────────────────────────

    #[allow(clippy::too_many_arguments)]
    pub fn publish_offer(
        ctx: Context<PublishOffer>,
        offer_id: u64,
        price: u64,
        title: String,
        description: String,
        category: String,
        tags: Vec<String>,
        data_uri: String,
        preview_uri: String,
        encrypted_key_hash: [u8; constants::DIGEST_LEN],
        royalty_bps: u16,
        private_sale: bool,
        whitelisted_buyer: Option<Pubkey>,
    ) -> Result<()> {
        listing::list_data(
            ctx,
            offer_id,
            price,
            title,
            description,
            category,
            tags,
            data_uri,
            preview_uri,
            encrypted_key_hash,
            royalty_bps,
            private_sale,
            whitelisted_buyer,
        )
    }

    pub fn amend_offer_price(ctx: Context<UpdateOffer>, new_price: u64) -> Result<()> {
        listing::update_listing_price(ctx, new_price)
    }

    pub fn fill_offer(ctx: Context<FillOffer>) -> Result<()> {
        listing::buy_data(ctx)
    }

    pub fn revoke_offer(ctx: Context<RevokeOffer>) -> Result<()> {
        listing::delist_data(ctx)
    }

    // ── English Auction ─────────────────────────────────────────────────

    #[allow(clippy::too_many_arguments)]
    pub fn open_english(
        ctx: Context<CreateEnglish>,
        auction_id: u64,
        start_price: u64,
        min_increment: u64,
        duration_secs: i64,
        title: String,
        description: String,
        category: String,
        data_uri: String,
        encrypted_key_hash: [u8; constants::DIGEST_LEN],
        royalty_bps: u16,
    ) -> Result<()> {
        english_auction::create_auction(
            ctx,
            auction_id,
            start_price,
            min_increment,
            duration_secs,
            title,
            description,
            category,
            data_uri,
            encrypted_key_hash,
            royalty_bps,
        )
    }

    pub fn submit_english_bid(ctx: Context<SubmitEnglishBid>, amount: u64) -> Result<()> {
        english_auction::place_bid(ctx, amount)
    }

    pub fn settle_english(ctx: Context<SettleEnglish>) -> Result<()> {
        english_auction::finalize_auction(ctx)
    }

    pub fn cancel_english(ctx: Context<CancelEnglish>) -> Result<()> {
        english_auction::cancel_auction(ctx)
    }

    // ── Dutch Auction ───────────────────────────────────────────────────

    #[allow(clippy::too_many_arguments)]
    pub fn open_declining(
        ctx: Context<CreateDeclining>,
        auction_id: u64,
        start_price: u64,
        floor_price: u64,
        duration_secs: i64,
        tick_seconds: i64,
        title: String,
        description: String,
        category: String,
        data_uri: String,
        encrypted_key_hash: [u8; constants::DIGEST_LEN],
        royalty_bps: u16,
    ) -> Result<()> {
        dutch_auction::create_dutch_auction(
            ctx,
            auction_id,
            start_price,
            floor_price,
            duration_secs,
            tick_seconds,
            title,
            description,
            category,
            data_uri,
            encrypted_key_hash,
            royalty_bps,
        )
    }

    pub fn fill_declining(ctx: Context<FillDeclining>, max_price: u64) -> Result<()> {
        dutch_auction::fill_dutch_auction(ctx, max_price)
    }

    pub fn cancel_declining(ctx: Context<CancelDeclining>) -> Result<()> {
        dutch_auction::cancel_dutch_auction(ctx)
    }

    // ── Sealed-Bid Auction ──────────────────────────────────────────────

    #[allow(clippy::too_many_arguments)]
    pub fn open_hidden_bid(
        ctx: Context<CreateHiddenBid>,
        auction_id: u64,
        reserve_price: u64,
        commit_secs: i64,
        reveal_secs: i64,
        title: String,
        description: String,
        category: String,
        data_uri: String,
        encrypted_key_hash: [u8; constants::DIGEST_LEN],
    ) -> Result<()> {
        sealed_auction::create_sealed_auction(
            ctx,
            auction_id,
            reserve_price,
            commit_secs,
            reveal_secs,
            title,
            description,
            category,
            data_uri,
            encrypted_key_hash,
        )
    }

    pub fn commit_hidden(
        ctx: Context<CommitHidden>,
        commitment: [u8; constants::DIGEST_LEN],
        deposit: u64,
    ) -> Result<()> {
        sealed_auction::commit_sealed_bid(ctx, commitment, deposit)
    }

    pub fn reveal_hidden(
        ctx: Context<RevealHidden>,
        amount: u64,
        nonce: [u8; constants::DIGEST_LEN],
    ) -> Result<()> {
        sealed_auction::reveal_sealed_bid(ctx, amount, nonce)
    }

    pub fn settle_hidden(ctx: Context<SettleHidden>) -> Result<()> {
        sealed_auction::settle_sealed_auction(ctx)
    }

    pub fn refund_hidden(ctx: Context<RefundHidden>) -> Result<()> {
        sealed_auction::refund_sealed_bid(ctx)
    }

    // ── Subscriptions ───────────────────────────────────────────────────

    #[allow(clippy::too_many_arguments)]
    pub fn create_access_plan(
        ctx: Context<CreateAccessPlan>,
        plan_id: u64,
        price_per_day: u64,
        min_days: u32,
        max_days: u32,
        title: String,
        description: String,
        access_uri: String,
        encrypted_key_hash: [u8; constants::DIGEST_LEN],
    ) -> Result<()> {
        subscription::create_subscription_plan(
            ctx,
            plan_id,
            price_per_day,
            min_days,
            max_days,
            title,
            description,
            access_uri,
            encrypted_key_hash,
        )
    }

    pub fn toggle_access_plan(ctx: Context<ToggleAccessPlan>, active: bool) -> Result<()> {
        subscription::set_subscription_plan_active(ctx, active)
    }

    pub fn purchase_access(ctx: Context<PurchaseAccess>, days: u32) -> Result<()> {
        subscription::purchase_subscription(ctx, days)
    }

    // ── Reviews ─────────────────────────────────────────────────────────

    pub fn post_feedback(ctx: Context<SubmitFeedback>, rating: u8, comment: String) -> Result<()> {
        review::submit_review(ctx, rating, comment)
    }

    // ── Disputes ────────────────────────────────────────────────────────

    pub fn open_claim(ctx: Context<OpenClaim>, reason: String) -> Result<()> {
        dispute::open_dispute(ctx, reason)
    }

    pub fn resolve_claim(
        ctx: Context<ResolveClaim>,
        buyer_favored: bool,
        refund_amount: u64,
    ) -> Result<()> {
        dispute::resolve_dispute(ctx, buyer_favored, refund_amount)
    }
}
