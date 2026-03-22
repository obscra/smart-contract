/**
 * OBSCRA Backfill Indexer
 *
 * Replays historical transactions for the OBSCRA program, parses all
 * Anchor events, and writes the results to indexer/backfill_output.json.
 * Use this when bootstrapping a fresh indexer against an existing deployment.
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ts-node indexer/backfill.ts [--before <sig>] [--limit 1000]
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, ConfirmedSignatureInfo, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

/* ---------- constants ---------- */

const OBSCRA_PROGRAM_ID = new PublicKey(
  "DatMktLe1AucN1oNRust1111111111111111111111111",
);

const SIGNATURES_PER_PAGE = 200;

/* ---------- CLI helpers ---------- */

function readFlag(flag: string, fallback?: string): string | undefined {
  const pos = process.argv.indexOf(flag);
  if (pos !== -1 && pos + 1 < process.argv.length) {
    return process.argv[pos + 1];
  }
  return fallback;
}

/* ---------- main ---------- */

async function main(): Promise<void> {
  const rpcUrl = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const idlPath = path.resolve(__dirname, "../target/idl/data_market.json");

  if (!fs.existsSync(idlPath)) {
    throw new Error(
      `[obscra] IDL not found at ${idlPath}. Run \`anchor build\` first.`,
    );
  }

  const idl: anchor.Idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const connection = new Connection(rpcUrl, "confirmed");
  const coder = new anchor.BorshCoder(idl);
  const parser = new anchor.EventParser(OBSCRA_PROGRAM_ID, coder);

  let cursor: string | undefined = readFlag("--before");
  const maxTransactions = parseInt(readFlag("--limit", "10000")!, 10);

  let processedCount = 0;
  const collectedEvents: { sig: string; name: string; data: unknown }[] = [];

  console.log("[obscra] backfill starting");
  console.log(`  program: ${OBSCRA_PROGRAM_ID.toBase58()}`);
  console.log(`  rpc:     ${rpcUrl}`);
  console.log(`  limit:   ${maxTransactions} transactions\n`);

  outer: while (processedCount < maxTransactions) {
    const pageSize = Math.min(SIGNATURES_PER_PAGE, maxTransactions - processedCount);

    const signatures: ConfirmedSignatureInfo[] =
      await connection.getSignaturesForAddress(
        OBSCRA_PROGRAM_ID,
        { before: cursor, limit: pageSize },
        "confirmed",
      );

    if (signatures.length === 0) break;

    for (const sigInfo of signatures) {
      if (sigInfo.err) {
        processedCount++;
        continue;
      }

      const tx = await connection.getParsedTransaction(sigInfo.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });

      if (!tx?.meta?.logMessages) {
        processedCount++;
        continue;
      }

      for (const evt of parser.parseLogs(tx.meta.logMessages)) {
        collectedEvents.push({
          sig: sigInfo.signature,
          name: evt.name,
          data: evt.data,
        });
        process.stdout.write(
          `\r  ${collectedEvents.length} events from ${processedCount} txs`,
        );
      }

      processedCount++;
      cursor = sigInfo.signature;

      if (processedCount >= maxTransactions) break outer;
    }
  }

  console.log(
    `\n\n[obscra] backfill complete: ${collectedEvents.length} events from ${processedCount} transactions\n`,
  );

  /* Print per-event-type summary */
  const summary: Record<string, number> = {};
  for (const evt of collectedEvents) {
    summary[evt.name] = (summary[evt.name] ?? 0) + 1;
  }
  for (const [name, count] of Object.entries(summary)) {
    console.log(`  ${name.padEnd(28)} ${count}`);
  }

  /* Write output */
  const outputPath = path.resolve(__dirname, "backfill_output.json");
  fs.writeFileSync(outputPath, JSON.stringify(collectedEvents, null, 2));
  console.log(`\n[obscra] wrote ${outputPath}`);
}

main().catch((err) => {
  console.error("[obscra] backfill failed:", err);
  process.exit(1);
});
