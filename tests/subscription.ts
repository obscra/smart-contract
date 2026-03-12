/**
 * OBSCRA Subscription Plan -- integration tests.
 *
 * Covers: plan creation, subscriber purchases 30 days, renewal stacks
 * an additional 7 days, and seller pauses the plan.
 */

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { fund, randomHash, sleep } from "./helpers/utils";
import { ObscraClient } from "../app/sdk";

const idl = require("../target/idl/data_market.json");

describe("OBSCRA subscription plan", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl, provider) as unknown as Program;
  const client = new ObscraClient(program, provider);

  /* ---- participants ---- */
  const authority = Keypair.generate();
  const treasury = Keypair.generate();
  const arbitrator = Keypair.generate();
  const seller = Keypair.generate();
  const subscriber = Keypair.generate();

  const planId = new BN(99_001);

  before(async () => {
    await Promise.all([
      fund(provider.connection, authority.publicKey, 5),
      fund(provider.connection, seller.publicKey, 5),
      fund(provider.connection, subscriber.publicKey, 10),
    ]);

    await client.bootstrapProtocol({
      authority,
      treasury: treasury.publicKey,
      arbitrator: arbitrator.publicKey,
      feeBps: 250,
    });
  });

  /* ---------------------------------------------------------------------- */
  /*  Plan creation                                                          */
  /* ---------------------------------------------------------------------- */

  it("creates an OBSCRA subscription plan", async () => {
    const [protocol] = client.protocolPda();
    const [plan] = client.accessPlanPda(seller.publicKey, planId);

    await program.methods
      .createAccessPlan(
        planId,
        new BN(0.05 * LAMPORTS_PER_SOL), // price per day
        1,   // min days
        365, // max days
        "Daily Crypto Signals",
        "Real-time on-chain alpha, delivered daily.",
        "ipfs://signals-access-bundle",
        randomHash(),
      )
      .accounts({
        protocol,
        plan,
        seller: seller.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    const row: any = await (program.account as any).subscriptionPlan.fetch(plan);
    expect(row.active).to.be.true;
    expect(row.minDays).to.equal(1);
    expect(row.maxDays).to.equal(365);
  });

  /* ---------------------------------------------------------------------- */
  /*  Purchase 30 days                                                       */
  /* ---------------------------------------------------------------------- */

  it("subscriber can purchase 30 days", async () => {
    const [protocol] = client.protocolPda();
    const [plan] = client.accessPlanPda(seller.publicKey, planId);
    const [sub] = client.accessPda(plan, subscriber.publicKey);

    await program.methods
      .purchaseAccess(30)
      .accounts({
        protocol,
        plan,
        subscription: sub,
        subscriber: subscriber.publicKey,
        seller: seller.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([subscriber])
      .rpc();

    const row: any = await (program.account as any).subscription.fetch(sub);
    const nowSec = Date.now() / 1000;
    expect(row.expiresAt.toNumber()).to.be.greaterThan(nowSec + 29 * 86400);
  });

  /* ---------------------------------------------------------------------- */
  /*  Renewal stacks expiry                                                  */
  /* ---------------------------------------------------------------------- */

  it("renewing stacks 7 more days on top of existing expiry", async () => {
    const [protocol] = client.protocolPda();
    const [plan] = client.accessPlanPda(seller.publicKey, planId);
    const [sub] = client.accessPda(plan, subscriber.publicKey);

    const before: any = await (program.account as any).subscription.fetch(sub);
    const expiryBefore = before.expiresAt.toNumber();

    await program.methods
      .purchaseAccess(7) // renew for 7 more days
      .accounts({
        protocol,
        plan,
        subscription: sub,
        subscriber: subscriber.publicKey,
        seller: seller.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([subscriber])
      .rpc();

    const after: any = await (program.account as any).subscription.fetch(sub);
    expect(after.expiresAt.toNumber()).to.be.greaterThan(expiryBefore + 6 * 86400);
  });

  /* ---------------------------------------------------------------------- */
  /*  Seller pauses plan                                                     */
  /* ---------------------------------------------------------------------- */

  it("seller can pause the plan", async () => {
    const [plan] = client.accessPlanPda(seller.publicKey, planId);

    await program.methods
      .toggleAccessPlan(false)
      .accounts({ plan, seller: seller.publicKey })
      .signers([seller])
      .rpc();

    const row: any = await (program.account as any).subscriptionPlan.fetch(plan);
    expect(row.active).to.be.false;
  });
});
