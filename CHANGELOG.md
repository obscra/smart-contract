# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.
Versions follow [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Planned
- SPL-token payments (USDC / USDT via anchor-spl)
- Bundle listings (multi-asset single purchase)
- cNFT-gated access (Metaplex Bubblegum)
- Secondary-market re-listing with enforced royalties
- On-chain oracle price feed integration

---

## [v0.1.0] — 2026-04-16

### Added

**Core marketplace**
- `initialize_marketplace` — deploy singleton config PDA with authority, treasury,
  arbitrator, and configurable fee (max 10%)
- `update_marketplace_config` — update fee, pause/unpause, rotate treasury / arbitrator

**User profiles**
- `register_user` — create reputation profile PDA per wallet
- `update_profile` — update username / avatar URI

**Fixed-price listings**
- `list_data` — publish encrypted data with title, category, tags, preview, royalty,
  optional whitelist for private sale
- `update_listing_price` — adjust price before first sale
- `buy_data` — atomic payment split (seller net + fee + royalty) with optional
  reputation counter update
- `delist_data` — cancel active listing

**English ascending auction**
- `create_auction` — configurable start price, min increment, duration (1 min to 30 days)
- `place_bid` — escrowed bid with automatic refund of previous bidder; anti-snipe 60s extension
- `finalize_auction` — distributes escrowed funds after `end_time`; handles no-bid case
- `cancel_auction` — seller cancel before first bid

**Dutch declining-price auction**
- `create_dutch_auction` — linear price decay from `start_price` to `floor_price`
- `fill_dutch_auction` — buyer fills at clock-interpolated price with `max_price` slippage guard
- `cancel_dutch_auction` — seller cancel before fill

**Sealed-bid commit-reveal auction**
- `create_sealed_auction` — configurable commit + reveal phase durations
- `commit_sealed_bid` — store `keccak256(amount || nonce)` with flat deposit
- `reveal_sealed_bid` — verify commitment, track highest revealed bid; auto-transition
  to reveal phase on first reveal
- `settle_sealed_auction` — distribute funds post reveal deadline
- `refund_sealed_bid` — losing bidders claim deposit back after reveal deadline

**Subscription plans**
- `create_subscription_plan` — recurring data-access plan with `price_per_day`, min/max days
- `set_subscription_plan_active` — toggle plan visibility
- `purchase_subscription` — idempotent (renewals stack); init-if-needed PDA

**Reputation & reviews**
- `submit_review` — 1-5 star + text; one review per (buyer, listing); auto-pushes seller rating

**Dispute resolution**
- `open_dispute` — buyer can dispute within 7-day window post-sale
- `resolve_dispute` — arbitrator decides buyer/seller-favored; updates loser's disputes_lost counter

### Security
- All arithmetic uses `checked_*` with `MathOverflow` error
- `has_one` / `address` constraints prevent cross-account spoofing and treasury redirection
- Escrow PDAs are lamport-only (system-owned), zero deserialization attack surface
- Anti-snipe window on English auctions
- Seller self-trade / self-bid forbidden on all trade types
- Dispute window hard-capped at 7 days

### Developer experience
- Modular source layout: `state/`, `instructions/`, `utils`, `constants`, `errors`, `events`
- TypeScript SDK with PDA derivation helpers and `computeCommitment` sealed-bid helper
- 7 integration test suites covering all major flows
- `make build / test / deploy-devnet / size` Makefile targets
- GitHub Actions CI: lint, audit, build-and-test, size report, release pipeline
- `scripts/seed.ts` for populating demo data
- `.env.example` for local configuration
