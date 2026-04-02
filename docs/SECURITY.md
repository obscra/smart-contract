# Security Model

## Trust assumptions

| Actor | Trusted for | Not trusted for |
|---|---|---|
| `authority` | Marketplace config, pause switch, treasury rotation | Seller/buyer funds (never held) |
| `treasury` | Receiving fees | Custody of user funds |
| `arbitrator` | Resolving disputes within the 7-day window | Cannot move funds directly |
| Seller | Delivering key after `DataSold` event | Listing integrity (buyer can dispute) |
| Buyer | Reviewing post-sale in good faith | Front-running other bidders |

## On-chain invariants

1. **Fee cap** — `fee_bps <= 1000` (10%), `royalty_bps <= 500` (5%). Enforced on every config update and listing creation.
2. **Self-trade forbidden** — `buyer != seller` on fixed-price and Dutch; `bidder != seller` on all auction types.
3. **Price monotonicity** — each English auction bid must be `>= highest_bid + min_increment`.
4. **Sealed deposit coverage** — `reveal_sealed_bid` rejects reveals where `amount > deposit`.
5. **Commitment integrity** — `keccak256(amount_le || nonce) == commitment` required on reveal.
6. **Refund atomicity** — on English outbid, the prior refund and new escrow happen in the same instruction.
7. **Dispute window** — hard-coded 7-day window from `settled_at`; `DisputeWindowClosed` after that.

## Threat vectors and mitigations

| Vector | Mitigation |
|---|---|
| Auction sniping | Anti-snipe window (60s) auto-extends `end_time` |
| Sealed-bid peeking | Commit-reveal with client-side nonce; only hash stored on-chain |
| Treasury redirection | `address = marketplace.treasury` constraint on all fee-paying ixs |
| Previous-bidder impersonation | `WrongPreviousBidder` check against stored `auction.highest_bidder` |
| Replay of old listing IDs | PDAs include `listing_id`/`auction_id` — collision impossible |
| Seller key withhold | 7-day buyer dispute window with arbitrator refund |
| Arbitrator capture | Authority can rotate arbitrator via `update_marketplace_config` |
| Fee exfiltration by authority | Authority can change `fee_bps` (capped at 10%) but cannot redirect mid-settle |
| Integer overflow | All arithmetic uses `checked_*` operations |
| Reinit / duplicate PDA | Anchor's `init` constraint rejects if account already exists |
| Lamport drain from escrow | Escrow PDA writes gated by auction state + `escrow_bump` |

## Deliberate non-goals (v1)

- **No SPL-token payments** — SOL-only to minimise attack surface. Token support planned for v2.
- **No on-chain data verification** — authenticity of off-chain payloads is outside the protocol; buyers rely on seller reputation + dispute fallback.
- **No automated royalty enforcement on secondary markets** — royalty triggers only on primary sale through this program.
- **No governance** — admin keypair is the authority. Migration to multisig / DAO is a deployment decision.

## Audit checklist (pre-mainnet)

- [ ] Static analysis with `cargo-audit` + `soteria`
- [ ] Fuzz harness over fee/royalty math with proptest
- [ ] Manual review of every `pda_withdraw` call for rent-exempt preservation
- [ ] Load test: 1000 concurrent bidders on one English auction
- [ ] Upgrade authority rotation plan (prefer squads multisig on day 1)
- [ ] Treasury cold-storage rotation schedule documented
