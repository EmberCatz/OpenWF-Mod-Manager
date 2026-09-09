#!/usr/bin/env node
// Issues a new modder API key the old, out-of-band way. Most people should
// just sign up in the app now (Settings tab → Sign up, POST /api/auth/signup,
// see docs/architecture.md § Accounts) — this script is kept around for
// local testing and for the handful of API keys issued before that existed.
//
// Usage:
//   UPLOAD_API_KEY_SALT=<salt> node scripts/create-modder.mjs --name "Your Name"
//
// The salt MUST match whatever UPLOAD_API_KEY_SALT is set to in the target
// environment (apps/api/.dev.vars for local, the `wrangler secret` value
// for deployed) — the API hashes incoming keys with that same salt to look
// them up, so a mismatched salt here produces a hash that will never match.
//
// Prints the plaintext API key (shown once, save it now) and the SQL to
// run against D1. It does not touch D1 itself, so you can review the SQL
// before applying it to --local and/or --remote.

import { randomBytes, createHash, randomUUID } from "node:crypto";

const nameArgIndex = process.argv.indexOf("--name");
const name = nameArgIndex !== -1 ? process.argv[nameArgIndex + 1] : null;
if (!name) {
  console.error('Usage: UPLOAD_API_KEY_SALT=<salt> node scripts/create-modder.mjs --name "Your Name"');
  process.exit(1);
}

const salt = process.env.UPLOAD_API_KEY_SALT;
if (!salt) {
  console.error("UPLOAD_API_KEY_SALT env var is required (must match the target environment's value).");
  process.exit(1);
}

const apiKey = `owmm_${randomBytes(24).toString("base64url")}`;
const apiKeyHash = createHash("sha256").update(apiKey + salt).digest("hex");
const id = randomUUID();

console.log("\nSave this API key now — it is not stored anywhere and cannot be recovered:\n");
console.log(`  ${apiKey}\n`);
console.log("Run this against whichever D1 target(s) should recognize it:\n");
console.log(
  `  npx wrangler d1 execute openwf-mod-manager --local  --command "INSERT INTO modders (id, name, api_key_hash) VALUES ('${id}', '${name.replace(/'/g, "''")}', '${apiKeyHash}');"`
);
console.log(
  `  npx wrangler d1 execute openwf-mod-manager --remote --command "INSERT INTO modders (id, name, api_key_hash) VALUES ('${id}', '${name.replace(/'/g, "''")}', '${apiKeyHash}');"\n`
);
