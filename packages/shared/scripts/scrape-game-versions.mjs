// Regenerates src/gameVersions.ts from https://about.openwf.io/versions.
// Run with `npm run scrape:versions` (see package.json). Also run on a
// schedule by .github/workflows/scrape-game-versions.yml, which opens a PR
// only if this produces an actual diff — nothing here ever pushes straight
// to master, since a redesign of that page could silently mis-parse into
// garbage data that's better caught in review than shipped blind.
//
// The page is plain server-rendered HTML (verified by hand), one <tr> per
// row inside a single `<table class="table table-sm table-hover">`. The
// row's `id` attribute is NOT reliably the version — many "Steam release"
// baseline rows carry a long manifest-bucket integer as their id instead.
// The actual signal is the second `<td>` ("Version" column), whose text is
// one of:
//   "= 42.0.11"   exact version this row's patch/install applies to
//   "≈ 16.0.2"    approximate but named version (best-guess baseline)
//   "< 42.0.0"    unknown baseline ("some version before X") — not a real tag
// Only "=" and "≈" rows are real, usable version tags; "<" rows are
// excluded. (An earlier version of this script used the row's `id`
// attribute shape instead and silently dropped ~60% of real versions —
// don't repeat that mistake.)

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://about.openwf.io/versions";
const OUTPUT_PATH = fileURLToPath(new URL("../src/gameVersions.ts", import.meta.url));

function decodeCell(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, "")
    .trim();
}

async function fetchVersionRows() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`fetch ${SOURCE_URL} failed: ${res.status}`);
  const html = await res.text();

  const tableMatch = html.match(/<table class="table table-sm table-hover">([\s\S]*?)<\/table>/);
  if (!tableMatch) throw new Error("versions table not found — page structure may have changed");

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const seen = new Set();
  const rows = [];
  let match;
  while ((match = rowRe.exec(tableMatch[1]))) {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => decodeCell(c[1]));
    const [, versionCell, title] = cells;
    if (!versionCell) continue;

    const symbol = versionCell.slice(0, 1);
    if (symbol !== "=" && symbol !== "≈") continue; // "<" = unknown baseline, not a real tag

    const version = versionCell.slice(1).trim();
    if (seen.has(version)) continue; // "=" and "≈" rows never collide in practice, but don't trust that blindly
    seen.add(version);
    rows.push({ version, title });
  }

  if (rows.length === 0) throw new Error("parsed zero version rows — page structure may have changed");
  return rows;
}

function groupByTitle(rows) {
  const groups = [];
  for (const { version, title } of rows) {
    const current = groups.at(-1);
    if (current && current.title === title) {
      current.versions.push(version);
    } else {
      groups.push({ title, versions: [version] });
    }
  }
  return groups;
}

function renderFile(versions, groups) {
  return `// Hardcoded game-version compatibility tags, sourced from
// https://about.openwf.io/versions. Regenerate with \`npm run scrape:versions\`
// (packages/shared/scripts/scrape-game-versions.mjs) rather than editing by
// hand — a scheduled GitHub Actions workflow also runs it weekly and opens a
// PR if the site has new versions (see .github/workflows/scrape-game-versions.yml).
// Every distinct version number on that page is included (not just major
// update names) since patch-level compatibility genuinely matters for
// metadata patches / scripts that touch specific client data.
//
// "all" is a sentinel, not a real version: a mod tagged with it is claimed
// compatible with every version, mutually exclusive with picking specific
// ones (see Upload.tsx).

export const ALL_VERSIONS_TAG = "all";

// Every version number, newest first. What gets validated against
// server-side and what a mod's compatibility tags are drawn from.
export const GAME_VERSIONS: string[] = ${JSON.stringify(versions, null, 2)};

// The same versions grouped by their major update name, newest first —
// lets the upload UI offer "select this whole update" as a shortcut
// instead of checking dozens of individual patch numbers by hand.
export interface GameVersionGroup {
  title: string;
  versions: string[];
}

export const GAME_VERSION_GROUPS: GameVersionGroup[] = ${JSON.stringify(groups, null, 2)};
`;
}

const rows = await fetchVersionRows();
const versions = rows.map((r) => r.version);
const groups = groupByTitle(rows);
await writeFile(OUTPUT_PATH, renderFile(versions, groups), "utf8");
console.log(`Wrote ${versions.length} versions across ${groups.length} updates to ${OUTPUT_PATH}`);
