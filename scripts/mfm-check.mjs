// MFM watcher — checks mfm.warhammer-community.com for changes to detachment
// Detachment Points (DP) and Force Dispositions AND to unit points (codex /
// quarterly updates), which GW updates periodically. Run by
// .github/workflows/mfm-watch.yml on a schedule. Fetches each faction page (a
// browser User-Agent is required — plain bots get a 403), extracts every
// detachment's {name, dp, disposition} plus which units carry GW's "UPDATED"
// badge (points changed this cycle), and diffs against the committed
// mfm-snapshot.json. Writes the new snapshot and, on any change, mfm-changes.md.
//
// The site is a Next.js RSC app but each detachment header is plain HTML:
//   <span class="text-xl break-all">NAME</span>
//   <span class="text-sm self-end pl-2">NDP</span> … <div …background-color:#hex>DISPOSITION</div>
// and each changed unit shows a badge: <div …font-bold"><span>UPDATED</span></div>
// just after that unit's <span class="font-bold">NAME(S)</span>.
//
// The snapshot is {slug: {detName: {dp, disposition}}} PLUS a reserved
// "__updated" key = {slug: [sorted UPDATED unit labels]}. A faction is
// deprecated in the library when an existing detachment's DP/disposition moves
// OR its set of UPDATED units changes (so a codex/points rework is flagged even
// when the detachment lineup is untouched — the Custodes-codex gap).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = path.join(ROOT, "mfm-snapshot.json");
const CHANGES = path.join(ROOT, "mfm-changes.md");
const UPDATED_KEY = "__updated";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// Every faction page on the MFM index that the app uses. (The index also lists
// titan-legions / chaos-titan-legions, which aren't standard team-list factions
// and aren't in data.ts, so they're intentionally left out.)
const FACTIONS = [
  "adepta-sororitas", "adeptus-custodes", "adeptus-mechanicus", "aeldari", "astra-militarum",
  "black-templars", "blood-angels", "chaos-daemons", "chaos-knights", "chaos-space-marines",
  "dark-angels", "death-guard", "deathwatch", "drukhari", "emperors-children",
  "genestealer-cults", "grey-knights", "imperial-agents", "imperial-knights", "leagues-of-votann",
  "necrons", "orks", "space-marines", "space-wolves", "tau-empire",
  "thousand-sons", "tyranids", "world-eaters",
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
  // Scan detachment headers (name + DP badge), then collect the Force Disposition
  // color-divs that follow each one up to the next header. Most detachments have
  // ONE disposition; the generic 3DP detachments offer a CHOICE of TWO (e.g. T'au
  // Retaliation Cadre = Purge the Foe OR Reconnaissance) — captured as
  // `disposition` + `disposition2`.
  // NOTE: when GW changes a detachment's DP they inject `<!-- --> ▲/▼` (and
  // sometimes a text-nowrap class) inside the DP span, and the name span class
  // varies (break-all / keep-all) — so both are matched loosely, otherwise the
  // changed detachments get dropped and mis-reported as removed.
  const hdr =
    /<span class="text-xl[^"]*">([^<]+)<\/span>\s*<span class="text-sm self-end pl-2[^"]*">\s*(\d)DP(?:<!--[^>]*-->)?[^<]*<\/span>/g;
  const dispDiv = /<div class="[^"]*font-bold"[^>]*background-color:#[0-9A-Fa-f]{6}[^>]*>([^<]+)<\/div>/g;
  const heads = [];
  let m;
  while ((m = hdr.exec(html))) heads.push({ name: decode(m[1]), dp: Number(m[2]), start: m.index, end: hdr.lastIndex });
  const out = {};
  for (let i = 0; i < heads.length; i++) {
    const from = heads[i].end;
    const to = i + 1 < heads.length ? heads[i + 1].start : Math.min(html.length, from + 1200);
    const seg = html.slice(from, to);
    const disps = [];
    let d;
    dispDiv.lastIndex = 0;
    while ((d = dispDiv.exec(seg))) disps.push(decode(d[1]));
    const entry = { dp: heads[i].dp, disposition: disps[0] || "" };
    if (disps[1] && disps[1] !== disps[0]) entry.disposition2 = disps[1];
    out[heads[i].name] = entry;
  }
  return out;
}

// The unit groups GW flagged "UPDATED" (points changed this cycle). Each UPDATED
// badge sits just after that unit's <span class="font-bold">NAME(S)</span>; we
// take the nearest preceding font-bold label within a short window. Returns a
// sorted, de-duped list — a stable fingerprint of what changed for this faction.
function extractUpdatedUnits(html) {
  const spans = [];
  const re = /<span class="font-bold">([^<]+)<\/span>/g;
  let m;
  while ((m = re.exec(html))) spans.push({ idx: m.index, text: decode(m[1]) });
  const set = new Set();
  const up = /<span>UPDATED<\/span>/g;
  let u;
  while ((u = up.exec(html))) {
    let label = null;
    for (const s of spans) {
      if (s.idx < u.index) {
        if (u.index - s.idx < 400) label = s.text; // nearest within window
      } else break;
    }
    if (label) set.add(label);
  }
  return [...set].sort();
}

async function fetchFaction(slug) {
  const r = await fetch(`https://mfm.warhammer-community.com/en/${slug}`, {
    headers: { "User-Agent": UA, Accept: "text/html" },
  });
  if (!r.ok) throw new Error(`${slug}: HTTP ${r.status}`);
  const html = await r.text();
  const dets = extractDetachments(html);
  if (Object.keys(dets).length === 0) throw new Error(`${slug}: no detachments parsed (site layout may have changed)`);
  return { dets, updated: extractUpdatedUnits(html) };
}

