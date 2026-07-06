import { ref, set, remove, onValue, off, update } from "firebase/database";
import { getDb, authReady } from "./firebase";
import { TEAM_SLUG } from "./team";
import type { RosterArmy } from "./roster";

// One estimate cell: our army (row) vs an opponent list (column).
// `auto` marks values propagated via list similarity — overridable, shown dimmed.
export interface EstimateCell {
  v: number; // 0-20 WTC scale
  auto?: boolean;
}

// An opponent list: faction/detachments/disposition metadata, optionally with
// parsed list content (unit names, duplicates allowed) once WTC lists drop.
export interface OpponentList extends RosterArmy {
  units?: string[];
}

export interface OpponentTeam {
  name: string;
  tier: string;
  armies: OpponentList[];
  // key `${ourIdx}_${theirIdx}` → cell
  estimates?: Record<string, EstimateCell>;
}

export type OpponentMap = Record<string, OpponentTeam>;

const BASE = `estimates/${TEAM_SLUG}`;

// "Team Sweden" and "Sweden" must map to the same slug — round opponent names
// come from imported rosters while estimate teams use seeding country names.
export function slugifyTeam(name: string): string {
  return name
    .toLowerCase()
    .replace(/^team\s+/i, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function subscribeToOpponents(
  callback: (teams: OpponentMap) => void
): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  authReady().then(() => {
    if (cancelled) return;
    const r = ref(getDb(), BASE);
    onValue(r, (snap) => callback(snap.val() || {}));
    cleanup = () => off(r);
  });
  return () => {
    cancelled = true;
    cleanup?.();
  };
}

export async function saveOpponentTeam(
  slug: string,
  team: OpponentTeam
): Promise<void> {
  await authReady();
  await set(ref(getDb(), `${BASE}/${slug}`), team);
}

export async function deleteOpponentTeam(slug: string): Promise<void> {
  await authReady();
  await remove(ref(getDb(), `${BASE}/${slug}`));
}

// Replace a single list on a team without touching the other seven or the estimates.
export async function updateOpponentList(
  slug: string,
  idx: number,
  list: OpponentList
): Promise<void> {
  await authReady();
  await set(ref(getDb(), `${BASE}/${slug}/armies/${idx}`), list);
}

// Multi-path write of estimate cells. Keys are `${teamSlug}/${ourIdx}_${theirIdx}`;
// null deletes the cell.
export async function writeEstimateCells(
  cells: Record<string, EstimateCell | null>
): Promise<void> {
  await authReady();
  const updates: Record<string, EstimateCell | null> = {};
  for (const [key, value] of Object.entries(cells)) {
    const [teamSlug, cellKey] = key.split("/");
    updates[`${BASE}/${teamSlug}/estimates/${cellKey}`] = value;
  }
  await update(ref(getDb()), updates);
}

// --- List similarity ---
// Two modes, both gated on same faction:
//
// With parsed list content (units) on both sides, what's IN the lists matters
// far more than the disposition: faction 30 + unit overlap up to 50
// (Sørensen–Dice on unit names, duplicates counted) + detachment overlap 15 +
// same disposition 5.
//
// Metadata-only fallback (no unit data yet): faction 40 + detachment overlap
// up to 40 + same disposition 20 — same faction+detachments with a different
// disposition scores exactly 80.
//
// 80+ ⇒ "same list" for estimate purposes.
export const SIMILARITY_THRESHOLD = 80;

function unitOverlap(a: string[], b: string[]): number {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const pool = new Map<string, number>();
  for (const u of a) {
    const k = norm(u);
    pool.set(k, (pool.get(k) || 0) + 1);
  }
  let inter = 0;
  for (const u of b) {
    const k = norm(u);
    const c = pool.get(k) || 0;
    if (c > 0) {
      inter++;
      pool.set(k, c - 1);
    }
  }
  return (2 * inter) / (a.length + b.length);
}

export function listSimilarity(a: OpponentList, b: OpponentList): number {
  if (a.faction !== b.faction) return 0;

  const aDets = a.detachments || [];
  const bDetSet = new Set(b.detachments || []);
  const detUnion = new Set([...aDets, ...bDetSet]).size;
  const detInter = aDets.filter((d) => bDetSet.has(d)).length;
  const detScore = detUnion ? detInter / detUnion : 1;
  const sameDisp = (a.disposition ?? null) === (b.disposition ?? null);

  const aUnits = a.units || [];
  const bUnits = b.units || [];
  if (aUnits.length > 0 && bUnits.length > 0) {
    return 30 + 50 * unitOverlap(aUnits, bUnits) + 15 * detScore + (sameDisp ? 5 : 0);
  }
  return 40 + 40 * detScore + (sameDisp ? 20 : 0);
}

// Look up the best estimate for one of our armies vs an arbitrary opponent list.
// Prefers the named team's own stored lists, then falls back to the most
// similar list (≥ threshold) anywhere in the field.
export function lookupEstimate(
  opponents: OpponentMap,
  opponentName: string | null | undefined,
  ourIdx: number,
  theirList: OpponentList
): number | null {
  const preferredSlug = opponentName ? slugifyTeam(opponentName) : null;
  let best: { sim: number; v: number; preferred: boolean } | null = null;
  for (const [slug, team] of Object.entries(opponents)) {
    const preferred = slug === preferredSlug;
    (team.armies || []).forEach((list, j) => {
      const cell = team.estimates?.[`${ourIdx}_${j}`];
      if (!cell) return;
      const sim = listSimilarity(theirList, list);
      if (sim < SIMILARITY_THRESHOLD) return;
      if (
        !best ||
        (preferred && !best.preferred) ||
        (preferred === best.preferred && sim > best.sim)
      ) {
        best = { sim, v: cell.v, preferred };
      }
    });
  }
  return best ? (best as { v: number }).v : null;
}

// --- WTC estimate → color band ---
// 0-4 black (very bad), 5-8 red (bad), 9-11 yellow (even),
// 12-15 green (good), 16-20 blue (very good).
export interface EstimateStyle {
  bg: string;
  fg: string;
  border: string;
  label: string;
}

export function estimateStyle(v: number): EstimateStyle {
  if (v <= 4)
    return { bg: "#000000", fg: "#a1a1aa", border: "rgba(255,255,255,0.25)", label: "Meget dårlig" };
  if (v <= 8)
    return { bg: "rgba(239,68,68,0.28)", fg: "#fca5a5", border: "rgba(239,68,68,0.4)", label: "Dårlig" };
  if (v <= 11)
    return { bg: "rgba(234,179,8,0.22)", fg: "#fde047", border: "rgba(234,179,8,0.35)", label: "Lige" };
  if (v <= 15)
    return { bg: "rgba(34,197,94,0.25)", fg: "#86efac", border: "rgba(34,197,94,0.4)", label: "God" };
  return { bg: "rgba(59,130,246,0.3)", fg: "#93c5fd", border: "rgba(59,130,246,0.45)", label: "Meget god" };
}
