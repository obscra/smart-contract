/**
 * OBSCRA Reputation + Dispute -- integration tests.
 *
 * Flow: register profiles -> list -> buy -> review (rating increments) ->
 * open dispute -> non-arbitrator rejected -> arbitrator resolves.
 */

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { fund, randomHash, expectError } from "./helpers/utils";
import { ObscraClient } from "../app/sdk";

const idl = require("../target/idl/data_market.json");

describe("OBSCRA reputation & dispute", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl, provider) as unknown as Program;
  const client = new ObscraClient(program, provider);

  /* ---- participants ---- */
  const authority = Keypair.generate();
  const treasury = Keypair.generate();
  const arbitrator = Keypair.generate();
  const seller = Keypair.generate();
  const buyer = Keypair.generate();
  const intruder = Keypair.generate(); // tries to fake arbitration

  const offerId = new BN(55_001);

  before(async () => {
    await Promise.all([
      fund(provider.connection, authority.publicKey, 5),
      fund(provider.connection, seller.publicKey, 5),
      fund(provider.connection, buyer.publicKey, 10),
      fund(provider.connection, intruder.publicKey, 2),
    ]);

    await client.bootstrapProtocol({
      authority,
      treasury: treasury.publicKey,
      arbitrator: arbitrator.publicKey,
      feeBps: 250,
    });

    // Register user profiles for seller and buyer
    for (const [kp, username] of [
      [seller, "alice_seller"],
      [buyer, "bob_buyer"],
    ] as [Keypair, string][]) {
      const [profile] = client.traderPda(kp.publicKey);
      await program.methods
        .registerTrader(username, "ipfs://avatar")
        .accounts({
          profile,
          wallet: kp.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([kp])
        .rpc();
    }

    // List data
    await client.publishOffer({
      seller,
      offerId,
      price: new BN(1 * LAMPORTS_PER_SOL),
      title: "Test Dataset",
      description: "For dispute test",
      category: "research",
      tags: [],
      dataUri: "ipfs://test",
      previewUri: "ipfs://prev",
      encryptedKeyHash: new Uint8Array(randomHash()),
      royaltyBps: 0,
      privateSale: false,
      whitelistedBuyer: null,
    });

    // Buy data
    const [protocol] = client.protocolPda();
    const [listing] = client.offerPda(seller.publicKey, offerId);
    const [sellerProf] = client.traderPda(seller.publicKey);
    const [buyerProf] = client.traderPda(buyer.publicKey);

    await program.methods
      .fillOffer()
      .accounts({
        protocol,
        listing,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        treasury: treasury.publicKey,
        sellerProfile: sellerProf,
        buyerProfile: buyerProf,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  });

  /* ---------------------------------------------------------------------- */
  /*  Review + rating                                                        */
  /* ---------------------------------------------------------------------- */

  it("buyer can leave a review and seller rating increments", async () => {
    const [listing] = client.offerPda(seller.publicKey, offerId);
    const [review] = client.feedbackPda(listing, buyer.publicKey);
    const [sellerProf] = client.traderPda(seller.publicKey);

    await program.methods
      .postFeedback(5, "Excellent data, fast key delivery!")
      .accounts({
        listing,
        review,
        sellerProfile: sellerProf,
        reviewer: buyer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    const prof: any = await (program.account as any).traderProfile.fetch(sellerProf);
    expect(prof.sellerRatingCount.toNumber()).to.equal(1);
    expect(prof.sellerRatingSum.toNumber()).to.equal(5);
  });

  /* ---------------------------------------------------------------------- */
  /*  Open dispute                                                           */
  /* ---------------------------------------------------------------------- */

  it("buyer can open a dispute within 7 days", async () => {
    const [protocol] = client.protocolPda();
    const [listing] = client.offerPda(seller.publicKey, offerId);
    const [dispute] = client.claimPda(listing);
    const [buyerProf] = client.traderPda(buyer.publicKey);

    await program.methods
      .openClaim("Seller never released decryption key after payment.")
      .accounts({
        protocol,
        listing,
        dispute,
        buyerProfile: buyerProf,
        opener: buyer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    const row: any = await (program.account as any).dispute.fetch(dispute);
    expect(row.status).to.deep.equal({ open: {} });
  });

  /* ---------------------------------------------------------------------- */
  /*  Non-arbitrator rejection                                               */
  /* ---------------------------------------------------------------------- */

  it("non-arbitrator cannot resolve dispute", async () => {
    const [protocol] = client.protocolPda();
    const [listing] = client.offerPda(seller.publicKey, offerId);
    const [dispute] = client.claimPda(listing);

    await expectError(
      () =>
        program.methods
          .resolveClaim(true, new BN(1 * LAMPORTS_PER_SOL))
          .accounts({
            protocol,
            dispute,
            buyerProfile: null,
            arbitrator: intruder.publicKey,
          })
          .signers([intruder])
          .rpc(),
      "NotArbitrator",
    );
  });

  /* ---------------------------------------------------------------------- */
  /*  Arbitrator resolves                                                    */
  /* ---------------------------------------------------------------------- */

  it("arbitrator resolves dispute in buyer's favour", async () => {
    const [protocol] = client.protocolPda();
    const [listing] = client.offerPda(seller.publicKey, offerId);
    const [dispute] = client.claimPda(listing);

    // Fund arbitrator so it can cover tx fees
    await fund(provider.connection, arbitrator.publicKey, 1);

    await program.methods
      .resolveClaim(true, new BN(0.9 * LAMPORTS_PER_SOL))
      .accounts({
        protocol,
        dispute,
        buyerProfile: null,
        arbitrator: arbitrator.publicKey,
      })
      .signers([arbitrator])
      .rpc();

    const row: any = await (program.account as any).dispute.fetch(dispute);
    expect(row.status).to.deep.equal({ resolved: {} });
    expect(row.buyerFavored).to.be.true;
  });
});
