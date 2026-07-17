import { ref, set, get, remove, onValue, off, update } from "firebase/database";
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
  notes?: string; // scouting intel about this specific list
}

export interface OpponentTeam {
  name: string;
  tier: string;
  armies: OpponentList[];
  // key `${ourIdx}_${theirIdx}` → cell
  estimates?: Record<string, EstimateCell>;
  notes?: string; // scouting intel about the team / captain / pairing habits
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

// Restore teams from a backup by writing each team individually. Teams present
// in the backup are overwritten; teams NOT in the backup are left untouched
// (never a blanket wipe), so restoring an old backup can't delete newer teams.
export async function restoreOpponents(map: OpponentMap): Promise<number> {
  await authReady();
  const updates: Record<string, OpponentTeam> = {};
  for (const [slug, team] of Object.entries(map)) {
    if (team && team.name) updates[`${BASE}/${slug}`] = team;
  }
  if (Object.keys(updates).length) await update(ref(getDb()), updates);
  return Object.keys(updates).length;
}

// Save scouting note for a whole team (patch, doesn't touch lists/estimates).
export async function saveTeamNote(slug: string, note: string): Promise<void> {
  await authReady();
  await set(ref(getDb(), `${BASE}/${slug}/notes`), note || null);
}

// Save scouting note for a single list.
export async function saveListNote(slug: string, idx: number, note: string): Promise<void> {
  await authReady();
  await set(ref(getDb(), `${BASE}/${slug}/armies/${idx}/notes`), note || null);
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

// --- Archetype estimate bank ---
// An estimate is a statement about "my archetype vs theirs" — it belongs to
// the archetype, not to a roster slot. When a slot's chosen archetype is set,
// switched or cleared, the slot's estimate row is parked here (keyed by the
// archetype descriptor) and the new archetype's banked row is inherited.
// Lives NEXT TO the team node (not inside it) so subscribeToOpponents never
// sees it.
const BANK = `estimates/${TEAM_SLUG}-arketype-bank`;

export interface ArchetypeDescriptor {
  faction: string;
  detachments: string[];
  disposition: string | null;
}

// Stable identity: same faction + detachments + disposition = same archetype,
// regardless of who plays it or how the live clustering shifts.
export function archetypeId(d: ArchetypeDescriptor): string {
  return [d.faction, ...(d.detachments || []), d.disposition || "ukendt"]
    .join("--")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Bank cells are keyed "{teamSlug}|{theirIdx}".
export async function fetchArchetypeBank(
  id: string
): Promise<Record<string, EstimateCell>> {
  await authReady();
  const snap = await get(ref(getDb(), `${BANK}/${id}/cells`));
  return snap.val() || {};
}

// Every estimate cell in slot (row) armyIdx across the whole field.
export function snapshotSlotCells(
  opponents: OpponentMap,
  armyIdx: number
): Record<string, EstimateCell> {
  const cells: Record<string, EstimateCell> = {};
  for (const [slug, team] of Object.entries(opponents)) {
    (team.armies || []).forEach((_, j) => {
      const cell = team.estimates?.[`${armyIdx}_${j}`];
      if (cell) cells[`${slug}|${j}`] = cell;
    });
  }
  return cells;
}

// The whole move, in one call:
// - old archetype set → park the row's current state in its bank
// - new profile null → clear the row (unset)
// - first pick → existing row is ATTRIBUTED to the archetype (row wins,
//   bank fills the gaps)
// - switch → clear the row, inherit the new archetype's banked cells
// Cells for already-played opponents (lockedSlugs) are never rewritten, and
// banked cells whose team/list no longer exists are dropped.
export async function switchSlotArchetype(
  opponents: OpponentMap,
  armyIdx: number,
  oldProfile: ArchetypeDescriptor | null,
  newProfile: ArchetypeDescriptor | null,
  lockedSlugs: Set<string>
): Promise<{ parked: number; inherited: number }> {
  await authReady();
  const snapshot = snapshotSlotCells(opponents, armyIdx);
  const updates: Record<string, EstimateCell | null> = {};
  let inherited = 0;

  const writeCell = (key: string, value: EstimateCell | null): boolean => {
    const [slug, j] = key.split("|");
    if (lockedSlugs.has(slug)) return false;
    if (value !== null && !opponents[slug]?.armies?.[Number(j)]) return false;
    updates[`estimates/${TEAM_SLUG}/${slug}/estimates/${armyIdx}_${j}`] = value;
    return true;
  };

  if (oldProfile) {
    await set(ref(getDb(), `${BANK}/${archetypeId(oldProfile)}`), {
      descriptor: oldProfile,
      cells: snapshot,
      savedAt: Date.now(),
    });
  }

  if (newProfile === null) {
    if (oldProfile) {
      for (const key of Object.keys(snapshot)) writeCell(key, null);
    }
  } else if (!oldProfile) {
    const id = archetypeId(newProfile);
    const bank = await fetchArchetypeBank(id);
    for (const [key, cell] of Object.entries(bank)) {
      if (!snapshot[key] && writeCell(key, cell)) inherited++;
    }
    await set(ref(getDb(), `${BANK}/${id}`), {
      descriptor: newProfile,
      cells: { ...bank, ...snapshot },
      savedAt: Date.now(),
    });
  } else if (archetypeId(oldProfile) !== archetypeId(newProfile)) {
    const bank = await fetchArchetypeBank(archetypeId(newProfile));
    for (const key of Object.keys(snapshot)) writeCell(key, null);
    for (const [key, cell] of Object.entries(bank)) {
      if (writeCell(key, cell)) inherited++;
    }
  }

  if (Object.keys(updates).length) await update(ref(getDb()), updates);
  return { parked: Object.keys(snapshot).length, inherited };
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
// 75+ ⇒ "same list" for estimate purposes. Lowered from 80: on the real meta
// pool every 75-79% pair is the same faction+detachment with a different unit
// mix (Necrons Awakened, Salamanders Librarius, TSons Hexwarp variants) — true
// same-archetype merges, no cross-archetype false merges. Keeps a margin above
// 70 as the list pool grows.
export const SIMILARITY_THRESHOLD = 75;

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

// --- Archetype clustering ---
// Groups every list in the field into clusters of ≥threshold similarity, so a
// player estimates ~50 archetypes instead of ~400 individual lists.
export interface ClusterMember {
  teamSlug: string;
  teamName: string;
  tier: string;
  listIdx: number;
  list: OpponentList;
}

export interface ListCluster {
  rep: ClusterMember;
  members: ClusterMember[]; // includes rep
}

export function clusterLists(opponents: OpponentMap): ListCluster[] {
  const clusters: ListCluster[] = [];
  for (const [slug, team] of Object.entries(opponents)) {
    (team.armies || []).forEach((list, idx) => {
      const member: ClusterMember = {
        teamSlug: slug,
        teamName: team.name,
        tier: team.tier || "",
        listIdx: idx,
        list,
      };
      const home = clusters.find(
        (c) => listSimilarity(c.rep.list, list) >= SIMILARITY_THRESHOLD
      );
      if (home) home.members.push(member);
      else clusters.push({ rep: member, members: [member] });
    });
  }
  return clusters;
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
