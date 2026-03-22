/**
 * OBSCRA Deploy Orchestrator
 *
 * Deploys the OBSCRA data protocol program and initializes the
 * on-chain protocol PDA with treasury, arbitrator, and fee config.
 *
 * Usage:
 *   ts-node scripts/deploy.ts --cluster devnet \
 *     --treasury ~/.config/solana/treasury.json \
 *     --arbitrator ~/.config/solana/arbitrator.json \
 *     --fee-bps 250
 *
 * Steps:
 *   1. Load the program keypair from target/deploy.
 *   2. Shell out to `anchor deploy` for the requested cluster.
 *   3. Initialize the protocol PDA via ObscraClient.
 */

import { execSync } from "child_process";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

import { ObscraClient } from "../app/sdk";

/* ---------- types ---------- */

type ObscraCluster = "localnet" | "devnet" | "mainnet-beta";

/* ---------- CLI helpers ---------- */

function readArg(flag: string, fallback?: string): string {
  const pos = process.argv.indexOf(flag);
  if (pos !== -1 && pos + 1 < process.argv.length) {
    return process.argv[pos + 1];
  }
  if (fallback !== undefined) return fallback;
  throw new Error(`[obscra] missing required argument: ${flag}`);
}

function keypairFromFile(filePath: string): Keypair {
  const resolved = path.resolve(filePath.replace(/^~/, process.env.HOME ?? "~"));
  const secretKey = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

/* ---------- main ---------- */

async function main(): Promise<void> {
  const cluster: ObscraCluster = readArg("--cluster", "devnet") as ObscraCluster;
  const treasuryKeyPath = readArg(
    "--treasury",
    process.env.TREASURY_KEYPAIR ?? "~/.config/solana/id.json",
  );
  const arbitratorKeyPath = readArg(
    "--arbitrator",
    process.env.ARBITRATOR_KEYPAIR ?? treasuryKeyPath,
  );
  const feeBps = parseInt(readArg("--fee-bps", "250"), 10);

  console.log(`[obscra] deploying program to ${cluster}`);
  execSync(`anchor deploy --provider.cluster ${cluster}`, { stdio: "inherit" });

  /* Wire up Anchor provider + program */
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync("target/idl/data_market.json", "utf-8"),
  );
  const program = new anchor.Program(idl, provider);
  const client = new ObscraClient(program, provider);

  /* Resolve keys */
  const authority = provider.wallet.payer as Keypair;
  const treasury = keypairFromFile(treasuryKeyPath).publicKey;
  const arbitrator = keypairFromFile(arbitratorKeyPath).publicKey;

  /* Guard: skip if already initialized */
  const [protocolPda] = client.protocolPda();
  const existingAccount = await provider.connection.getAccountInfo(protocolPda);
  if (existingAccount) {
    console.log(
      `[obscra] protocol already live at ${protocolPda.toBase58()} -- skipping init`,
    );
    return;
  }

  /* Initialize */
  const balanceLamports = await provider.connection.getBalance(authority.publicKey);
  console.log(
    `[obscra] authority balance: ${(balanceLamports / LAMPORTS_PER_SOL).toFixed(3)} SOL`,
  );

  const txSig = await client.bootstrapProtocol({
    authority,
    treasury,
    arbitrator,
    feeBps,
  });

  console.log(`[obscra] protocol initialized`);
  console.log(`  tx:         ${txSig}`);
  console.log(`  pda:        ${protocolPda.toBase58()}`);
  console.log(`  treasury:   ${treasury.toBase58()}`);
  console.log(`  arbitrator: ${arbitrator.toBase58()}`);
  console.log(`  fee:        ${feeBps} bps`);
}

main().catch((err) => {
  console.error("[obscra] deploy failed:", err);
  process.exit(1);
});
