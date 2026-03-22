/**
 * OBSCRA Real-Time Event Indexer
 *
 * Opens a WebSocket subscription to program logs and parses every
 * emitted Anchor event into an in-memory store. Prints a rolling
 * stats summary every 30 seconds.
 *
 * In production, swap MemoryStore for a Postgres/Prisma adapter.
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=wss://api.devnet.solana.com \
 *   ts-node indexer/index.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

/* ---------- constants ---------- */

const OBSCRA_PROGRAM_ID = new PublicKey(
  "DatMktLe1AucN1oNRust1111111111111111111111111",
);

/* ---------- types ---------- */

type ObscraEventName =
  | "OfferPublished"
  | "OfferFulfilled"
  | "OfferRevoked"
  | "EnglishOpened"
  | "EnglishBidSubmitted"
  | "EnglishSettled"
  | "EnglishCancelled"
  | "DutchEnglishOpened"
  | "DecliningFilled"
  | "SealedEnglishOpened"
  | "HiddenBidCommitted"
  | "HiddenBidRevealed"
  | "HiddenBidSettled"
  | "AccessPlanCreated"
  | "AccessGranted"
  | "FeedbackPosted"
  | "ClaimOpened"
  | "ClaimResolved"
  | "TraderOnboarded";

interface IndexedEvent {
  signature: string;
  slot: number;
  name: ObscraEventName;
  data: Record<string, unknown>;
  timestamp: Date;
}

/* ---------- in-memory store ---------- */

class MemoryStore {
  private events: IndexedEvent[] = [];

  append(event: IndexedEvent): void {
    this.events.push(event);

    const padded = event.name.padEnd(26);
    console.log(
      `[obscra +] ${event.timestamp.toISOString()} | ${padded} | slot ${event.slot} | ${event.signature}`,
    );

    if ("price" in event.data) {
      const sol = (Number(event.data.price) / 1e9).toFixed(4);
      console.log(`           price = ${sol} SOL`);
    }
    if ("amount" in event.data) {
      const sol = (Number(event.data.amount) / 1e9).toFixed(4);
      console.log(`           amount = ${sol} SOL`);
    }
  }

  filter(name?: ObscraEventName): IndexedEvent[] {
    if (!name) return [...this.events];
    return this.events.filter((e) => e.name === name);
  }

  totals(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const e of this.events) {
      counts[e.name] = (counts[e.name] ?? 0) + 1;
    }
    return counts;
  }
}

/* ---------- main ---------- */

async function main(): Promise<void> {
  const rpcUrl = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const wsUrl = rpcUrl.replace(/^https/, "wss").replace(/^http/, "ws");
  const idlPath = path.resolve(__dirname, "../target/idl/data_market.json");

  if (!fs.existsSync(idlPath)) {
    throw new Error(
      `[obscra] IDL not found at ${idlPath}. Run \`anchor build\` first.`,
    );
  }

  const idl: anchor.Idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const connection = new Connection(rpcUrl, {
    wsEndpoint: wsUrl,
    commitment: "confirmed",
  });
  const provider = new anchor.AnchorProvider(
    connection,
    {} as anchor.Wallet,
    {},
  );
  const program = new anchor.Program(idl, provider);

  const store = new MemoryStore();

  console.log("[obscra] event indexer starting");
  console.log(`  rpc:     ${rpcUrl}`);
  console.log(`  ws:      ${wsUrl}`);
  console.log(`  program: ${OBSCRA_PROGRAM_ID.toBase58()}`);
  console.log(
    `  events:  ${Object.keys(idl.events ?? {}).length} type(s) in IDL\n`,
  );

  /* Real-time log subscription */
  connection.onLogs(
    OBSCRA_PROGRAM_ID,
    (logInfo, context) => {
      if (logInfo.err) return;

      const parser = new anchor.EventParser(
        OBSCRA_PROGRAM_ID,
        new anchor.BorshCoder(idl),
      );

      for (const parsed of parser.parseLogs(logInfo.logs)) {
        store.append({
          signature: logInfo.signature,
          slot: context.slot,
          name: parsed.name as ObscraEventName,
          data: parsed.data as Record<string, unknown>,
          timestamp: new Date(),
        });
      }
    },
    "confirmed",
  );

  /* Periodic stats dump */
  setInterval(() => {
    const totals = store.totals();
    if (Object.keys(totals).length === 0) return;

    console.log("\n-- obscra event totals --");
    for (const [name, count] of Object.entries(totals)) {
      console.log(`  ${name.padEnd(28)} ${count}`);
    }
    console.log();
  }, 30_000);

  /* Keep the process alive indefinitely */
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("[obscra] indexer crashed:", err);
  process.exit(1);
});
