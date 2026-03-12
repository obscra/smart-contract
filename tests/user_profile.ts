/**
 * OBSCRA User Profile -- integration tests.
 *
 * Covers: profile registration, username update, wrong-wallet rejection,
 * and username-too-long rejection.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { fund, expectError } from "./helpers/utils";
import { ObscraClient } from "../app/sdk";

const idl = require("../target/idl/data_market.json");

describe("OBSCRA user profile", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl, provider) as unknown as Program;
  const client = new ObscraClient(program, provider);

  /* ---- participants ---- */
  const alice = Keypair.generate();
  const bob = Keypair.generate();

  before(async () => {
    await Promise.all([
      fund(provider.connection, alice.publicKey, 2),
      fund(provider.connection, bob.publicKey, 2),
    ]);
  });

  /* ---------------------------------------------------------------------- */
  /*  Registration                                                           */
  /* ---------------------------------------------------------------------- */

  it("registers a user profile on OBSCRA", async () => {
    const [profile] = client.traderPda(alice.publicKey);

    await program.methods
      .registerTrader("alice_crypto", "ipfs://avatar/alice.png")
      .accounts({
        profile,
        wallet: alice.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([alice])
      .rpc();

    const row: any = await (program.account as any).traderProfile.fetch(profile);
    expect(row.username).to.equal("alice_crypto");
    expect(row.sellerRatingCount.toNumber()).to.equal(0);
  });

  /* ---------------------------------------------------------------------- */
  /*  Username update                                                        */
  /* ---------------------------------------------------------------------- */

  it("updates username", async () => {
    const [profile] = client.traderPda(alice.publicKey);

    await program.methods
      .updateTrader("alice_sol", null)
      .accounts({ profile, wallet: alice.publicKey })
      .signers([alice])
      .rpc();

    const row: any = await (program.account as any).traderProfile.fetch(profile);
    expect(row.username).to.equal("alice_sol");
  });

  /* ---------------------------------------------------------------------- */
  /*  Wrong-wallet rejection                                                 */
  /* ---------------------------------------------------------------------- */

  it("rejects update from wrong wallet", async () => {
    const [profile] = client.traderPda(alice.publicKey);

    await expectError(
      () =>
        program.methods
          .updateTrader("hacked", null)
          .accounts({ profile, wallet: bob.publicKey })
          .signers([bob])
          .rpc(),
      "Unauthorized",
    );
  });

  /* ---------------------------------------------------------------------- */
  /*  Username too long                                                      */
  /* ---------------------------------------------------------------------- */

  it("username too long is rejected", async () => {
    const [profile] = client.traderPda(bob.publicKey);

    await program.methods
      .registerTrader("bob", "ipfs://b.png")
      .accounts({
        profile,
        wallet: bob.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([bob])
      .rpc();

    await expectError(
      () =>
        program.methods
          .updateTrader("a".repeat(100), null) // exceeds MAX_USERNAME_LEN
          .accounts({ profile, wallet: bob.publicKey })
          .signers([bob])
          .rpc(),
      "UsernameTooLong",
    );
  });
});
