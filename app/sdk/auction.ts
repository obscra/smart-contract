/**
 * OBSCRA Auction System — English, Dutch, and sealed-bid auction helpers.
 * Provides structured bid submission, anti-snipe logic, fee computation,
 * settlement helpers, and auction state management.
 *
 * Supports English ascending auctions with 60-second anti-snipe guard,
 * Dutch declining-price auctions, and sealed-bid commit-reveal auctions.
 *
 * @packageDocumentation
 * @see {@link https://docs.obscra.app/auctions}
 */

/** Auction type identifiers. */
export type AuctionType = "english" | "dutch" | "sealed";


/** Anti-snipe configuration for English auctions. */
export interface AntiSnipeConfig {
  /** Window in seconds before end time that triggers extension. */
  guardWindowSeconds: number;
  /** Seconds to extend when anti-snipe fires. */
  extendBySeconds: number;
}

/** English auction listing with full metadata. */
export interface EnglishAuction {
  id: string;
  auctionId: number;
  seller: string;
  title: string;
  description: string;
  category: string;
  dataUri: string;
  startPrice: number;
  minIncrement: number;
  highestBid: number;
  highestBidder: string | null;
  bidCount: number;
  startTime: number;
  endTime: number;
  status: string;
  antiSnipeActive: boolean;
  remainingSeconds: number;
  estimatedClose: string;
}

/** Dutch (declining-price) auction listing. */
export interface DutchAuction {
  id: string;
  auctionId: number;
  seller: string;
  title: string;
  category: string;
  dataUri: string;
  startPrice: number;
  floorPrice: number;
  currentPrice: number;
  endTime: number;
  status: string;
  priceDecayPercent: number;
  timeRemainingPercent: number;
}

/** Sealed (commit-reveal) auction listing. */
export interface SealedAuction {
  id: string;
  auctionId: number;
  seller: string;
  title: string;
  category: string;
  reservePrice: number;
  commitEndTime: number;
  revealEndTime: number;
  status: "commit" | "reveal" | "settled" | "cancelled";
  commitCount: number;
}

/** Bid payload for submitting an English auction bid. */
export interface BidPayload {
  auction: string;
  bidder: string;
  amount: number;
  maxAmount?: number;
}

/** Validation result from bid preflight. */
export interface BidValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  minRequired: number;
  slippageAccepted: boolean;
  antiSnipeTriggered: boolean;
}

/** Fee breakdown for auction settlement. */
export interface AuctionFees {
  total: number;
  protocolFee: number;
  royaltyFee: number;
  sellerNet: number;
  buyerTotal: number;
}

/** Anti-snipe constants (must match Rust constants.rs). */
export const ANTI_SNIPE: AntiSnipeConfig = {
  guardWindowSeconds: 60,
  extendBySeconds: 60,
};

/** Default minimum increment as basis points of start price. */
export const DEFAULT_MIN_INCREMENT_BPS = 500; // 5%

/**
 * Checks whether a given bid amount meets the minimum requirement.
 *
 * @param bidAmount - The bid amount in lamports.
 * @param startPrice - Auction start price in lamports.
 * @param highestBid - Current highest bid in lamports.
 * @param minIncrement - Minimum increment in lamports.
 * @returns Minimum required bid amount.
 */
export function minRequiredBid(
  startPrice: number,
  highestBid: number,
  minIncrement: number,
): number {
  if (highestBid === 0) return startPrice;
  return highestBid + minIncrement;
}

/**
 * Computes the current price of a Dutch auction at a given timestamp.
 *
 * @param startPrice - Starting price in lamports.
 * @param floorPrice - Minimum floor price in lamports.
 * @param startTime - Auction start timestamp.
 * @param endTime - Auction end timestamp.
 * @param now - Current timestamp (defaults to Date.now() / 1000).
 * @returns Current price in lamports.
 */
export function computeDutchPrice(
  startPrice: number,
  floorPrice: number,
  startTime: number,
  endTime: number,
  now: number = Math.floor(Date.now() / 1000),
): number {
  const total = endTime - startTime;
  if (total <= 0) return floorPrice;
  const elapsed = Math.max(0, now - startTime);
  const progress = Math.min(1, elapsed / total);
  return Math.max(floorPrice, startPrice - (startPrice - floorPrice) * progress);
}

