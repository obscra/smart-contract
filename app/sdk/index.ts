/**
 * OBSCRA SDK — typed helpers for the OBSCRA Data Marketplace program.
 * Provides high-level wrappers around the on-chain data_market program,
 * cryptographic utilities, file guard preflight, and AI generation helpers.
 *
 * @packageDocumentation
 * @see {@link https://obscra.app}
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { keccak_256 } from "js-sha3";

/** SDK version, aligned with package.json. */
export const SDK_VERSION = "0.2.0";

/** Solana cluster identifiers supported by this SDK. */
export type ObscraCluster = "localnet" | "oobe-staging" | "devnet" | "mainnet-beta";

export {
  guardUploadedFile,
  type FileGuardFinding,
  type FileGuardInput,
  type FileMetadataDescriptor,
  type FileGuardOptions,
  type FileGuardResult,
  type GuardSeverity,
} from "./fileGuard";
export {
  XONA_AGENT,
  buildXonaPrompt,
  createXonaGeneratedAsset,
  type XonaAgentConfig,
  type XonaGeneratedAsset,
  type XonaGenerationRequest,
  type XonaDatasetContext,
} from "./xonaAgent";
export {
  computeBlurPreview,
  blurPreviewStyle,
  defaultBlurForClass,
  canUnlockBlur,
  type BlurIntensity,
  type BlurPreviewOptions,
  type BlurPreviewResult,
} from "./blurPreview";
export {
  computeSellerSummary,
  formatStarDisplay,
  ratingToSentiment,
  validateReview,
  isReviewEligible,
  ratingLabel,
  type StarRating,
  type ReviewSentiment,
  type SellerReviewSummary,
  type ReviewEntry,
  type SubmitReviewPayload,
  type ReviewValidationResult,
} from "./review";
export {
  computeDutchPrice,
  minRequiredBid,
  validateBid,
  computeAuctionFees,
  estimateCloseTime,
  lamportsToSol,
  formatTimestamp,
  timeRemaining,
  ANTI_SNIPE,
  type AuctionType,
  type BidPayload,
  type BidValidationResult,
  type AuctionFees,
  type EnglishAuction,
  type DutchAuction,
  type SealedAuction,
  type AntiSnipeConfig,
} from "./auction";
export {
  OBSCRA_RPC_ENDPOINT,
  OBSCRA_RPC_LABEL,
  resolveObscraRpcEndpoint,
} from "./rpc";

export const SEED = {
  MARKETPLACE: Buffer.from("obs_protocol"),
  LISTING: Buffer.from("obs_offer"),
  AUCTION: Buffer.from("obs_english"),
  DUTCH: Buffer.from("obs_declining"),
  SEALED: Buffer.from("obs_hidden"),
  ESCROW: Buffer.from("obs_vault"),
  USER: Buffer.from("obs_trader"),
  REVIEW: Buffer.from("obs_feedback"),
  SUBSCRIPTION: Buffer.from("obs_access"),
  DISPUTE: Buffer.from("obs_claim"),
  SEALED_BID: Buffer.from("obs_hidden_bid"),
} as const;

export class ObscraClient {
  public readonly program: anchor.Program;
  public readonly provider: anchor.AnchorProvider;

  constructor(program: anchor.Program, provider: anchor.AnchorProvider) {
    this.program = program;
    this.provider = provider;
  }

  get programId(): PublicKey {
    return this.program.programId;
  }

  // ── PDA derivation ──────────────────────────────────────────────────

  protocolPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED.MARKETPLACE],
      this.programId,
    );
  }

  traderPda(wallet: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED.USER, wallet.toBuffer()],
      this.programId,
    );
  }

  offerPda(seller: PublicKey, id: anchor.BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED.LISTING, seller.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
      this.programId,
    );
  }

  englishPda(seller: PublicKey, id: anchor.BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED.AUCTION, seller.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
      this.programId,
    );
  }

  decliningPda(seller: PublicKey, id: anchor.BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED.DUTCH, seller.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
      this.programId,
    );
  }

  hiddenPda(seller: PublicKey, id: anchor.BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED.SEALED, seller.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
      this.programId,
    );
  }

  vaultPda(auction: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED.ESCROW, auction.toBuffer()],
      this.programId,
    );
  }

  accessPlanPda(seller: PublicKey, id: anchor.BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED.SUBSCRIPTION, seller.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
      this.programId,
    );
  }

  accessPda(plan: PublicKey, subscriber: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED.SUBSCRIPTION, plan.toBuffer(), subscriber.toBuffer()],
      this.programId,
    );
  }

  feedbackPda(listing: PublicKey, reviewer: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED.REVIEW, listing.toBuffer(), reviewer.toBuffer()],
      this.programId,
    );
  }

  claimPda(listing: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED.DISPUTE, listing.toBuffer()],
      this.programId,
    );
  }

  hiddenBidPda(auction: PublicKey, bidder: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED.SEALED_BID, auction.toBuffer(), bidder.toBuffer()],
      this.programId,
    );
  }

  // ── Cryptographic helpers ───────────────────────────────────────────

  static computeSealedHash(amount: anchor.BN, nonce: Uint8Array): Uint8Array {
    if (nonce.length !== 32) {
      throw new Error("nonce must be exactly 32 bytes");
    }
    const payload = Buffer.concat([
      amount.toArrayLike(Buffer, "le", 8),
      Buffer.from(nonce),
    ]);
    return new Uint8Array(Buffer.from(keccak_256.arrayBuffer(payload)));
  }

  static randomNonce(): Uint8Array {
    return Keypair.generate().publicKey.toBytes().slice(0, 32);
  }

  // ── High-level transaction wrappers ─────────────────────────────────

  async bootstrapProtocol(params: {
    authority: Keypair;
    treasury: PublicKey;
    arbitrator: PublicKey;
    feeBps: number;
  }): Promise<string> {
    const [protocol] = this.protocolPda();

    return this.program.methods
      .bootstrapProtocol(params.feeBps)
      .accounts({
        protocol,
        authority: params.authority.publicKey,
        treasury: params.treasury,
        arbitrator: params.arbitrator,
        systemProgram: SystemProgram.programId,
      })
      .signers([params.authority])
      .rpc();
  }

  async publishOffer(params: {
    seller: Keypair;
    offerId: anchor.BN;
    price: anchor.BN;
    title: string;
    description: string;
    category: string;
    tags: string[];
    dataUri: string;
    previewUri: string;
    encryptedKeyHash: Uint8Array;
    royaltyBps: number;
    privateSale: boolean;
    whitelistedBuyer: PublicKey | null;
  }): Promise<string> {
    const [protocol] = this.protocolPda();
    const [listing] = this.offerPda(params.seller.publicKey, params.offerId);

    return this.program.methods
      .publishOffer(
        params.offerId,
        params.price,
        params.title,
        params.description,
        params.category,
        params.tags,
        params.dataUri,
        params.previewUri,
        Array.from(params.encryptedKeyHash),
        params.royaltyBps,
        params.privateSale,
        params.whitelistedBuyer,
      )
      .accounts({
        protocol,
        listing,
        seller: params.seller.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([params.seller])
      .rpc();
  }
}

// ── On-chain enum mirrors ───────────────────────────────────────────────

export enum ListingStatus {
  Active = 0,
  Sold = 1,
  Cancelled = 2,
}

export enum AuctionStatus {
  Active = 0,
  Settled = 1,
  Cancelled = 2,
  EndedNoBids = 3,
}

export enum DutchStatus {
  Active = 0,
  Filled = 1,
  Cancelled = 2,
  Expired = 3,
}

export enum SealedStatus {
  Commit = 0,
  Reveal = 1,
  Settled = 2,
  Cancelled = 3,
}

/* ── Validation helpers ─────────────────────────────────────────────────── */

/**
 * Validates that a title string conforms to OBSCRA listing requirements.
 * @param title - The listing title to validate.
 * @returns `true` if valid; throws with a descriptive message otherwise.
 */
export function validateTitle(title: string): boolean {
  if (!title || title.trim().length === 0) {
    throw new Error("[obscra] title must not be empty");
  }
  if (title.trim().length > 80) {
    throw new Error("[obscra] title exceeds maximum length of 80 characters");
  }
  return true;
}

/**
 * Validates that a price (in lamports) is within acceptable bounds.
 * @param lamports - The price in lamports.
 * @throws If price is zero or exceeds u64::MAX.
 */
export function validatePrice(lamports: bigint | number): boolean {
  if (lamports <= 0) {
    throw new Error("[obscra] price must be greater than zero lamports");
  }
  const MAX_U64 = BigInt("0xffffffffffffffff");
  if (BigInt(lamports) > MAX_U64) {
    throw new Error("[obscra] price exceeds u64::MAX");
  }
  return true;
}

/**
 * Resolves a cluster alias to a full RPC URL.
 * @param cluster - The cluster identifier.
 * @returns The full RPC endpoint URL.
 */
export function resolveClusterUrl(cluster: ObscraCluster): string {
  switch (cluster) {
    case "oobe-staging":
      return "https://staging.oobeprotocol.ai:8080/rpc";
    case "devnet":
      return "https://api.devnet.solana.com";
    case "mainnet-beta":
      return "https://api.mainnet-beta.solana.com";
    case "localnet":
    default:
      return "http://localhost:8899";
  }
}
