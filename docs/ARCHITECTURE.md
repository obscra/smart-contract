# Architecture

## Account model

All on-chain state lives inside **PDAs** (Program-Derived Addresses). Anyone reading the chain can reconstruct pointers without an external index.

| Account | Seeds | Purpose |
|---|---|---|
| `Marketplace` | `["marketplace"]` | Singleton config + global counters |
| `UserProfile` | `["user", wallet]` | Reputation, volume stats |
| `DataListing` | `["listing", seller, listing_id]` | Fixed-price sale |
| `Auction` | `["auction", seller, auction_id]` | English auction |
| `DutchAuction` | `["dutch", seller, auction_id]` | Dutch auction |
| `SealedAuction` | `["sealed", seller, auction_id]` | Sealed commit-reveal auction |
| `SealedBid` | `["sealed_bid", auction, bidder]` | Per-bidder commit record |
| `Escrow` | `["escrow", auction]` | Lamport-only escrow PDA |
| `SubscriptionPlan` | `["subscription", seller, plan_id]` | Recurring access plan |
| `Subscription` | `["subscription", plan, subscriber]` | Active subscription |
| `Review` | `["review", listing, reviewer]` | Post-sale review |
| `Dispute` | `["dispute", listing]` | Buyer-opened dispute |

## State transitions

### Listing
```
Active ──buy──▶ Sold
   │
   └─delist──▶ Cancelled
```

### English auction
```
Active ──finalize (no bids)──▶ EndedNoBids
   │
   ├─finalize (with bid)──▶ Settled
   │
   └─cancel (no bids)──▶ Cancelled
```

### Dutch auction
```
Active ──fill──▶ Filled
   │
   ├─timeout─▶ Expired   (price pins at floor_price)
   │
   └─cancel──▶ Cancelled
```

### Sealed auction
```
Commit ──(first reveal after commit_end)──▶ Reveal ──settle──▶ Settled
   │                                                            ▲
   └──────────────── no-reveal or no-commit ────▶ Cancelled ────┘
```

## Fee waterfall

For every settlement, gross proceeds split as:

```
price = seller_net + marketplace_fee + royalty
     ├─── marketplace_fee = price * fee_bps / 10_000
     ├─── royalty         = price * royalty_bps / 10_000
     └─── seller_net      = remainder
```

`fee_bps` is capped at `MAX_FEE_BPS = 1000` (10%) and `royalty_bps` at `MAX_ROYALTY_BPS = 500` (5%).

## Event-driven indexing

Every write instruction emits a typed event. Off-chain indexers (Helius webhooks, custom WebSocket listeners) subscribe and populate a relational DB:

- `DataListed`, `DataSold`, `DataDelisted`
- `AuctionCreated`, `BidPlaced`, `AuctionFinalized`, `AuctionCancelled`
- `DutchAuctionCreated`, `DutchAuctionFilled`
- `SealedAuctionCreated`, `SealedBidCommitted`, `SealedBidRevealed`, `SealedAuctionSettled`
- `SubscriptionPlanCreated`, `SubscriptionPurchased`
- `ReviewSubmitted`
- `DisputeOpened`, `DisputeResolved`

Events are the **canonical activity feed**. Frontends should drive UI from indexer output rather than polling accounts.

## Off-chain key delivery

The contract commits to `encrypted_key_hash = H(key)` at listing time. After settlement:

1. **Direct seller release** — seller watches `DataSold`, re-encrypts the key to the buyer's pubkey.
2. **TEE-based keeper** — a trusted enclave holds the master key and releases on verified settlement.
3. **Threshold re-encryption** — Lit Protocol or similar issues re-encryption shares once on-chain proof is presented.

The dispute flow handles the "seller never released key" case: buyer opens within 7 days, arbitrator refunds on proof.
