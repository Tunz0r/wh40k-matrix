// Parses a raw army list export (GW app, WTC submission format, NewRecruit,
// BattleScribe) into a compact unit summary: one entry per unit, model count
// kept ("10x Jakhals"), everything else (player names, wargear, points,
// enhancements) stripped.

import { FACTIONS, DISP_STYLES, type Disposition } from "./data";

// Unit lines carry a points cost: "(415 points)", "(70 pts)" or "[70 pts]"
const POINTS_RE = /[([]\s*(\d+)\s*(?:points|pts?)\s*[)\]]/i;

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
    if (Number(match[1]) >= ARMY_TOTAL_THRESHOLD) continue;

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

// "Chaos - World Eaters", "Xenos - Aeldari", "Adepta Sororitas" → our faction key
function matchFaction(raw: string): string | null {
  const cleaned = raw.replace(/^.*:/, "").trim();
  // Exact match on the part after a leading "Grand Alliance - " prefix, or whole
  const candidates = [cleaned, cleaned.split(/\s[-–]\s/).pop()?.trim() || cleaned];
  for (const c of candidates) {
    const hit = FACTION_NAMES.find((f) => f.toLowerCase() === c.toLowerCase());
    if (hit) return hit;
  }
  // Substring fallback (longest faction name first to avoid "Chaos" clashes)
  const byLen = [...FACTION_NAMES].sort((a, b) => b.length - a.length);
  const sub = byLen.find((f) => cleaned.toLowerCase().includes(f.toLowerCase()));
  if (sub) return sub;
  // Chapters without their own faction entry ("Imperium - Adeptus Astartes -
  // Ultramarines") play the shared Space Marines codex.
  if (/adeptus\s+astartes/i.test(cleaned)) {
    return FACTION_NAMES.find((f) => f.toLowerCase() === "space marines") || null;
  }
  return null;
}

function matchOneDetachment(faction: string | null, name: string): string | null {
  const search = (dets: { n: string }[]) =>
    dets.find((d) => d.n.toLowerCase() === name.toLowerCase())?.n || null;
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

// Dual-detachment aware: "Cabal of Chaos, Soulforged Warpack (Empyric
// Wellspring)" → ["Cabal of Chaos", "Soulforged Warpack"]. The parenthetical
// is the keystone/upgrade suite or DP cost, not a detachment name. Pairs are
// joined by "," or "and"/"og" — but "and" only splits when the whole name
// doesn't match (names like "Legends of Saga and Song" stay intact).
function matchDetachments(faction: string | null, raw: string): string[] {
  const cleaned = stripNum(raw.replace(/^.*:/, "").replace(/\([^)]*\)/g, "").trim());
  const result: string[] = [];
  const add = (name: string | null) => {
    if (name && !result.includes(name)) result.push(name);
  };
  for (const part of cleaned.split(",").map((s) => s.trim()).filter(Boolean)) {
    const hit = matchOneDetachment(faction, part);
    if (hit) {
      add(hit);
      continue;
    }
    for (const sub of part.split(/\s+(?:and|og|&)\s+/i).map((s) => s.trim()).filter(Boolean)) {
      add(matchOneDetachment(faction, sub));
    }
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
      const c = line.replace(/^.*:/, "").trim();
      disposition =
        DISPOSITION_NAMES.find((d) => d.toLowerCase() === c.toLowerCase()) ?? null;
    }
  }
  // GW-app style: faction / detachment appear as bare lines near the top
  if (!faction) {
    for (const line of lines.slice(0, 12)) {
      const f = FACTION_NAMES.find((n) => n.toLowerCase() === line.toLowerCase());
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
      const c = stripNum(line.replace(/^.*:/, "").trim());
      const hit = DISPOSITION_NAMES.find((d) => d.toLowerCase() === c.toLowerCase());
      if (hit) { disposition = hit; break; }
    }
  }
  return { faction, detachments, disposition };
}

// Split a multi-list document into per-list chunks, then parse each.
// Handles WTC combined submissions (+ PLAYER / + FACTION KEYWORD headers) and
// GW-app exports concatenated back to back.
export function parseTeamLists(text: string): ParsedList[] {
  const lines = text.split(/\r?\n/);

  // Boundary markers: a new list starts at a WTC header or a GW-app army total.
  const boundaries: number[] = [];
  const isWtcHeader = (l: string) => /^\s*\+\s*(player|faction\s*keyword)\b/i.test(l);
  const isArmyTotal = (l: string) => {
    const m = l.match(POINTS_RE);
    return !!m && Number(m[1]) >= 1500;
  };
  const usesWtc = lines.some(isWtcHeader);

  lines.forEach((l, i) => {
    if (usesWtc) {
      // One boundary per FACTION KEYWORD line (or PLAYER when no keyword nearby)
      if (/^\s*\+\s*faction\s*keyword\b/i.test(l)) boundaries.push(i);
    } else if (isArmyTotal(l)) {
      boundaries.push(i);
    }
  });

  // Fall back to treating the whole thing as one list
  if (boundaries.length === 0) {
    const units = parseArmyList(text);
    return units.length ? [{ ...detectMeta(text), units }] : [];
  }

  const results: ParsedList[] = [];
  for (let b = 0; b < boundaries.length; b++) {
    // Include a couple of lines before the boundary for GW-app (army name/faction
    // sit just above the total) — but not past the previous chunk's end.
    const rawStart = boundaries[b];
    const start = usesWtc ? rawStart : Math.max(b === 0 ? 0 : boundaries[b - 1] + 1, rawStart - 3);
    const end = b + 1 < boundaries.length ? boundaries[b + 1] : lines.length;
    const chunk = lines.slice(start, end).join("\n");
    const units = parseArmyList(chunk);
    if (!units.length) continue;
    results.push({ ...detectMeta(chunk), units });
  }
  return results;
}
