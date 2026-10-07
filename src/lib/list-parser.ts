// Parses a raw army list export (GW app, WTC submission format, NewRecruit,
// BattleScribe) into a compact unit summary: one entry per unit, model count
// kept ("10x Jakhals"), everything else (player names, wargear, points,
// enhancements) stripped.

import { FACTIONS, DISP_STYLES, type Disposition } from "./data";

// Unit lines carry a points cost: "(415 points)", "(70 pts)" or "[70 pts]".
// The number may include a thousands separator — BCP exports army totals as
// "(1.985 Points)" (EU) or "(1,985 pts)" (US) — so capture digits + separators
// and strip them with pointsValue() before comparing.
const POINTS_RE = /[([]\s*([\d.,]+)\s*(?:points|pts?)\s*[)\]]/i;

// Numeric value of a POINTS_RE capture, tolerating thousands separators.
// Points are always whole numbers, so "1.985"/"1,985" both → 1985.
function pointsValue(captured: string): number {
  return Number(captured.replace(/[.,\s]/g, ""));
}

// Lines that carry a cost but aren't units
const NON_UNIT_RE =
  /^(strike force|incursion|onslaught|combat patrol|boarding patrol|army roster|total|enhancement)/i;

// Nothing WTC-legal costs this much — lines at or above are army names/totals
const ARMY_TOTAL_THRESHOLD = 700;

export function parseArmyList(text: string): string[] {
  const units: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // Bullets/indented detail lines are wargear or model breakdowns; "+"-lines
    // are WTC metadata (player name, faction, ...)
    if (/^[•◦▪‣*+·-]/.test(line) || /^\s{2,}/.test(raw)) continue;
    const match = line.match(POINTS_RE);
    if (!match || match.index === undefined) continue;
    if (pointsValue(match[1]) >= ARMY_TOTAL_THRESHOLD) continue;

    // Keep only the text BEFORE the cost — anything after is wargear
    let name = line.slice(0, match.index).trim();
    // Strip slot labels: "Char1:", "HQ2:", "Troop 3:", leading numbering
    name = name.replace(/^(char\w*|hq\w*|troops?\w*|elites?\w*|fast attack\w*|heavy support\w*|dt\w*|lo[wc]\w*|\d+)\s*[:.\-]\s*/i, "");
    // Trailing separators
    name = name.replace(/\s*[:\-–,]\s*$/, "").trim();
    if (!name || NON_UNIT_RE.test(name)) continue;
    if (/enhancement/i.test(name)) continue;
    // Normalise "1x Name" → "Name", keep bigger model counts
    name = name.replace(/^1\s*x\s+/i, "");
    units.push(name);
  }
  return units;
}

// Aggregate duplicate units: ["10x Jakhals","10x Jakhals","Angron"]
// → ["10x Jakhals (x2)", "Angron"]
function aggregateUnits(units: string[]): string[] {
  const counts = new Map<string, number>();
  for (const u of units) counts.set(u, (counts.get(u) || 0) + 1);
  return [...counts.entries()].map(([u, n]) => (n > 1 ? `${u} (x${n})` : u));
}

// Compact single-line summary: "10x Jakhals (x2) · Angron"
export function formatUnits(units: string[]): string {
  return aggregateUnits(units).join(" · ");
}

// One unit per line — for hover tooltips where readability matters.
export function formatUnitsLines(units: string[]): string {
  return aggregateUnits(units).join("\n");
}

// --- Bulk team parsing: one document → up to 8 lists ---

export interface ParsedList {
  faction: string | null;
  detachments: string[];
  disposition: Disposition | null;
  units: string[];
}

const FACTION_NAMES = Object.keys(FACTIONS);
const DISPOSITION_NAMES = Object.keys(DISP_STYLES) as Disposition[];

