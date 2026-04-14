<div align="center">

<svg width="72" height="72" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="180" height="180" rx="37" fill="black"/>
  <g style="transform: scale(95%); transform-origin: center">
    <path fill="white" d="M101.141 53H136.632C151.023 53 162.689 64.6662 162.689 79.0573V112.904H148.112V79.0573C148.112 78.7105 148.098 78.3662 148.072 78.0251L112.581 112.898C112.701 112.902 112.821 112.904 112.941 112.904H148.112V126.672H112.941C98.5504 126.672 86.5638 114.891 86.5638 100.5V66.7434H101.141V100.5C101.141 101.15 101.191 101.792 101.289 102.422L137.56 66.7816C137.255 66.7563 136.945 66.7434 136.632 66.7434H101.141V53Z"/>
    <path fill="white" d="M65.2926 124.136L14 66.7372H34.6355L64.7495 100.436V66.7372H80.1365V118.47C80.1365 126.278 70.4953 129.958 65.2926 124.136Z"/>
  </g>
</svg>

# OBSCRA

**Encrypted data marketplace protocol on Solana.**

*Encrypt. List. Get paid. No middlemen.*

---

[![Solana](https://img.shields.io/badge/Solana-9945FF?style=flat-square&logo=solana&logoColor=white)](https://solana.com)
[![Anchor](https://img.shields.io/badge/Anchor-0.30.1-white?style=flat-square)](https://anchor-lang.com)
[![Rust](https://img.shields.io/badge/Rust-1.78-CE422B?style=flat-square&logo=rust&logoColor=white)](https://rust-lang.org)
[![IPFS](https://img.shields.io/badge/Storage-IPFS-65C2CB?style=flat-square)](https://ipfs.tech)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-eca8d6?style=flat-square)](LICENSE)

[**Market**](https://obscra.app/market) · [**Data Drops**](https://obscra.app/auction) · [**Docs**](https://obscra.app) · [**X**](https://x.com/Obscra_void) · [**Telegram**](https://t.me/Obscra_Portal)

</div>

---

## What is OBSCRA?

OBSCRA is a **non-custodial data marketplace and auction protocol** on Solana. Creators encrypt files client-side, upload ciphertext to IPFS, and list them on-chain — fixed-price, auction, or subscription. Buyers pay in SOL; settlement is instant and atomic. No accounts. No server-side custody. No plaintext data ever touches the chain.

This repo contains the **Solana smart contract** (`data_market`) handling all on-chain settlement: fixed-price sales, three auction formats (English, Dutch, sealed-bid), time-based subscriptions, reputation scoring, and buyer dispute resolution.

> The full DApp lives at [`obscra`](../obscra) — Next.js frontend with wallet adapter, IPFS via Pinata, and Supabase indexing.

---

## Features

| Feature | Name | What it does |
|---|---|---|
| Fixed-price sale | **Market** | Set a SOL price, buyer pays, decryption key is delivered |
| Ascending auction | **Data Drops** | Live bidding with escrow, anti-snipe timer, atomic refunds |
| Sealed-bid auction | **Private Drop** | Commit-reveal with keccak256 — bids stay hidden until reveal |
| Declining-price | **Dutch Drop** | Price falls linearly; first buyer to fill wins at clock price |
| Subscription access | **Pass** | Per-day pricing, stackable renewals, seller-controlled plans |
| Private delivery | **Direct Transfer** | Whitelisted single-buyer sales with on-chain proof |
| Reputation | **Trust Score** | 1-5 star post-sale ratings aggregated per seller profile |
| Disputes | **Claim** | 7-day buyer window, arbitrator-resolved with on-chain outcome |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                 OBSCRA DApp (Next.js)                 │
│                                                       │
│  /market   /auction   /cloud   /direct-transfer       │
│       ↑            ↑                                  │
│  Supabase     Wallet Adapter (Phantom / Solflare /    │
│  (off-chain    Backpack) + @solana/wallet-adapter     │
│   index)                                              │
└───────────────────────┬───────────────────────────────┘
                        │  Anchor CPI
┌───────────────────────▼───────────────────────────────┐
│           data_market  (this repo, BPF/SBF)           │
│                                                       │
│  instructions/          state/          utils/        │
│  ├── admin              ├── marketplace  ├── fees     │
│  ├── listing            ├── listing      ├── math     │
│  ├── english_auction    ├── auction      └── clock    │
│  ├── dutch_auction      ├── dutch                     │
│  ├── sealed_auction     ├── sealed                    │
│  ├── subscription       ├── subscription              │
│  ├── review             ├── review                    │
│  └── dispute            └── dispute                   │
└───────────────────────┬───────────────────────────────┘
                        │
           ┌────────────┼────────────┐
           ▼            ▼            ▼
       Solana RPC     IPFS        Helius
    (settlement)  (ciphertext)  (webhooks
                  via Pinata)   → indexer)
```

### How data stays private

Files never touch any OBSCRA server in plaintext.

```
 Creator                     OBSCRA Protocol               Buyer
    │                               │                         │
    │  1. encrypt(file, AES-256)    │                         │
    │  2. upload ciphertext → IPFS  │                         │
    │  3. list(data_uri, H(key))    │                         │
    ├──────────────────────────────▶│                         │
    │                               │  4. buy / bid (SOL)     │
    │                               │◀────────────────────────┤
    │                               │  seller_net → creator   │
    │                               │  fee       → treasury   │
    │◀───── event: DataSold ────────┤─── event: DataSold ────▶│
    │                               │                         │
    │  5. re-encrypt key            │                         │
    │     with buyer's pubkey       │                         │
    ├──────────────────────────────────────────────────────▶  │
    │                                              6. decrypt  │
    │                                              + download  │
```

The contract stores `encrypted_key_hash = H(key)` as an on-chain commitment. It only enforces **payment** and **access rights** — never plaintext keys.

---

## Auction mechanics

### Data Drops (English ascending)

Classic ascending auction. Each bid must beat the last by `min_increment`. Previous bidder gets refunded atomically in the same instruction. **Anti-snipe**: bids in the last 60 seconds extend the close time by 60 seconds.

```
Floor: 0.5 SOL   →   Bid: 0.6   →   Bid: 0.75   →   Bid: 0.9   →   SOLD
                                                   ↑ last 60s → +60s
```

### Dutch Drop (declining-price)

Price decays linearly from `start_price` to `floor_price` over the auction window. First buyer to call `fill_dutch_auction(max_price)` wins at whatever the clock reads. `max_price` provides slippage protection.

```
5.0 SOL ────────────────────────── 0.5 SOL
  t=0      t=150s    t=300s    t=600s
                  ↑ buyer fills at ~3.2 SOL
```

### Private Drop (sealed-bid commit-reveal)

1. **Commit** — bidder submits `keccak256(amount_le || nonce)` + deposit
2. **Reveal** — disclose `(amount, nonce)`; contract verifies the hash
3. **Settle** — highest revealed bid wins; losers claim deposits back

Bids are hidden on-chain until the reveal phase — no last-second copying.

---

## Project structure

```
obscra-contracts/
├── programs/data_market/src/
│   ├── lib.rs                    ← 26 instructions
│   ├── constants.rs              ← sizes, seeds, fee caps
│   ├── errors.rs                 ← MarketError enum (45 variants)
│   ├── events.rs                 ← all #[event] structs
│   ├── utils.rs                  ← fee math, dutch curve, lamport helpers
│   ├── state/                    ← one file per account type
│   │   ├── marketplace.rs        ← Marketplace (singleton PDA)
│   │   ├── user.rs               ← UserProfile + Trust Score
│   │   ├── listing.rs            ← DataListing + ListingStatus
│   │   ├── auction.rs            ← Auction (english)
│   │   ├── dutch.rs              ← DutchAuction
│   │   ├── sealed.rs             ← SealedAuction + SealedBid
│   │   ├── subscription.rs       ← SubscriptionPlan + Subscription
│   │   ├── review.rs             ← Review
│   │   └── dispute.rs            ← Dispute
│   └── instructions/             ← handlers + #[derive(Accounts)]
│       ├── admin.rs
│       ├── user.rs
│       ├── listing.rs
│       ├── english_auction.rs
│       ├── dutch_auction.rs
│       ├── sealed_auction.rs
│       ├── subscription.rs
│       ├── review.rs
│       └── dispute.rs
│
├── app/sdk/index.ts              ← TypeScript client SDK + PDA helpers
├── indexer/                      ← real-time + backfill event indexers
├── tests/                        ← 7 integration test suites
├── scripts/                      ← deploy, airdrop, seed
├── .github/workflows/            ← CI: lint → audit → build → size report
├── docs/
│   ├── ARCHITECTURE.md
│   └── SECURITY.md
└── Makefile                      ← make build / test / deploy-devnet / size
```

---

## PDA map

| Account | Seeds | Description |
|---|---|---|
| `Marketplace` | `["marketplace"]` | Singleton config, fee settings, arbitrator |
| `UserProfile` | `["user", wallet]` | Trust Score, volume stats |
| `DataListing` | `["listing", seller, id]` | Fixed-price listing |
| `Auction` | `["auction", seller, id]` | Data Drop (english) |
| `DutchAuction` | `["dutch", seller, id]` | Dutch Drop |
| `SealedAuction` | `["sealed", seller, id]` | Private Drop |
| `SealedBid` | `["sealed_bid", auction, bidder]` | Per-bidder commit |
| `Escrow` | `["escrow", auction]` | Lamport-only escrow |
| `SubscriptionPlan` | `["subscription", seller, id]` | Access pass plan |
| `Subscription` | `["subscription", plan, subscriber]` | Active pass |
| `Review` | `["review", listing, reviewer]` | Post-sale review |
| `Dispute` | `["dispute", listing]` | Buyer dispute claim |

---

## Fee structure

```
gross_price
  ├── marketplace_fee = price × fee_bps / 10_000   → treasury
  ├── royalty         = price × royalty_bps / 10_000 → creator
  └── seller_net      = remainder                   → seller
```

- Default fee: **2.5%** (`fee_bps = 250`)
- Hard cap: **10%** (`MAX_FEE_BPS = 1000`)
- Max royalty: **5%** (`MAX_ROYALTY_BPS = 500`)
- All math uses `checked_*` — overflows return `MarketError::MathOverflow`

---

## Security

- **AES-256 client-side encryption** — files encrypt in the browser before IPFS upload; OBSCRA never holds a plaintext key
- **Escrow PDAs** are system-owned lamport-only accounts — zero deserialization attack surface
- **`has_one` constraints** verify seller ownership without extra signatures
- **`address = marketplace.treasury`** prevents fee redirection by malicious callers
- **Anti-snipe** — bids in the last 60s extend the auction by 60s
- **Sealed-bid privacy** — only `keccak256(amount || nonce)` is stored during commit phase
- **7-day dispute window** — buyers can open a claim; arbitrator resolves on-chain
- **Self-trade guard** — buyers cannot purchase their own listing or bid on their own auction
- **Overflow-safe** — every arithmetic path returns `MathOverflow` on failure

Full threat model and audit checklist: [`docs/SECURITY.md`](docs/SECURITY.md)

---

## Quick start

```bash
# Prerequisites: Rust 1.78, Solana CLI 1.18, Anchor 0.30, Node 20, yarn

git clone https://github.com/obscra/obscra-contracts
cd obscra-contracts
yarn install

# Build and test locally
make build
make test

# Deploy to devnet
make deploy-devnet

# Populate sample data
make seed
```

After deploy, update `declare_id!` in `programs/data_market/src/lib.rs` and `Anchor.toml` with:
```bash
make keys
```

---

## Environment

```bash
cp .env.example .env
# Edit:
#   ANCHOR_PROVIDER_URL — devnet or mainnet-beta RPC
#   ANCHOR_WALLET       — path to your keypair
#   TREASURY_KEYPAIR    — fee collection wallet
#   ARBITRATOR_KEYPAIR  — dispute resolution wallet
```

---

## Testing

```bash
make test                 # full suite with local validator
make test-skip-validator  # against an already-running validator
make size                 # check .so binary vs 1.5 MiB BPF limit
```

| Suite | Coverage |
|---|---|
| `admin.ts` | Init, fee cap, pause, treasury rotation, unauthorized reject |
| `data_market.ts` | Fixed-price list + buy, English auction lifecycle |
| `dutch_auction.ts` | Create, slippage guard, fill, double-fill reject |
| `sealed_auction.ts` | Create, dual commit, bad-nonce reject, hash determinism |
| `subscription.ts` | Create plan, purchase, renewal stacking, plan pause |
| `reputation_dispute.ts` | List → buy → review → dispute → arbitrate |
| `user_profile.ts` | Register, update, auth guard, length validation |

---

## Instruction reference (26 total)

<details>
<summary>Admin</summary>

| Instruction | Description |
|---|---|
| `initialize_marketplace` | Create singleton PDA with treasury + arbitrator + fee |
| `update_marketplace_config` | Update fee, pause, rotate treasury / arbitrator |

</details>

<details>
<summary>Users</summary>

| Instruction | Description |
|---|---|
| `register_user` | Create on-chain Trust Score profile |
| `update_profile` | Change username / avatar URI |

</details>

<details>
<summary>Market (fixed price)</summary>

| Instruction | Description |
|---|---|
| `list_data` | Publish listing with price, category, tags, royalty, optional whitelist |
| `update_listing_price` | Reprice before sale |
| `buy_data` | Atomic payment split: seller + fee + royalty; updates reputation |
| `delist_data` | Cancel active listing |

</details>

<details>
<summary>Data Drops (English auction)</summary>

| Instruction | Description |
|---|---|
| `create_auction` | Open ascending auction with start price + increment |
| `place_bid` | Escrow new bid, refund displaced bidder, anti-snipe |
| `finalize_auction` | Distribute escrow after end time |
| `cancel_auction` | Seller cancels before first bid |

</details>

<details>
<summary>Dutch Drop</summary>

| Instruction | Description |
|---|---|
| `create_dutch_auction` | Open declining-price auction |
| `fill_dutch_auction` | Buy at current clock price (slippage guard) |
| `cancel_dutch_auction` | Seller cancels unfilled auction |

</details>

<details>
<summary>Private Drop (sealed bid)</summary>

| Instruction | Description |
|---|---|
| `create_sealed_auction` | Open commit + reveal phase auction |
| `commit_sealed_bid` | Submit `keccak256(amount || nonce)` + deposit |
| `reveal_sealed_bid` | Verify commitment, record bid |
| `settle_sealed_auction` | Distribute to winner after reveal deadline |
| `refund_sealed_bid` | Losers claim deposit back |

</details>

<details>
<summary>Pass (subscriptions)</summary>

| Instruction | Description |
|---|---|
| `create_subscription_plan` | Publish recurring access plan |
| `set_subscription_plan_active` | Toggle plan availability |
| `purchase_subscription` | Buy N days; renewals stack on expiry |

</details>

<details>
<summary>Trust & Claims</summary>

| Instruction | Description |
|---|---|
| `submit_review` | 1-5 star review, feeds seller Trust Score |
| `open_dispute` | Buyer opens a claim within 7 days of purchase |
| `resolve_dispute` | Arbitrator decides outcome, records refund |

</details>

---

## Integrations

| Partner | Role |
|---|---|
| [Pinata](https://pinata.cloud) | IPFS pinning for encrypted payloads |
| [Helius](https://helius.dev) | WebSocket log subscription for off-chain indexing |
| [Metaplex](https://metaplex.com) | cNFT access token support (v2 roadmap) |
| [Supabase](https://supabase.com) | Off-chain listing index + bid history |

---

## Roadmap

- [ ] SPL-token payments (USDC / USDT via `anchor-spl`)
- [ ] cNFT-gated access via Metaplex Bubblegum
- [ ] Bundle listings — multiple files, one settlement
- [ ] Secondary-market re-listing with enforced royalties
- [ ] Oracle-verified data freshness proofs
- [ ] Squads multisig for authority from day 1

---

## Contributing

See [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md). Quick version:

```bash
make fmt        # rustfmt + prettier
make lint       # clippy -D warnings + tsc --noEmit
make test       # full suite
```

All PRs must include a `CHANGELOG.md` entry and pass CI.

---

## License

MIT — see [`LICENSE`](LICENSE).

---

<div align="center">

**OBSCRA** — *Built for creators. Settled on Solana.*

[obscra.app](https://obscra.app) · [X](https://x.com/Obscra_void) · [Telegram](https://t.me/Obscra_Portal) · [GitHub](https://github.com/obscra)

</div>
