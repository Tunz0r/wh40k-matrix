// MFM watcher — checks mfm.warhammer-community.com for changes to detachment
// Detachment Points (DP) and Force Dispositions, which GW updates periodically.
// Run by .github/workflows/mfm-watch.yml on a schedule. Fetches each faction
// page (a browser User-Agent is required — plain bots get a 403), extracts every
// detachment's {name, dp, disposition}, and diffs against the committed
// mfm-snapshot.json. Writes the new snapshot and, on any change, mfm-changes.md.
//
// The site is a Next.js RSC app but each detachment header is plain HTML:
//   <span class="text-xl break-all">NAME</span>
//   <span class="text-sm self-end pl-2">NDP</span> … <div …background-color:#hex>DISPOSITION</div>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = path.join(ROOT, "mfm-snapshot.json");
const CHANGES = path.join(ROOT, "mfm-changes.md");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const FACTIONS = [
  "adepta-sororitas", "adeptus-custodes", "adeptus-mechanicus", "aeldari", "astra-militarum",
  "blood-angels", "chaos-daemons", "chaos-knights", "chaos-space-marines", "dark-angels",
  "death-guard", "deathwatch", "drukhari", "emperors-children", "genestealer-cults",
  "grey-knights", "imperial-knights", "leagues-of-votann", "necrons", "orks",
  "space-marines", "space-wolves", "tau-empire", "thousand-sons", "tyranids", "world-eaters",
];

const decode = (s) =>
  s
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();

function extractDetachments(html) {
  const re =
    /<span class="text-xl break-all">([^<]+)<\/span><span class="text-sm self-end pl-2">(\d)DP<\/span>([\s\S]{0,500}?)<div class="[^"]*font-bold"[^>]*background-color:#[0-9A-Fa-f]{6}[^>]*>([^<]+)<\/div>/g;
  const out = {};
  let m;
  while ((m = re.exec(html))) {
    out[decode(m[1])] = { dp: Number(m[2]), disposition: decode(m[4]) };
  }
  return out;
}

async function fetchFaction(slug) {
  const r = await fetch(`https://mfm.warhammer-community.com/en/${slug}`, {
    headers: { "User-Agent": UA, Accept: "text/html" },
  });
  if (!r.ok) throw new Error(`${slug}: HTTP ${r.status}`);
  const dets = extractDetachments(await r.text());
  if (Object.keys(dets).length === 0) throw new Error(`${slug}: no detachments parsed (site layout may have changed)`);
  return dets;
}

async function build() {
  const snapshot = {};
  for (const slug of FACTIONS) {
    // Serial + small delay to be polite to the site.
    snapshot[slug] = await fetchFaction(slug);
    await new Promise((r) => setTimeout(r, 300));
  }
  return snapshot;
}

function diff(oldSnap, newSnap) {
  const lines = [];
  for (const slug of Object.keys(newSnap)) {
    const before = oldSnap[slug] || {};
    const after = newSnap[slug];
    const changes = [];
    for (const name of Object.keys(after)) {
      const a = after[name];
      const b = before[name];
      if (!b) changes.push(`- **${name}** added (${a.dp}DP · ${a.disposition})`);
      else if (b.dp !== a.dp || b.disposition !== a.disposition)
        changes.push(`- **${name}**: ${b.dp}DP·${b.disposition} → ${a.dp}DP·${a.disposition}`);
    }
    for (const name of Object.keys(before)) {
      if (!after[name]) changes.push(`- **${name}** removed`);
    }
    if (changes.length) lines.push(`### ${slug}\n${changes.join("\n")}`);
  }
  return lines.join("\n\n");
}

// MFM faction slug -> the faction NAME as stored on lists (data.ts FACTIONS
// keys / OpponentList.faction). Deprecations are keyed by this name.
const SLUG_TO_FACTION = {
  "adepta-sororitas": "Adepta Sororitas", "adeptus-custodes": "Adeptus Custodes",
  "adeptus-mechanicus": "Adeptus Mechanicus", "aeldari": "Aeldari", "astra-militarum": "Astra Militarum",
  "blood-angels": "Blood Angels", "chaos-daemons": "Chaos Daemons", "chaos-knights": "Chaos Knights",
  "chaos-space-marines": "Chaos Space Marines", "dark-angels": "Dark Angels", "death-guard": "Death Guard",
  "deathwatch": "Deathwatch", "drukhari": "Drukhari", "emperors-children": "Emperor's Children",
  "genestealer-cults": "Genestealer Cults", "grey-knights": "Grey Knights", "imperial-knights": "Imperial Knights",
  "leagues-of-votann": "Leagues of Votann", "necrons": "Necrons", "orks": "Orks",
  "space-marines": "Space Marines", "space-wolves": "Space Wolves", "tau-empire": "T'au Empire",
  "thousand-sons": "Thousand Sons", "tyranids": "Tyranids", "world-eaters": "World Eaters",
};

