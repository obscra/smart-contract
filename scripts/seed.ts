/**
 * OBSCRA Seed Script
 *
 * Populates a fresh deployment with 10 sample data listings spread
 * across the five core protocol categories, giving the frontend
 * realistic content to render during development.
 *
 * Usage:
 *   ts-node scripts/seed.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as fs from "fs";

import { ObscraClient } from "../app/sdk";

/* ---------- constants ---------- */

const OBSCRA_CATEGORIES = [
  "market-data",
  "ml-models",
  "signals",
  "research",
  "api-access",
] as const;

const SAMPLE_COUNT = 10;

/* ---------- main ---------- */

async function main(): Promise<void> {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync("target/idl/data_market.json", "utf-8"),
  );
  const program = new anchor.Program(idl, provider);
  const client = new ObscraClient(program, provider);

  const seller = provider.wallet.payer as Keypair;

  console.log("[obscra] seeding protocol with sample listings\n");

  for (let idx = 0; idx < SAMPLE_COUNT; idx++) {
    const offerId = new BN(Date.now() + idx);
    const priceSol = 0.1 + Math.random() * 2;
    const priceLamports = new BN(Math.floor(priceSol * LAMPORTS_PER_SOL));
    const category = OBSCRA_CATEGORIES[idx % OBSCRA_CATEGORIES.length];

    const txSig = await client.publishOffer({
      seller,
      offerId,
      price: priceLamports,
      title: `OBSCRA sample dataset #${idx + 1}`,
      description: `Auto-generated ${category} listing for development`,
      category,
      tags: [category, "seed"],
      dataUri: `ipfs://obscra-seed-${idx}`,
      previewUri: `ipfs://obscra-seed-preview-${idx}`,
      encryptedKeyHash: new Uint8Array(32).fill(idx + 1),
      royaltyBps: 100,
      privateSale: false,
      whitelistedBuyer: null,
    });

    console.log(
      `  [${idx + 1}/${SAMPLE_COUNT}] ${category.padEnd(14)} ${priceSol.toFixed(2)} SOL  tx=${txSig.slice(0, 16)}...`,
    );
  }

  console.log("\n[obscra] seeding complete");
}

main().catch((err) => {
  console.error("[obscra] seed failed:", err);
  process.exit(1);
});
