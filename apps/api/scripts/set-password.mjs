#!/usr/bin/env node
// Adds a username/password login to an EXISTING account (e.g. one created
// the old way via create-modder.mjs) without creating a new modder row or
// touching its existing mods/ownership — useful for turning your original
// API-key account into a normal self-service login instead of signing up
// fresh and manually reassigning mod ownership.
//
// Usage:
//   node scripts/set-password.mjs --name "EmberCatz" --username myusername --password "a real password"
//
// Matches the exact hash format routes/auth.ts / passwords.ts expect
// (pbkdf2$<iterations>$<saltB64>$<hashB64>, PBKDF2-SHA256, 100k
// iterations, 256-bit key, 16-byte salt) — Node's crypto.pbkdf2Sync
// produces bit-identical output to the Workers runtime's Web Crypto PBKDF2
// for the same inputs, so it's safe to compute here.
//
// Prints SQL for the operator to review and run themselves; does not
// touch D1. The UPDATE only matches a row that doesn't already have a
// username, so it can't accidentally clobber a real existing login.

import { randomBytes, pbkdf2Sync } from "node:crypto";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : null;
}

const name = arg("name");
const username = arg("username");
const password = arg("password");

if (!name || !username || !password) {
  console.error('Usage: node scripts/set-password.mjs --name "Existing Account Name" --username newusername --password "a real password"');
  process.exit(1);
}

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,24}$/;
if (!USERNAME_RE.test(username)) {
  console.error("username must be 3-24 characters: letters, numbers, _ or -");
  process.exit(1);
}
if (password.length < 8) {
  console.error("password must be at least 8 characters");
  process.exit(1);
}

const ITERATIONS = 100_000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
const passwordHash = `pbkdf2$${ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;

const escapedName = name.replace(/'/g, "''");
const escapedUsername = username.replace(/'/g, "''");
const sql = `UPDATE modders SET username = '${escapedUsername}', password_hash = '${passwordHash}' WHERE name = '${escapedName}' AND username IS NULL;`;

console.log(`\nSets username '${username}' + a password on the account named '${name}' (only if it has no username yet) — run against whichever D1 target(s) should reflect it:\n`);
console.log(`  npx wrangler d1 execute openwf-mod-manager --local  --command "${sql}"`);
console.log(`  npx wrangler d1 execute openwf-mod-manager --remote --command "${sql}"\n`);
