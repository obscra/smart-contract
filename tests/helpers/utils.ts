// OBSCRA test utilities — common helpers for the integration test suite.

import * as anchor from "@coral-xyz/anchor";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

export async function fund(
  connection: Connection,
  pubkey: PublicKey,
  sol: number,
): Promise<void> {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getBalance(
  connection: Connection,
  pubkey: PublicKey,
): Promise<number> {
  return connection.getBalance(pubkey, "confirmed");
}

export async function expectError(
  fn: () => Promise<unknown>,
  substr: string,
): Promise<void> {
  let didThrow = false;
  try {
    await fn();
  } catch (err: unknown) {
    didThrow = true;
    const message = (err as Error).message ?? String(err);
    if (!message.includes(substr)) {
      throw new Error(
        `Expected error containing "${substr}" but got:\n${message}`,
      );
    }
  }
  if (!didThrow) {
    throw new Error(
      `Expected an error containing "${substr}" but none was thrown`,
    );
  }
}

export function randomHash(): number[] {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 255));
}

export function lamportsToSol(lamports: number | anchor.BN): string {
  const value =
    typeof lamports === "number" ? lamports : lamports.toNumber();
  return (value / LAMPORTS_PER_SOL).toFixed(4);
}
