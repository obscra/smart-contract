/**
 * OBSCRA Sealed-Bid Commit-Reveal Auction -- integration tests.
 *
 * Covers: auction creation, two bidders commit (alice + bob),
 * wrong-nonce reveal rejected, and commitment determinism check.
 */

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { fund, randomHash, expectError } from "./helpers/utils";
import { ObscraClient } from "../app/sdk";

const idl = require("../target/idl/data_market.json");

describe("OBSCRA sealed-bid auction", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl, provider) as unknown as Program;
  const client = new ObscraClient(program, provider);

  /* ---- participants ---- */
  const authority = Keypair.generate();
  const treasury = Keypair.generate();
  const arbitrator = Keypair.generate();
  const seller = Keypair.generate();
  const alice = Keypair.generate(); // higher bidder
  const bob = Keypair.generate();   // lower bidder

  const auctionId = new BN(7_001);

  before(async () => {
    await Promise.all([
      fund(provider.connection, authority.publicKey, 5),
      fund(provider.connection, seller.publicKey, 5),
      fund(provider.connection, alice.publicKey, 10),
      fund(provider.connection, bob.publicKey, 10),
    ]);

    await client.bootstrapProtocol({
      authority,
      treasury: treasury.publicKey,
      arbitrator: arbitrator.publicKey,
      feeBps: 250,
    });
  });

  let englishPda: anchor.web3.PublicKey;
  let vaultPda: anchor.web3.PublicKey;

  /* ---------------------------------------------------------------------- */
  /*  Creation                                                               */
  /* ---------------------------------------------------------------------- */

  it("creates a sealed auction on OBSCRA", async () => {
    const [protocol] = client.protocolPda();
    [englishPda] = client.hiddenPda(seller.publicKey, auctionId);
    [vaultPda] = client.vaultPda(englishPda);

    await program.methods
      .openHiddenBid(
        auctionId,
        new BN(0.5 * LAMPORTS_PER_SOL), // reserve price
        new BN(120), // commit phase -- 2 min (shortened for test)
        new BN(120), // reveal phase -- 2 min
        "Sealed ML Weights",
        "Private model -- sealed bid only",
        "ml-models",
        "ipfs://sealed-weights",
        randomHash(),
      )
      .accounts({
        protocol,
        auction: englishPda,
        escrow: vaultPda,
        seller: seller.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    const row: any = await (program.account as any).sealedAuction.fetch(englishPda);
    expect(row.reservePrice.toNumber()).to.equal(0.5 * LAMPORTS_PER_SOL);
  });

  /* ---- commitment data ---- */
  const aliceNonce = ObscraClient.randomNonce();
  const bobNonce = ObscraClient.randomNonce();
  const aliceAmt = new BN(2 * LAMPORTS_PER_SOL);
  const bobAmt = new BN(1 * LAMPORTS_PER_SOL);

  /* ---------------------------------------------------------------------- */
  /*  Two commits                                                            */
  /* ---------------------------------------------------------------------- */

  it("alice and bob commit sealed bids", async () => {
    const aliceBidPda = client.hiddenBidPda(englishPda, alice.publicKey)[0];
    const bobBidPda = client.hiddenBidPda(englishPda, bob.publicKey)[0];

    const aliceCommit = ObscraClient.computeSealedHash(aliceAmt, aliceNonce);
    const bobCommit = ObscraClient.computeSealedHash(bobAmt, bobNonce);

    await program.methods
      .commitHidden(Array.from(aliceCommit), aliceAmt)
      .accounts({
        auction: englishPda,
        bid: aliceBidPda,
        escrow: vaultPda,
        bidder: alice.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([alice])
      .rpc();

    await program.methods
      .commitHidden(Array.from(bobCommit), bobAmt)
      .accounts({
        auction: englishPda,
        bid: bobBidPda,
        escrow: vaultPda,
        bidder: bob.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([bob])
      .rpc();

    const row: any = await (program.account as any).sealedAuction.fetch(englishPda);
    expect(row.commits).to.equal(2);
  });

  /* ---------------------------------------------------------------------- */
  /*  Wrong-nonce reveal rejected                                            */
  /* ---------------------------------------------------------------------- */

  it("rejects reveal with wrong nonce", async () => {
    const aliceBidPda = client.hiddenBidPda(englishPda, alice.publicKey)[0];
    const badNonce = ObscraClient.randomNonce();

    await expectError(
      () =>
        program.methods
          .revealHidden(aliceAmt, Array.from(badNonce))
          .accounts({
            auction: englishPda,
            bid: aliceBidPda,
            bidder: alice.publicKey,
          })
          .signers([alice])
          .rpc(),
      "CommitmentMismatch",
    );
  });

  /* ---------------------------------------------------------------------- */
  /*  Commitment determinism                                                 */
  /* ---------------------------------------------------------------------- */

  it("sealed-bid commitment hash is deterministic", () => {
    const hash1 = ObscraClient.computeSealedHash(aliceAmt, aliceNonce);
    const hash2 = ObscraClient.computeSealedHash(aliceAmt, aliceNonce);
    expect(Buffer.from(hash1).toString("hex")).to.equal(Buffer.from(hash2).toString("hex"));
  });
});