/**
 * Validates a bid before submission.
 *
 * @param bidAmount - Proposed bid amount in lamports.
 * @param startPrice - Auction start price in lamports.
 * @param highestBid - Current highest bid in lamports.
 * @param minIncrement - Minimum increment in lamports.
 * @param endTime - Auction end timestamp.
 * @param now - Current timestamp (defaults to Date.now() / 1000).
 * @returns BidValidationResult with errors, warnings, and anti-snipe flag.
 */
export function validateBid(
  bidAmount: number,
  startPrice: number,
  highestBid: number,
  minIncrement: number,
  endTime: number,
  now: number = Math.floor(Date.now() / 1000),
): BidValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (bidAmount <= 0) errors.push("Bid amount must be greater than zero");

  const minRequired = minRequiredBid(startPrice, highestBid, minIncrement);

  if (bidAmount < minRequired) {
    errors.push(
      `Bid of ${bidAmount} lamports is below minimum required ${minRequired} lamports`,
    );
  }

  // Anti-snipe warning
  const remaining = endTime - now;
  const antiSnipeTriggered =
    remaining > 0 && remaining < ANTI_SNIPE.guardWindowSeconds;

  if (antiSnipeTriggered) {
    warnings.push(
      `Anti-snipe window active — ${remaining}s remaining. Bid will extend auction by ${ANTI_SNIPE.extendBySeconds}s`,
    );
  }

  if (now >= endTime) {
    errors.push("Auction has already ended — bids are no longer accepted");
  }

  // Slippage check
  const slippageAccepted = bidAmount >= minRequired;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    minRequired,
    slippageAccepted,
    antiSnipeTriggered,
  };
}

/**
 * Computes the fee breakdown for an auction settlement.
 *
 * @param salePrice - Final sale price in lamports.
 * @param protocolFeeBps - Protocol fee in basis points.
 * @param royaltyBps - Royalty in basis points.
 * @returns AuctionFees with all fee components.
 */
export function computeAuctionFees(
  salePrice: number,
  protocolFeeBps: number,
  royaltyBps: number,
): AuctionFees {
  const protocolFee = Math.floor((salePrice * protocolFeeBps) / 10_000);
  const royaltyFee = Math.floor((salePrice * royaltyBps) / 10_000);
  const sellerNet = salePrice - protocolFee - royaltyFee;

  return {
    total: salePrice,
    protocolFee,
    royaltyFee,
    sellerNet,
    buyerTotal: salePrice, // buyer already paid salePrice
  };
}

/**
 * Estimates the close time for an English auction, accounting for anti-snipe extensions.
 *
 * @param endTime - Original end timestamp.
 * @param bidCount - Number of bids placed.
 * @param lastBidTime - Timestamp of last bid (optional).
 * @returns Estimated close timestamp.
 */
export function estimateCloseTime(
  endTime: number,
  bidCount: number,
  lastBidTime?: number,
): number {
  // Each bid in anti-snipe window extends by extendBySeconds
  // This is a simplified estimation
  if (!lastBidTime) return endTime;
  const remaining = endTime - lastBidTime;
  if (remaining < ANTI_SNIPE.guardWindowSeconds) {
    return lastBidTime + ANTI_SNIPE.extendBySeconds;
  }
  return endTime;
}

/**
 * Formats a lamport amount to a human-readable SOL string.
 *
 * @param lamports - Amount in lamports.
 * @param decimals - Number of decimal places.
 * @returns Formatted SOL string.
 */
export function lamportsToSol(lamports: number, decimals = 4): string {
  return (lamports / 1_000_000_000).toFixed(decimals);
}

/**
 * Formats a Unix timestamp to a human-readable date string.
 *
 * @param timestamp - Unix timestamp in seconds.
 * @returns Formatted date string.
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Returns the remaining time in a human-readable format.
 *
 * @param endTime - Auction end timestamp.
 * @param now - Current timestamp (defaults to Date.now() / 1000).
 * @returns Object with days, hours, minutes, seconds remaining.
 */
export function timeRemaining(
  endTime: number,
  now: number = Math.floor(Date.now() / 1000),
): { days: number; hours: number; minutes: number; seconds: number; expired: boolean } {
  const diff = Math.max(0, endTime - now);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;
  return { days, hours, minutes, seconds, expired: diff === 0 };
}
