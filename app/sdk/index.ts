// OBSCRA SDK — typed helpers for the OBSCRA Data Marketplace program.

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { keccak_256 } from "js-sha3";

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