// Factions whose rules materially changed: an EXISTING detachment's DP or
// Disposition moved. New/removed detachments alone don't deprecate lists.
function significantlyChangedFactions(oldSnap, newSnap) {
  const out = [];
  for (const slug of Object.keys(newSnap)) {
    const before = oldSnap[slug] || {};
    const after = newSnap[slug];
    const changed = Object.keys(after).some(
      (name) => before[name] && (before[name].dp !== after[name].dp || before[name].disposition !== after[name].disposition)
    );
    if (changed) out.push(slug);
  }
  return out;
}

// Stamp the changed codexes as deprecated in Firebase, signing in as the MFM
// bot (a dedicated Firebase user; credentials from GitHub secrets). Best-effort:
// missing creds or a failed write just logs and doesn't fail the run.
async function writeDeprecations(slugs) {
  const email = process.env.FIREBASE_BOT_EMAIL;
  const password = process.env.FIREBASE_BOT_PASSWORD;
  const key = process.env.FIREBASE_API_KEY || "AIzaSyB8Zy8X5JY44SFacjfgb-jU_wWrcVGfP-4";
  const db = process.env.FIREBASE_DB_URL || "https://wtcpairing-default-rtdb.europe-west1.firebasedatabase.app";
  if (!email || !password) {
    console.log("(no bot credentials — skipping library deprecation write)");
    return;
  }
  try {
    const auth = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }).then((r) => r.json());
    if (!auth.idToken) throw new Error("bot sign-in failed: " + JSON.stringify(auth.error || auth));
    const now = Date.now();
    const updates = {};
    for (const slug of slugs) {
      const faction = SLUG_TO_FACTION[slug] || slug;
      updates[faction] = { deprecatedAt: now, note: "MFM change" };
    }
    const res = await fetch(`${db}/estimates/_library/_deprecated.json?auth=${auth.idToken}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`PATCH _deprecated -> ${res.status} ${await res.text()}`);
    console.log(`Deprecated ${slugs.length} codex(es) in library: ${slugs.map((s) => SLUG_TO_FACTION[s] || s).join(", ")}`);
  } catch (e) {
    console.log("Deprecation write failed (non-fatal): " + e.message);
  }
}

const newSnap = await build();
const count = Object.values(newSnap).reduce((n, f) => n + Object.keys(f).length, 0);
const oldSnap = fs.existsSync(SNAPSHOT) ? JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")) : null;

const body = oldSnap ? diff(oldSnap, newSnap) : "";
fs.writeFileSync(SNAPSHOT, JSON.stringify(newSnap, null, 2) + "\n");

if (!oldSnap) {
  console.log(`Seeded MFM snapshot: ${Object.keys(newSnap).length} factions, ${count} detachments.`);
  if (fs.existsSync(CHANGES)) fs.unlinkSync(CHANGES);
} else if (body) {
  const md = `# MFM update detected (${new Date().toISOString().slice(0, 10)})\n\nDetachment Points / Force Disposition changes on mfm.warhammer-community.com:\n\n${body}\n\nRe-sync \`src/lib/data.ts\` FACTIONS (see the MFM v1.1 sync procedure in memory).\n`;
  fs.writeFileSync(CHANGES, md);
  console.log(md);
  // Stamp codexes whose existing rules changed as deprecated in the library.
  const changed = significantlyChangedFactions(oldSnap, newSnap);
  if (changed.length) await writeDeprecations(changed);
} else {
  console.log(`No MFM changes. ${Object.keys(newSnap).length} factions, ${count} detachments.`);
  if (fs.existsSync(CHANGES)) fs.unlinkSync(CHANGES);
}
