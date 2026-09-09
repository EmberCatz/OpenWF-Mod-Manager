#!/usr/bin/env node
// Grants (or revokes) admin on an existing account. This is the ONLY way
// is_admin is ever set — there is no HTTP route for it, on purpose, so
// there's no privilege-escalation surface via the API. Like
// create-modder.mjs, this prints SQL for the operator to review and run
// themselves; it does not touch D1 directly.
//
// Usage:
//   node scripts/grant-admin.mjs --username someone
//   node scripts/grant-admin.mjs --username someone --revoke

const usernameArgIndex = process.argv.indexOf("--username");
const username = usernameArgIndex !== -1 ? process.argv[usernameArgIndex + 1] : null;
if (!username) {
  console.error("Usage: node scripts/grant-admin.mjs --username someone [--revoke]");
  process.exit(1);
}

const revoke = process.argv.includes("--revoke");
const value = revoke ? 0 : 1;
const escaped = username.replace(/'/g, "''");

console.log(`\n${revoke ? "Revoking" : "Granting"} admin for '${username}' — run against whichever D1 target(s) should reflect it:\n`);
console.log(
  `  npx wrangler d1 execute openwf-mod-manager --local  --command "UPDATE modders SET is_admin = ${value} WHERE username = '${escaped}';"`
);
console.log(
  `  npx wrangler d1 execute openwf-mod-manager --remote --command "UPDATE modders SET is_admin = ${value} WHERE username = '${escaped}';"\n`
);
