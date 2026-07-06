import { ref, set, remove, onValue, off, update } from "firebase/database";
import { getDb } from "./firebase";
import { TEAM_SLUG } from "./team";
import type { RosterArmy } from "./roster";

// One estimate cell: our army (row) vs an opponent list (column).
// `auto` marks values propagated via list similarity — overridable, shown dimmed.
export interface EstimateCell {
  v: number; // 0-20 WTC scale
  auto?: boolean;
}

export interface OpponentTeam {
  name: string;
  tier: string;
  armies: RosterArmy[];
  // key `${ourIdx}_${theirIdx}` → cell
  estimates?: Record<string, EstimateCell>;
}

export type OpponentMap = Record<string, OpponentTeam>;

const BASE = `estimates/${TEAM_SLUG}`;

export function slugifyTeam(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function subscribeToOpponents(
  callback: (teams: OpponentMap) => void
): () => void {
  const r = ref(getDb(), BASE);
  onValue(r, (snap) => callback(snap.val() || {}));
  return () => off(r);
}

export async function saveOpponentTeam(
  slug: string,
  team: OpponentTeam
): Promise<void> {
  await set(ref(getDb(), `${BASE}/${slug}`), team);
}

export async function deleteOpponentTeam(slug: string): Promise<void> {
  await remove(ref(getDb(), `${BASE}/${slug}`));
}

// Multi-path write of estimate cells. Keys are `${teamSlug}/${ourIdx}_${theirIdx}`;
// null deletes the cell.
export async function writeEstimateCells(
  cells: Record<string, EstimateCell | null>
): Promise<void> {
  const updates: Record<string, EstimateCell | null> = {};
  for (const [key, value] of Object.entries(cells)) {
    const [teamSlug, cellKey] = key.split("/");
    updates[`${BASE}/${teamSlug}/estimates/${cellKey}`] = value;
  }
  await update(ref(getDb()), updates);
}

// --- List similarity ---
// Lists only carry faction + detachments + disposition, so similarity is:
// same faction 40, detachment overlap up to 40 (Jaccard), same disposition 20.
// 80+ ⇒ "same list" for estimate purposes (e.g. same faction+detachments
// with a different disposition scores exactly 80).
export const SIMILARITY_THRESHOLD = 80;

export function listSimilarity(a: RosterArmy, b: RosterArmy): number {
  if (a.faction !== b.faction) return 0;
  let score = 40;
  const aDets = a.detachments || [];
  const bDets = new Set(b.detachments || []);
  const unionSize = new Set([...aDets, ...bDets]).size;
  const inter = aDets.filter((d) => bDets.has(d)).length;
  score += unionSize ? (40 * inter) / unionSize : 40;
  if ((a.disposition ?? null) === (b.disposition ?? null)) score += 20;
  return score;
}

// Look up the best estimate for one of our armies vs an arbitrary opponent list.
// Prefers the named team's own stored lists, then falls back to the most
// similar list (≥ threshold) anywhere in the field.
export function lookupEstimate(
  opponents: OpponentMap,
  opponentName: string | null | undefined,
  ourIdx: number,
  theirList: RosterArmy
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
