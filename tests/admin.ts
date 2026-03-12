/**
 * OBSCRA Admin / Configuration -- integration tests.
 *
 * Covers: protocol initialization, fee cap enforcement (> 1000 bps
 * rejected), authority-driven fee + treasury updates, non-authority
 * rejection, and pause / unpause toggling.
 */

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { fund, expectError } from "./helpers/utils";
import { ObscraClient } from "../app/sdk";

const idl = require("../target/idl/data_market.json");

describe("OBSCRA admin", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl, provider) as unknown as Program;
  const client = new ObscraClient(program, provider);

  /* ---- participants ---- */
  const authority = Keypair.generate();
  const treasury = Keypair.generate();
  const arbitrator = Keypair.generate();
  const newTreasury = Keypair.generate();
  const rando = Keypair.generate();

  before(async () => {
    await Promise.all([
      fund(provider.connection, authority.publicKey, 5),
      fund(provider.connection, rando.publicKey, 2),
    ]);
  });

  /* ---------------------------------------------------------------------- */
  /*  Initialization                                                         */
  /* ---------------------------------------------------------------------- */

  it("initializes the OBSCRA protocol with the correct fee", async () => {
    await client.bootstrapProtocol({
      authority,
      treasury: treasury.publicKey,
      arbitrator: arbitrator.publicKey,
      feeBps: 300,
    });

    const [pda] = client.protocolPda();
    const protocol: any = await (program.account as any).protocol.fetch(pda);

    expect(protocol.feeBps).to.equal(300);
    expect(protocol.paused).to.be.false;
  });

  /* ---------------------------------------------------------------------- */
  /*  Fee cap guard                                                          */
  /* ---------------------------------------------------------------------- */

  it("rejects fee > 1000 bps on config update", async () => {
    const extra = Keypair.generate();
    await fund(provider.connection, extra.publicKey, 2);

    const [pda] = client.protocolPda();
    await expectError(
      () =>
        program.methods
          .reconfigureProtocol(1001, null, null, null)
          .accounts({ protocol: pda, authority: authority.publicKey })
          .signers([authority])
          .rpc(),
      "FeeTooHigh",
    );
  });

  /* ---------------------------------------------------------------------- */
  /*  Authority updates                                                      */
  /* ---------------------------------------------------------------------- */

  it("authority can update fee and treasury", async () => {
    const [pda] = client.protocolPda();

    await program.methods
      .reconfigureProtocol(200, null, newTreasury.publicKey, null)
      .accounts({ protocol: pda, authority: authority.publicKey })
      .signers([authority])
      .rpc();

    const protocol: any = await (program.account as any).protocol.fetch(pda);
    expect(protocol.feeBps).to.equal(200);
    expect(protocol.treasury.toBase58()).to.equal(newTreasury.publicKey.toBase58());
  });

  /* ---------------------------------------------------------------------- */
  /*  Non-authority rejection                                                */
  /* ---------------------------------------------------------------------- */

  it("non-authority update is rejected", async () => {
    const [pda] = client.protocolPda();

    await expectError(
      () =>
        program.methods
          .reconfigureProtocol(100, null, null, null)
          .accounts({ protocol: pda, authority: rando.publicKey })
          .signers([rando])
          .rpc(),
      "Unauthorized",
    );
  });

  /* ---------------------------------------------------------------------- */
  /*  Pause / unpause                                                        */
  /* ---------------------------------------------------------------------- */

  it("authority can pause and unpause the OBSCRA protocol", async () => {
    const [pda] = client.protocolPda();

    // Pause
    await program.methods
      .reconfigureProtocol(null, true, null, null)
      .accounts({ protocol: pda, authority: authority.publicKey })
      .signers([authority])
      .rpc();

    let protocol: any = await (program.account as any).protocol.fetch(pda);
    expect(protocol.paused).to.be.true;

    // Unpause
    await program.methods
      .reconfigureProtocol(null, false, null, null)
      .accounts({ protocol: pda, authority: authority.publicKey })
      .signers([authority])
      .rpc();

    protocol = await (program.account as any).protocol.fetch(pda);
    expect(protocol.paused).to.be.false;
  });
});
