// Regenerate src/lib/data.ts FACTIONS from mfm-snapshot.json so the app's
// detachment/disposition table always matches the live MFM — no manual sync.
// Run by the MFM watch workflow right after mfm-check.mjs. Only MFM factions that
// actually drift from the snapshot are regenerated (title-cased names, mapped
// dispositions, incl. the optional second disposition `d2`); every other faction
// — the non-MFM ones (Black Templars, Imperial Agents, …) and the ones already in
// sync — is kept verbatim, so hand-authored names aren't churned. Idempotent:
// when nothing drifts, data.ts is left byte-for-byte unchanged.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_TS = path.join(ROOT, "src/lib/data.ts");
const SNAPSHOT = path.join(ROOT, "mfm-snapshot.json");

const SLUG2NAME = {
  "adepta-sororitas": "Adepta Sororitas", "adeptus-custodes": "Adeptus Custodes",
  "adeptus-mechanicus": "Adeptus Mechanicus", "aeldari": "Aeldari", "astra-militarum": "Astra Militarum",
  "black-templars": "Black Templars",
  "blood-angels": "Blood Angels", "chaos-daemons": "Chaos Daemons", "chaos-knights": "Chaos Knights",
  "chaos-space-marines": "Chaos Space Marines", "dark-angels": "Dark Angels", "death-guard": "Death Guard",
  "deathwatch": "Deathwatch", "drukhari": "Drukhari", "emperors-children": "Emperor's Children",
  "genestealer-cults": "Genestealer Cults", "grey-knights": "Grey Knights",
  "imperial-agents": "Imperial Agents", "imperial-knights": "Imperial Knights",
  "leagues-of-votann": "Leagues of Votann", "necrons": "Necrons", "orks": "Orks",
  "space-marines": "Space Marines", "space-wolves": "Space Wolves", "tau-empire": "T'au Empire",
  "thousand-sons": "Thousand Sons", "tyranids": "Tyranids", "world-eaters": "World Eaters",
};
const NAME2SLUG = Object.fromEntries(Object.entries(SLUG2NAME).map(([s, n]) => [n, s]));
const DISP = {
  "TAKE AND HOLD": "Take and Hold", "PURGE THE FOE": "Purge the Foe",
  "RECONNAISSANCE": "Reconnaissance", "DISRUPTION": "Disruption", "PRIORITY ASSETS": "Priority Assets",
};
const SMALL = new Set(["of", "the", "and", "in", "on", "to", "a", "an", "for", "with", "per"]);

const tc = (upper) => {
  const s = upper.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[‐-―−]/g, "-").replace(/[‘’′`]/g, "'").trim();
  let wi = 0;
  return s.split(/(\s+|-)/).map((t) => {
    if (/^\s+$/.test(t) || t === "-") return t;
    const first = wi === 0; wi++;
    const low = t.toLowerCase();
    if (!first && SMALL.has(low)) return low;
    return low.replace(/^[a-z]/, (c) => c.toUpperCase());
  }).join("");
};
const norm = (s) => (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[‐-―−]/g, "-").replace(/[‘’′`']/g, "'").replace(/\s+/g, " ").trim().toUpperCase();
const esc = (s) => s.replace(/"/g, '\\"');

// Compile the current data.ts in isolation and read its FACTIONS map.
function readCurrentFactions() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mfm-sync-"));
  try {
    execFileSync("npx", ["tsc", DATA_TS, "--outDir", tmp, "--module", "commonjs", "--target", "es2022", "--skipLibCheck", "--moduleResolution", "node"], { cwd: ROOT, stdio: "pipe", shell: process.platform === "win32" });
    const require = createRequire(import.meta.url);
    const mod = require(path.join(tmp, "data.js"));
    return mod.FACTIONS;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function driftsFromSite(name, FACTIONS, snap) {
  const slug = NAME2SLUG[name];
  if (!slug || !snap[slug]) return false;
  const data = new Map((FACTIONS[name] || []).map((e) => [norm(e.n), { dp: e.dp, d: norm(e.d), d2: norm(e.d2) }]));
  const live = new Map(Object.entries(snap[slug]).map(([n, v]) => [norm(n), { dp: v.dp, d: norm(v.disposition), d2: norm(v.disposition2) }]));
  if (data.size !== live.size) return true;
  for (const [k, v] of live) {
    const d = data.get(k);
    if (!d || d.dp !== v.dp || d.d !== v.d || d.d2 !== v.d2) return true;
  }
  return false;
}

function serializeEntry(e) {
  const d2 = e.d2 ? `, d2: "${e.d2}"` : "";
  const nw = e.new ? ", new: true" : "";
  return `    { n: "${esc(e.n)}", d: "${e.d}"${d2}, dp: ${e.dp}${nw} },`;
}

function buildFactionsBlock(FACTIONS, snap) {
  let out = "export const FACTIONS: Record<string, Detachment[]> = {\n";
  const regenerated = [];
  for (const name of Object.keys(FACTIONS)) {
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `"${esc(name)}"`;
    let entries;
    if (NAME2SLUG[name] && snap[NAME2SLUG[name]] && driftsFromSite(name, FACTIONS, snap)) {
      regenerated.push(name);
      entries = Object.entries(snap[NAME2SLUG[name]]).map(([n, v]) => ({
        n: tc(n), d: DISP[v.disposition] || v.disposition,
        d2: v.disposition2 ? DISP[v.disposition2] || v.disposition2 : undefined, dp: v.dp,
      }));
    } else {
      entries = (FACTIONS[name] || []).map((e) => ({ n: e.n, d: e.d, d2: e.d2 || undefined, dp: e.dp, new: e.new }));
    }
    out += `  ${key}: [\n${entries.map(serializeEntry).join("\n")}\n  ],\n`;
  }
  out += "};\n";
  return { out, regenerated };
}

function spliceFactions(dataText, newBlock) {
  const lines = dataText.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith("export const FACTIONS: Record<string, Detachment[]> = {"));
  if (start < 0) throw new Error("FACTIONS declaration not found in data.ts");
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === "};") { end = i; break; }
  }
  if (end < 0) throw new Error("FACTIONS closing '};' not found");
  return [...lines.slice(0, start), ...newBlock.replace(/\n$/, "").split("\n"), ...lines.slice(end + 1)].join("\n");
}

// --- run ---
const snap = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
const FACTIONS = readCurrentFactions();
const { out, regenerated } = buildFactionsBlock(FACTIONS, snap);
const before = fs.readFileSync(DATA_TS, "utf8");
const after = spliceFactions(before, out);

if (after === before) {
  console.log("data.ts already in sync with the MFM snapshot — no change.");
  process.exit(0);
}

fs.writeFileSync(DATA_TS, after);
console.log(`Re-synced data.ts FACTIONS from the snapshot. Regenerated: ${regenerated.join(", ") || "(none)"}.`);

// Verify the result compiles before anyone commits it.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mfm-verify-"));
try {
  execFileSync("npx", ["tsc", DATA_TS, "--outDir", tmp, "--noEmit", "--skipLibCheck", "--moduleResolution", "node", "--target", "es2022", "--module", "commonjs"], { cwd: ROOT, stdio: "pipe", shell: process.platform === "win32" });
  console.log("data.ts type-checks.");
} catch (e) {
  fs.writeFileSync(DATA_TS, before); // revert so a broken generate never commits
  console.error("Regenerated data.ts FAILED to type-check — reverted. " + (e.stdout?.toString() || e.message));
  process.exit(1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
