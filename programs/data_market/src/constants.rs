//! OBSCRA protocol constants — tuneable parameters, PDA seeds, and size guards.

pub const PROTOCOL_VERSION: u8 = 1;

// ── Buffer capacity limits ──────────────────────────────────────────────────

pub const TITLE_CAP: usize = 80;
pub const DESC_CAP: usize = 280;
pub const URI_CAP: usize = 200;
pub const CATEGORY_CAP: usize = 32;
pub const USERNAME_CAP: usize = 32;
pub const FEEDBACK_CAP: usize = 280;
pub const CLAIM_REASON_CAP: usize = 280;
pub const TAG_LIMIT: usize = 5;
pub const DIGEST_LEN: usize = 32;

// ── Marketplace economics ───────────────────────────────────────────────────

pub const INITIAL_FEE_BPS: u16 = 250;
pub const FEE_CEILING_BPS: u16 = 1_000;
pub const BASIS_DENOMINATOR: u64 = 10_000;
pub const ROYALTY_CEILING_BPS: u16 = 500;

// ── Auction parameters ──────────────────────────────────────────────────────

pub const ENGLISH_MIN_SECS: i64 = 60;
pub const ENGLISH_MAX_SECS: i64 = 60 * 60 * 24 * 30;
pub const SNIPE_GUARD_WINDOW: i64 = 60;
pub const SNIPE_GUARD_EXTEND: i64 = 60;
pub const DECLINING_MIN_TICK: i64 = 10;

// ── Subscriptions ───────────────────────────────────────────────────────────

pub const DAY_IN_SECONDS: i64 = 86_400;
pub const ACCESS_MAX_DAYS: i64 = 365;

// ── Reputation ──────────────────────────────────────────────────────────────

pub const FEEDBACK_MIN_STARS: u8 = 1;
pub const FEEDBACK_MAX_STARS: u8 = 5;

// ── PDA seeds ───────────────────────────────────────────────────────────────

pub const SEED_PROTOCOL: &[u8] = b"obs_protocol";
pub const SEED_OFFER: &[u8] = b"obs_offer";
pub const SEED_ENGLISH: &[u8] = b"obs_english";
pub const SEED_DECLINING: &[u8] = b"obs_declining";
pub const SEED_HIDDEN: &[u8] = b"obs_hidden";
pub const SEED_VAULT: &[u8] = b"obs_vault";
pub const SEED_TRADER: &[u8] = b"obs_trader";
pub const SEED_FEEDBACK: &[u8] = b"obs_feedback";
pub const SEED_ACCESS: &[u8] = b"obs_access";
pub const SEED_CLAIM: &[u8] = b"obs_claim";
pub const SEED_HIDDEN_BID: &[u8] = b"obs_hidden_bid";