// Exports differ from our data in punctuation and accent encoding — curly vs
// straight apostrophes, and composed vs decomposed accents ("Needgaârd").
// Compare names on a form that ignores both.
function normName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// "Chaos - World Eaters", "Xenos - Aeldari", "Adepta Sororitas" → our faction key
function matchFaction(raw: string): string | null {
  const cleaned = raw.replace(/^.*:/, "").trim();
  // Exact match on the part after a leading "Grand Alliance - " prefix, or whole
  const candidates = [cleaned, cleaned.split(/\s[-–]\s/).pop()?.trim() || cleaned];
  for (const c of candidates) {
    const hit = FACTION_NAMES.find((f) => normName(f) === normName(c));
    if (hit) return hit;
  }
  // Substring fallback. "Space Marines Black Templars" names the codex first and
  // the chapter second, so prefer the LATEST match (most specific), then the
  // longest — that also keeps "Chaos" from swallowing "Chaos Space Marines".
  const n = normName(cleaned);
  const hits = FACTION_NAMES.map((f) => ({ f, at: n.indexOf(normName(f)) }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => b.at - a.at || b.f.length - a.f.length);
  if (hits.length) return hits[0].f;
  // Chapters without their own faction entry ("Imperium - Adeptus Astartes -
  // Ultramarines") play the shared Space Marines codex.
  if (/adeptus\s+astartes/i.test(cleaned)) {
    return FACTION_NAMES.find((f) => normName(f) === "space marines") || null;
  }
  return null;
}

function matchOneDetachment(faction: string | null, name: string): string | null {
  const search = (dets: { n: string }[]) =>
    dets.find((d) => normName(d.n) === normName(name))?.n || null;
  if (faction && FACTIONS[faction]) {
    const hit = search(FACTIONS[faction]);
    if (hit) return hit;
  }
  // Search every faction's detachments (handles detachment line before faction)
  for (const dets of Object.values(FACTIONS)) {
    const hit = search(dets);
    if (hit) return hit;
  }
  return null;
}

// Strip leading enumeration from header lines: "2. Hearthguard..." → "Hearthguard..."
function stripNum(s: string): string {
  return s.replace(/^\d+\s*[.)]\s*/, "");
}

