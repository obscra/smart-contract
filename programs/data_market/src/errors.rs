//! OBSCRA error catalogue — every on-chain failure variant.

use anchor_lang::prelude::*;

#[error_code]
pub enum ObscraError {
    // ── General ─────────────────────────────────────────────────────────
    #[msg("Marketplace is currently paused by admin")]
    ProtocolHalted,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Math overflow")]
    ArithmeticOverflow,
    #[msg("Invalid bump")]
    InvalidBump,
    #[msg("Invalid status for this operation")]
    InvalidStatus,

    // ── Metadata validation ─────────────────────────────────────────────
    #[msg("Title too long")]
    TitleTooLong,
    #[msg("Description too long")]
    DescriptionTooLong,
    #[msg("Data URI too long")]
    UriTooLong,
    #[msg("Category too long")]
    CategoryTooLong,
    #[msg("Username too long")]
    UsernameTooLong,
    #[msg("Review text too long")]
    ReviewTooLong,
    #[msg("Dispute reason too long")]
    DisputeReasonTooLong,
    #[msg("Too many tags (max 5)")]
    TooManyTags,

    // ── Economics ────────────────────────────────────────────────────────
    #[msg("Price must be greater than zero")]
    InvalidPrice,
    #[msg("Minimum bid increment must be greater than zero")]
    InvalidIncrement,
    #[msg("Fee basis points exceed maximum allowed")]
    FeeTooHigh,
    #[msg("Royalty basis points exceed maximum allowed")]
    RoyaltyTooHigh,

    // ── Listings ────────────────────────────────────────────────────────
    #[msg("Listing is not available for purchase")]
    OfferUnavailable,
    #[msg("Sellers cannot buy their own listing")]
    SelfFillForbidden,
    #[msg("You are not whitelisted for this private sale")]
    NotWhitelisted,

    // ── English auctions ────────────────────────────────────────────────
    #[msg("Auction duration out of range")]
    DurationBeyondLimits,
    #[msg("Auction is not active")]
    EnglishNotLive,
    #[msg("Auction already ended")]
    EnglishExpired,
    #[msg("Auction has not ended yet")]
    EnglishStillLive,
    #[msg("Bid below minimum required")]
    BidTooLow,
    #[msg("Sellers cannot bid on their own auction")]
    SelfBidProhibited,
    #[msg("Previous bidder account must be provided")]
    MissingPreviousBidder,
    #[msg("Previous bidder account does not match stored highest bidder")]
    WrongPreviousBidder,
    #[msg("Winner account does not match highest bidder")]
    WrongWinner,
    #[msg("Cannot cancel auction that already has bids")]
    CancelBlockedByBids,

    // ── Dutch auctions ──────────────────────────────────────────────────
    #[msg("Dutch auction: floor price must be below start price")]
    DecliningRangeInvalid,
    #[msg("Dutch auction: tick size is too short")]
    DecliningTickTooShort,
    #[msg("Dutch auction not yet started")]
    DecliningNotStarted,

    // ── Sealed-bid auctions ─────────────────────────────────────────────
    #[msg("Sealed auction: commit phase has ended")]
    CommitWindowClosed,
    #[msg("Sealed auction: reveal phase has not started")]
    RevealWindowPending,
    #[msg("Sealed auction: reveal phase has ended")]
    RevealWindowClosed,
    #[msg("Revealed amount does not match commitment hash")]
    CommitHashInvalid,
    #[msg("Deposit does not cover revealed bid amount")]
    DepositTooLow,

    // ── Subscriptions ───────────────────────────────────────────────────
    #[msg("Subscription duration out of range")]
    SubscriptionDurationBeyondLimits,
    #[msg("Subscription plan inactive")]
    AccessPlanInactive,
    #[msg("Subscription already expired — please renew")]
    AccessExpired,

    // ── Reviews ─────────────────────────────────────────────────────────
    #[msg("Rating must be between 1 and 5")]
    RatingInvalid,
    #[msg("Only the buyer of a completed order may leave a review")]
    FeedbackSenderNotBuyer,

    // ── Disputes ────────────────────────────────────────────────────────
    #[msg("Dispute already resolved")]
    ClaimAlreadySettled,
    #[msg("Only the assigned arbitrator may resolve this dispute")]
    UnauthorizedArbiter,
    #[msg("Dispute window has closed")]
    ClaimWindowExpired,
}
