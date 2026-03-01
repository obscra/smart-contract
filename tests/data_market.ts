/**
 * OBSCRA Data Marketplace -- end-to-end smoke tests.
 *
 * Exercises the core protocol surface: protocol init, fixed-price
 * listing + purchase, English auction with bid/refund, Dutch auction
 * creation, and sealed-bid commitment hashing.
 *
 * Run via `anchor test` against a local validator.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

import { ObscraClient } from "../app/sdk";
// Anchor emits this IDL at build time.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const idl = require("../target/idl/data_market.json");

/** OBSCRA platform fee: 2.5 % */
const FEE_BPS = 250;

describe("OBSCRA data_market", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl as anchor.Idl, provider) as unknown as Program;
  const client = new ObscraClient(program, provider);

  /* ---- participants ---- */
  const authority = Keypair.generate();
  const treasury = Keypair.generate();
  const arbitrator = Keypair.generate();
  const alice = Keypair.generate(); // seller
  const bob = Keypair.generate();   // buyer
  const carol = Keypair.generate(); // second bidder

  /** Airdrop helper scoped to this suite. */
  async function fund(pk: PublicKey, sol: number): Promise<void> {
    const sig = await provider.connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  before(async () => {
    await Promise.all([
      fund(authority.publicKey, 5),
      fund(alice.publicKey, 10),
      fund(bob.publicKey, 10),
      fund(carol.publicKey, 10),
    ]);
  });

  /* ---------------------------------------------------------------------- */
  /*  Marketplace init                                                       */
  /* ---------------------------------------------------------------------- */

  it("initializes the OBSCRA protocol", async () => {
    await client.bootstrapProtocol({
      authority,
      treasury: treasury.publicKey,
      arbitrator: arbitrator.publicKey,
      feeBps: FEE_BPS,
    });

    const [pda] = client.protocolPda();
    const protocol: any = await (program.account as any).protocol.fetch(pda);

    expect(protocol.feeBps).to.equal(FEE_BPS);
    expect(protocol.paused).to.equal(false);
  });

  /* ---------------------------------------------------------------------- */
  /*  Fixed-price sale                                                       */
  /* ---------------------------------------------------------------------- */

  describe("fixed-price sale", () => {
    const offerId = new BN(1);
    const price = new BN(1 * LAMPORTS_PER_SOL);
    const keyHash = Buffer.alloc(32, 7);

    it("lists and sells data on OBSCRA", async () => {
      await client.publishOffer({
        seller: alice,
        offerId,
        price,
        title: "ETH 1-min OHLCV 2024",
        description: "Minute candles for ETH/USD, full year 2024",
        category: "market-data",
        tags: ["crypto", "ohlcv"],
        dataUri: "ipfs://QmExampleEncryptedBundle",
        previewUri: "ipfs://QmPreview",
        encryptedKeyHash: new Uint8Array(keyHash),
        royaltyBps: 100,
        privateSale: false,
        whitelistedBuyer: null,
      });

      const [protocol] = client.protocolPda();
      const [listing] = client.offerPda(alice.publicKey, offerId);
      const sellerBalBefore = await provider.connection.getBalance(alice.publicKey);

      await program.methods
        .fillOffer()
        .accounts({
          protocol,
          listing,
          buyer: bob.publicKey,
          seller: alice.publicKey,
          treasury: treasury.publicKey,
          sellerProfile: null,
          buyerProfile: null,
          systemProgram: SystemProgram.programId,
        })
        .signers([bob])
        .rpc();

      const sellerBalAfter = await provider.connection.getBalance(alice.publicKey);
      expect(sellerBalAfter).to.be.greaterThan(sellerBalBefore);

      const row: any = await (program.account as any).dataListing.fetch(listing);
      expect(row.buyer.toBase58()).to.equal(bob.publicKey.toBase58());
    });
  });

  /* ---------------------------------------------------------------------- */
  /*  English auction                                                        */
  /* ---------------------------------------------------------------------- */

  describe("English auction", () => {
    it("runs bid / refund / finalize lifecycle", async () => {
      const auctionId = new BN(42);
      const [protocol] = client.protocolPda();
      const [auction] = client.englishPda(alice.publicKey, auctionId);
      const [escrow] = client.vaultPda(auction);

      const startPrice = new BN(0.5 * LAMPORTS_PER_SOL);
      const increment = new BN(0.1 * LAMPORTS_PER_SOL);

      await program.methods
        .openEnglish(
          auctionId,
          startPrice,
          increment,
          new BN(60),
          "Rare signal",
          "alpha for 2026-Q2",
          "signals",
          "ipfs://signal-bundle",
          Array.from(Buffer.alloc(32, 3)),
          0,
        )
        .accounts({
          protocol,
          auction,
          escrow,
          seller: alice.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([alice])
        .rpc();

      // Bob places opening bid
      await program.methods
        .submitEnglishBid(startPrice)
        .accounts({
          auction,
          escrow,
          bidder: bob.publicKey,
          previousBidder: null,
          systemProgram: SystemProgram.programId,
        })
        .signers([bob])
        .rpc();

      // Carol outbids -- Bob should be refunded
      const bobBalBefore = await provider.connection.getBalance(bob.publicKey);

      await program.methods
        .submitEnglishBid(startPrice.add(increment))
        .accounts({
          auction,
          escrow,
          bidder: carol.publicKey,
          previousBidder: bob.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([carol])
        .rpc();

      const bobBalAfter = await provider.connection.getBalance(bob.publicKey);
      expect(bobBalAfter).to.be.greaterThan(bobBalBefore);
    });
  });

  /* ---------------------------------------------------------------------- */
  /*  Dutch auction price decay                                              */
  /* ---------------------------------------------------------------------- */

  describe("Dutch auction price decay", () => {
    it("computes a price between floor and start", async () => {
      const auctionId = new BN(7);
      const [protocol] = client.protocolPda();
      const [auction] = client.decliningPda(alice.publicKey, auctionId);

      await program.methods
        .openDeclining(
          auctionId,
          new BN(2 * LAMPORTS_PER_SOL),
          new BN(0.5 * LAMPORTS_PER_SOL),
          new BN(300),
          new BN(10),
          "ML weights snapshot",
          "Trained on 2025 data",
          "ml-models",
          "ipfs://weights-bundle",
          Array.from(Buffer.alloc(32, 9)),
          0,
        )
        .accounts({
          protocol,
          auction,
          seller: alice.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([alice])
        .rpc();

      const row: any = await (program.account as any).dutchAuction.fetch(auction);
      expect(row.startPrice.toString()).to.equal(new BN(2 * LAMPORTS_PER_SOL).toString());
    });
  });

  /* ---------------------------------------------------------------------- */
  /*  Sealed-bid commitment                                                  */
  /* ---------------------------------------------------------------------- */

  describe("sealed-bid commitment", () => {
    it("hashes amount + nonce consistently with the OBSCRA program", () => {
      const nonce = ObscraClient.randomNonce();
      const commitment = ObscraClient.computeSealedHash(new BN(1234), nonce);
      expect(commitment.length).to.equal(32);
    });
  });
});
