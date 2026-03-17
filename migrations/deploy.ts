/**
 * OBSCRA Anchor Migration Entrypoint
 *
 * Minimal stub required by `anchor migrate`. Full deployment and
 * initialization logic lives in scripts/deploy.ts so it can accept
 * per-cluster arguments.
 */

import * as anchor from "@coral-xyz/anchor";

module.exports = async function (provider: anchor.AnchorProvider) {
  anchor.setProvider(provider);
  console.log("[obscra] migration hook -- use `npm run deploy:devnet` or `deploy:mainnet` for full initialization");
};