// A multi-detachment list can offer a CHOICE of dispositions ("Force
// Dispositions: Disruption, Purge the Foe"). We store one, so take the first
// listed — the captain picks the real one at pairing anyway.
function firstDisposition(raw: string): Disposition | null {
  for (const part of raw.split(/[,/]/).map((s) => s.trim())) {
    const hit = DISPOSITION_NAMES.find((d) => d.toLowerCase() === part.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

// Resolve a run of detachment names joined by "and"/"og"/"&". The whole string
// is tried first, then every separator position — a split is only accepted when
// BOTH sides fully resolve to known detachments. That keeps names that contain
// "and" intact: "Legends of Saga and Song and Saga of the Great Wolf" splits at
// the SECOND "and", not the first.
function resolveDetachmentRun(faction: string | null, text: string): string[] | null {
  const whole = matchOneDetachment(faction, text);
  if (whole) return [whole];
  const seps = [...text.matchAll(/\s+(?:and|og|&)\s+/gi)];
  for (const m of seps) {
    if (m.index === undefined) continue;
    const left = resolveDetachmentRun(faction, text.slice(0, m.index).trim());
    if (!left) continue;
    const right = resolveDetachmentRun(faction, text.slice(m.index + m[0].length).trim());
    if (right) return [...left, ...right];
  }
  return null;
}

// Dual/triple-detachment aware: "Cabal of Chaos, Soulforged Warpack (Empyric
// Wellspring)" → ["Cabal of Chaos", "Soulforged Warpack"]. The parenthetical
// is the keystone/upgrade suite or DP cost, not a detachment name. Names are
// joined by "," and/or "and"/"og".
function matchDetachments(faction: string | null, raw: string): string[] {
  const cleaned = stripNum(raw.replace(/^.*:/, "").replace(/\([^)]*\)/g, "").trim());
  const result: string[] = [];
  const add = (name: string) => {
    if (!result.includes(name)) result.push(name);
  };
  for (const part of cleaned.split(",").map((s) => s.trim()).filter(Boolean)) {
    const run = resolveDetachmentRun(faction, part);
    if (run) run.forEach(add);
  }
  return result;
}

// Detect faction, detachments and disposition anywhere within one list's text.
function detectMeta(chunk: string): {
  faction: string | null;
  detachments: string[];
  disposition: Disposition | null;
} {
  const lines = chunk.split(/\r?\n/).map((l) => l.trim());
  let faction: string | null = null;
  let detachments: string[] = [];
  let disposition: Disposition | null = null;

  for (const line of lines) {
    if (!faction && /faction\s*keyword/i.test(line)) faction = matchFaction(line);
    if (!detachments.length && /detachment/i.test(line))
      detachments = matchDetachments(faction, line);
    if (!disposition && /force\s*disposition/i.test(line)) {
      disposition = firstDisposition(line.replace(/^.*:/, ""));
    }
  }
  // GW-app style: the faction is a bare line near the top, sometimes with the
  // chapter appended ("Space Marines Black Templars"). Only short lines are
  // considered so unit/wargear lines can't masquerade as a faction.
  if (!faction) {
    for (const line of lines.slice(0, 12)) {
      if (!line || line.split(/\s+/).length > 6 || /\(|\d/.test(line)) continue;
      const f = matchFaction(line);
      if (f) { faction = f; break; }
    }
  }
  if (!detachments.length) {
    for (const line of lines.slice(0, 15)) {
      const d = matchDetachments(faction, line);
      if (d.length) { detachments = d; break; }
    }
  }
  // Bare disposition line near the top ("3. Priority Assets")
  if (!disposition) {
    for (const line of lines.slice(0, 15)) {
      const hit = firstDisposition(stripNum(line.replace(/^.*:/, "")));
      if (hit) { disposition = hit; break; }
    }
  }
  return { faction, detachments, disposition };
}

// Split a multi-list document into per-list chunks, then parse each.
// Handles WTC combined submissions (+ PLAYER / + FACTION KEYWORD headers),
// GW-app / BCP exports (army name + bracketed total at the top), and teams that
// MIX the two — a WTC header on one list must not stop the others from splitting.
export function parseTeamLists(text: string): ParsedList[] {
  const lines = text.split(/\r?\n/);

  const isWtcHeader = (l: string) => /^\s*\+\s*(player|faction\s*keyword)\b/i.test(l);
  const isArmyTotal = (l: string) => {
    const m = l.match(POINTS_RE);
    return !!m && pointsValue(m[1]) >= 1500;
  };
  // A real unit line (carries a sub-army cost, isn't a bullet/header/total) — the
  // signal that one list's BODY has begun, so the next header/total opens a NEW
  // list instead of being folded in. Mirrors parseArmyList's per-line acceptance.
  const isUnitLine = (raw: string): boolean => {
    const line = raw.trim();
    if (!line) return false;
    if (/^[•◦▪‣*+·-]/.test(line) || /^\s{2,}/.test(raw)) return false;
    const m = line.match(POINTS_RE);
    if (!m || m.index === undefined) return false;
    if (pointsValue(m[1]) >= ARMY_TOTAL_THRESHOLD) return false;
    const name = line.slice(0, m.index).trim();
    return !!name && !NON_UNIT_RE.test(name);
  };

  // One boundary per list. A WTC header OR a bracketed army total opens a list,
  // but only once per list: further headers/totals in the same list's header
  // region (before any unit line) are ignored. This makes mixed-format teams and
  // BCP lists that carry BOTH a bracketed total and a + FACTION KEYWORD split
  // into exactly one chunk each. `lookback` grabs the GW-app army-name/faction
  // lines that sit just above a bare total; WTC headers need no lookback.
  const boundaries: { line: number; lookback: boolean }[] = [];
  let sawUnits = true; // so the first header/total always opens a list
  lines.forEach((raw, i) => {
    const header = isWtcHeader(raw);
    const total = isArmyTotal(raw);
    if (header || total) {
      if (sawUnits) {
        boundaries.push({ line: i, lookback: total && !header });
        sawUnits = false;
      }
      return;
    }
    if (isUnitLine(raw)) sawUnits = true;
  });

  // Fall back to treating the whole thing as one list
  if (boundaries.length === 0) {
    const units = parseArmyList(text);
    return units.length ? [{ ...detectMeta(text), units }] : [];
  }

  const results: ParsedList[] = [];
  for (let b = 0; b < boundaries.length; b++) {
    const { line: rawStart, lookback } = boundaries[b];
    const prevEnd = b === 0 ? 0 : boundaries[b - 1].line + 1;
    // Include the army name/faction lines sitting just above a GW-app total, but
    // walk up only over non-unit lines and stop at the previous list's last unit
    // (or the previous chunk's end) — never pull in the neighbour's units.
    let start = rawStart;
    if (lookback) {
      for (let k = 0; k < 3 && start - 1 >= prevEnd && !isUnitLine(lines[start - 1]); k++) {
        start--;
      }
    }
    const end = b + 1 < boundaries.length ? boundaries[b + 1].line : lines.length;
    const chunk = lines.slice(start, end).join("\n");
    const units = parseArmyList(chunk);
    if (!units.length) continue;
    results.push({ ...detectMeta(chunk), units });
  }
  return results;
}

// Split a WHOLE-EVENT document into teams, each with its parsed lists. Teams are
// separated by a delimiter line (=== / --- / *** of length >=3); the first
// non-empty line of each block is the team/country name, the rest is that team's
// list export (parsed with parseTeamLists). Blocks with no name or no lists are
// dropped. Used by the event bulk-list importer.
export interface ParsedTeam {
  name: string;
  lists: ParsedList[];
}
export function parseEventLists(text: string): ParsedTeam[] {
  const isSep = (l: string) => /^\s*[=*_·—–-]{3,}\s*$/.test(l);
  const blocks: { name: string; body: string[] }[] = [];
  let cur: { name: string; body: string[] } | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (isSep(line)) {
      if (cur) blocks.push(cur);
      cur = { name: "", body: [] };
      continue;
    }
    if (!cur) cur = { name: "", body: [] };
    if (!cur.name && line.trim()) { cur.name = line.trim(); continue; }
    cur.body.push(line);
  }
  if (cur) blocks.push(cur);
  return blocks
    .map((b) => ({ name: b.name, lists: parseTeamLists(b.body.join("\n")) }))
    .filter((t) => t.name && t.lists.length > 0);
}
