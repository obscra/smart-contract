/**
 * OBSCRA Dutch Auction -- integration tests.
 *
 * Covers: auction creation, slippage guard (max_price < current rejected),
 * successful fill at current price, and double-fill rejection.
 */

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { fund, randomHash, expectError } from "./helpers/utils";
import { ObscraClient } from "../app/sdk";

const idl = require("../target/idl/data_market.json");

describe("OBSCRA Dutch auction", () => {
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

  const auctionId = new BN(3_001);

  before(async () => {
    await Promise.all([
      fund(provider.connection, authority.publicKey, 5),
      fund(provider.connection, seller.publicKey, 5),
      fund(provider.connection, buyer.publicKey, 10),
    ]);

    await client.bootstrapProtocol({
      authority,
      treasury: treasury.publicKey,
      arbitrator: arbitrator.publicKey,
      feeBps: 250,
    });
  });

  /* ---------------------------------------------------------------------- */
  /*  Creation                                                               */
  /* ---------------------------------------------------------------------- */

  it("creates a Dutch auction on OBSCRA", async () => {
    const [protocol] = client.protocolPda();
    const [auction] = client.decliningPda(seller.publicKey, auctionId);

    await program.methods
      .openDeclining(
        auctionId,
        new BN(5 * LAMPORTS_PER_SOL),   // start price
        new BN(0.5 * LAMPORTS_PER_SOL), // floor price
        new BN(600),  // 10-minute window
        new BN(10),   // 10-second tick
        "Proprietary Order Flow Data",
        "1M labelled MEV txs with wallet attribution",
        "market-data",
        "ipfs://order-flow-bundle",
        randomHash(),
        100, // 1 % royalty
      )
      .accounts({
        protocol,
        auction,
        seller: seller.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    const row: any = await (program.account as any).dutchAuction.fetch(auction);
    expect(row.startPrice.toNumber()).to.equal(5 * LAMPORTS_PER_SOL);
    expect(row.floorPrice.toNumber()).to.equal(0.5 * LAMPORTS_PER_SOL);
    expect(row.status).to.deep.equal({ active: {} });
  });

  /* ---------------------------------------------------------------------- */
  /*  Slippage guard                                                         */
  /* ---------------------------------------------------------------------- */

  it("rejects fill when max_price < current price", async () => {
    const [protocol] = client.protocolPda();
    const [auction] = client.decliningPda(seller.publicKey, auctionId);

    // Auction just started so price is near 5 SOL; 0.1 SOL cap must fail.
    await expectError(
      () =>
        program.methods
          .fillDeclining(new BN(0.1 * LAMPORTS_PER_SOL))
          .accounts({
            protocol,
            auction,
            buyer: buyer.publicKey,
            seller: seller.publicKey,
            treasury: treasury.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([buyer])
          .rpc(),
      "BidTooLow",
    );
  });

  /* ---------------------------------------------------------------------- */
  /*  Successful fill                                                        */
  /* ---------------------------------------------------------------------- */

  it("fills at current price when max_price is sufficient", async () => {
    const [protocol] = client.protocolPda();
    const [auction] = client.decliningPda(seller.publicKey, auctionId);
    const sellerBalBefore = await provider.connection.getBalance(seller.publicKey);

    await program.methods
      .fillDeclining(new BN(5 * LAMPORTS_PER_SOL)) // generous cap
      .accounts({
        protocol,
        auction,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    const row: any = await (program.account as any).dutchAuction.fetch(auction);
    const sellerBalAfter = await provider.connection.getBalance(seller.publicKey);

    expect(row.status).to.deep.equal({ filled: {} });
    expect(row.buyer.toBase58()).to.equal(buyer.publicKey.toBase58());
    expect(sellerBalAfter).to.be.greaterThan(sellerBalBefore);
  });

  /* ---------------------------------------------------------------------- */
  /*  Double-fill rejection                                                  */
  /* ---------------------------------------------------------------------- */

  it("cannot fill an already-filled auction", async () => {
    const [protocol] = client.protocolPda();
    const [auction] = client.decliningPda(seller.publicKey, auctionId);

    await expectError(
      () =>
        program.methods
          .fillDeclining(new BN(5 * LAMPORTS_PER_SOL))
          .accounts({
            protocol,
            auction,
            buyer: buyer.publicKey,
            seller: seller.publicKey,
            treasury: treasury.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([buyer])
          .rpc(),
      "InvalidStatus",
    );
  });
});