async function build() {
  const snapshot = {};
  const updated = {};
  for (const slug of FACTIONS) {
    // Serial + small delay to be polite to the site.
    const { dets, updated: up } = await fetchFaction(slug);
    snapshot[slug] = dets;
    updated[slug] = up;
    await new Promise((r) => setTimeout(r, 300));
  }
  snapshot[UPDATED_KEY] = updated;
  return snapshot;
}

const factionSlugs = (snap) => Object.keys(snap).filter((k) => k !== UPDATED_KEY);
const detachmentTotal = (snap) => factionSlugs(snap).reduce((n, s) => n + Object.keys(snap[s]).length, 0);

function diff(oldSnap, newSnap) {
  const lines = [];
  // Detachment DP / disposition changes.
  for (const slug of factionSlugs(newSnap)) {
    const before = oldSnap[slug] || {};
    const after = newSnap[slug];
    const changes = [];
    for (const name of Object.keys(after)) {
      const a = after[name];
      const b = before[name];
      if (!b) changes.push(`- **${name}** added (${a.dp}DP · ${[a.disposition, a.disposition2].filter(Boolean).join(" / ")})`);
      else if (b.dp !== a.dp || b.disposition !== a.disposition || (b.disposition2 || null) !== (a.disposition2 || null))
        changes.push(`- **${name}**: ${b.dp}DP·${[b.disposition, b.disposition2].filter(Boolean).join("/")} → ${a.dp}DP·${[a.disposition, a.disposition2].filter(Boolean).join("/")}`);
    }
    for (const name of Object.keys(before)) {
      if (!after[name]) changes.push(`- **${name}** removed`);
    }
    if (changes.length) lines.push(`### ${slug} — detachments\n${changes.join("\n")}`);
  }
  // Unit points (UPDATED badges) changes.
  const oldUp = oldSnap[UPDATED_KEY] || {};
  const newUp = newSnap[UPDATED_KEY] || {};
  const unitLines = [];
  for (const slug of factionSlugs(newSnap)) {
    const b = oldUp[slug] || [];
    const a = newUp[slug] || [];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      const sample = a.slice(0, 6).join(", ") + (a.length > 6 ? ", …" : "");
      unitLines.push(`- **${slug}**: ${a.length} unit(s) with updated points${a.length ? ` (${sample})` : ""} [was ${b.length}]`);
    }
  }
  if (unitLines.length) lines.push(`### Unit points updated (codex / quarterly)\n${unitLines.join("\n")}`);
  return lines.join("\n\n");
}

// MFM faction slug -> the faction NAME as stored on lists (data.ts FACTIONS
// keys / OpponentList.faction). Deprecations are keyed by this name.
const SLUG_TO_FACTION = {
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

// Factions whose estimates are now stale: an EXISTING detachment's DP or
// Disposition moved, OR the set of UPDATED units (points/codex) changed.
// New/removed detachments alone don't deprecate lists.
function significantlyChangedFactions(oldSnap, newSnap) {
  const out = new Set();
  for (const slug of factionSlugs(newSnap)) {
    const before = oldSnap[slug] || {};
    const after = newSnap[slug];
    const detChanged = Object.keys(after).some(
      (name) =>
        before[name] &&
        (before[name].dp !== after[name].dp ||
          before[name].disposition !== after[name].disposition ||
          (before[name].disposition2 || null) !== (after[name].disposition2 || null))
    );
    if (detChanged) out.add(slug);
  }
  const oldUp = oldSnap[UPDATED_KEY] || {};
  const newUp = newSnap[UPDATED_KEY] || {};
  for (const slug of factionSlugs(newSnap)) {
    const a = JSON.stringify(newUp[slug] || []);
    const b = JSON.stringify(oldUp[slug] || []);
    if (a !== b) out.add(slug);
  }
  return [...out];
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
const count = detachmentTotal(newSnap);
const oldSnap = fs.existsSync(SNAPSHOT) ? JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")) : null;

const body = oldSnap ? diff(oldSnap, newSnap) : "";
fs.writeFileSync(SNAPSHOT, JSON.stringify(newSnap, null, 2) + "\n");

if (!oldSnap) {
  console.log(`Seeded MFM snapshot: ${factionSlugs(newSnap).length} factions, ${count} detachments.`);
  if (fs.existsSync(CHANGES)) fs.unlinkSync(CHANGES);
} else if (body) {
  const md = `# MFM update detected (${new Date().toISOString().slice(0, 10)})\n\nChanges on mfm.warhammer-community.com:\n\n${body}\n\n\`src/lib/data.ts\` FACTIONS was re-synced from the snapshot automatically (same commit) and deploys itself — **review the diff**. Unit-points changes don't touch data.ts, but the affected codexes are deprecated in the library so stale estimate sources show ⚠.\n`;
  fs.writeFileSync(CHANGES, md);
  console.log(md);
  // Stamp codexes whose detachments OR unit points changed as deprecated.
  const changed = significantlyChangedFactions(oldSnap, newSnap);
  if (changed.length) await writeDeprecations(changed);
} else {
  console.log(`No MFM changes. ${factionSlugs(newSnap).length} factions, ${count} detachments.`);
  if (fs.existsSync(CHANGES)) fs.unlinkSync(CHANGES);
}
