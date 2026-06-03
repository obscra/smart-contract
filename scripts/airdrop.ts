/**
 * OBSCRA Airdrop Helper
 *
 * Requests a SOL airdrop on devnet or testnet for the given public key.
 * Handy for quickly funding wallets during local or remote testing.
 *
 * Usage:
 *   ts-node scripts/airdrop.ts <pubkey> [sol_amount] [cluster]
 *
 * Examples:
 *   ts-node scripts/airdrop.ts 5abc...xyz 2 devnet
 *   ts-node scripts/airdrop.ts 5abc...xyz        # defaults: 2 SOL, devnet
 */

import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from "@solana/web3.js";

type AirdropCluster = "devnet" | "testnet";

async function main(): Promise<void> {
  const rawPubkey = process.argv[2];
  if (!rawPubkey) {
    console.error("[obscra] usage: ts-node scripts/airdrop.ts <pubkey> [sol] [cluster]");
    process.exit(1);
  }

  const recipient = new PublicKey(rawPubkey);
  const solAmount = Number(process.argv[3] ?? 2);
  const cluster: AirdropCluster = (process.argv[4] as AirdropCluster) ?? "devnet";

  const connection = new Connection(clusterApiUrl(cluster), "confirmed");

  console.log(`[obscra] requesting ${solAmount} SOL airdrop on ${cluster}`);
  console.log(`  recipient: ${recipient.toBase58()}`);

  const signature = await connection.requestAirdrop(
    recipient,
    solAmount * LAMPORTS_PER_SOL,
  );
  await connection.confirmTransaction(signature, "confirmed");

  console.log(`[obscra] airdrop confirmed -- sig: ${signature}`);
}

main().catch((err) => {
  console.error("[obscra] airdrop failed:", err);
  process.exit(1);
});
