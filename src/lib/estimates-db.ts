import { ref, set, get, remove, onValue, off, update } from "firebase/database";
import { getDb, authReady } from "./firebase";
import { TEAM_SLUG } from "./team";
import type { RosterArmy } from "./roster";

// One estimate cell: our army (row) vs an opponent list (column).
// `auto` marks values propagated via list similarity — overridable, shown dimmed.
// `needsTest` flags the estimate as a guess we still want to playtest — an
// explicit low-confidence marker. Changing the value clears it (fresh judgment).
// `ver` is the estimate VERSION the value was set in (see below). Cells with no
// `ver` belong to the base version — that's every estimate made before
// versioning existed, so nothing had to be rewritten to introduce it.
export interface EstimateCell {
  v: number; // 0-20 WTC scale
  auto?: boolean;
  needsTest?: boolean;
  ver?: string;
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

// Toggle the "needs testing" flag on existing estimate cells without touching
// their value/auto. Keys are `${teamSlug}/${ourIdx}_${theirIdx}`. Only writes
// the subfield, so cells that don't exist are left alone (nothing to flag).
export async function setNeedsTestCells(
  keys: string[],
  flag: boolean
): Promise<void> {
  await authReady();
  const updates: Record<string, true | null> = {};
  for (const key of keys) {
    const [teamSlug, cellKey] = key.split("/");
    updates[`${BASE}/${teamSlug}/estimates/${cellKey}/needsTest`] = flag ? true : null;
  }
  await update(ref(getDb()), updates);
}

// --- Estimate versions ---
// An estimate is only true for one rules/meta era: a points update or dataslate
// can invalidate a whole column of judgments. So estimates carry the version
// they were made in, and the team can cut a new version when the meta moves —
// old values are KEPT and carried forward, just marked as belonging to the
// previous era so they can be re-confirmed rather than re-guessed from scratch.
//
// Lives next to the team node (like the bank) so subscribeToOpponents never
// sees it. Cutting a version writes ONLY this node — never the estimates.
export interface EstimateVersion {
  id: string;
  label: string;
  createdAt: number;
}

export interface VersionsNode {
  current: string;
  list: Record<string, EstimateVersion>;
}

const VERSIONS = `estimates/${TEAM_SLUG}-versioner`;

// The era every pre-existing estimate was made in: 11th edition, freshly out.
export const BASE_VERSION_ID = "11th-fresh";
export const BASE_VERSION_LABEL = "11th fresh";

const BASE_VERSIONS: VersionsNode = {
  current: BASE_VERSION_ID,
  list: {
    [BASE_VERSION_ID]: { id: BASE_VERSION_ID, label: BASE_VERSION_LABEL, createdAt: 0 },
  },
};

// A cell with no stamp is a base-version estimate.
export function versionOf(cell: EstimateCell | undefined): string {
  return cell?.ver ?? BASE_VERSION_ID;
}

// Stamp a cell being written with the version it's made in. Base-version cells
// stay unstamped, so the common case writes exactly the same shape as before.
export function stampVersion(cell: EstimateCell, versionId: string): EstimateCell {
  return versionId === BASE_VERSION_ID ? cell : { ...cell, ver: versionId };
}

export function subscribeToVersions(
  callback: (versions: VersionsNode) => void
): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  authReady().then(() => {
    if (cancelled) return;
    const r = ref(getDb(), VERSIONS);
    onValue(r, (snap) => callback((snap.val() as VersionsNode) || BASE_VERSIONS));
    cleanup = () => off(r);
  });
  return () => {
    cancelled = true;
    cleanup?.();
  };
}

// Write the base version node once, if the team has never had one. Never
// touches an existing node — a team that already cut versions keeps them.
export async function ensureVersions(): Promise<void> {
  await authReady();
  const r = ref(getDb(), VERSIONS);
  const snap = await get(r);
  if (!snap.exists()) await set(r, BASE_VERSIONS);
}

export function versionId(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Cut a new version and make it current. Estimates are untouched: they keep
// their old stamp and show up as carried over from the previous era.
export async function createVersion(label: string): Promise<string> {
  await authReady();
  const id = versionId(label);
  if (!id) throw new Error("Tomt versionsnavn");
  await update(ref(getDb(), VERSIONS), {
    current: id,
    [`list/${id}`]: { id, label, createdAt: Date.now() },
  });
  return id;
}

// Switch back to an existing version (e.g. undoing a version cut).
export async function setCurrentVersion(id: string): Promise<void> {
  await authReady();
  await set(ref(getDb(), `${VERSIONS}/current`), id);
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

// The permanent home for archetypes created ad hoc (e.g. a player's own list
// that matches nothing in the field): appended to the "Warmup Arketyper"
// meta-reference team, so manual estimates anchor there and survive country
// rebuilds. Appending never shifts existing list indices.
const WARMUP_TEAM_SLUG = "warmup-arketyper";

export async function appendListToMetaTeam(list: OpponentList): Promise<number> {
  await authReady();
  const teamRef = ref(getDb(), `${BASE}/${WARMUP_TEAM_SLUG}`);
  const snap = await get(teamRef);
  const team = snap.val() as OpponentTeam | null;
  if (!team) {
    await set(teamRef, { name: "Warmup Arketyper", tier: "Meta (Warmup)", armies: [list] });
    return 0;
  }
  const idx = (team.armies || []).length;
  await set(ref(getDb(), `${BASE}/${WARMUP_TEAM_SLUG}/armies/${idx}`), list);
  return idx;
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

// --- Faction-specific key units ---
// Some factions are defined by a small backbone of units: lists with matching
// counts of them play alike even if the support differs, and lists that differ
// in those counts play differently even if the support matches. Each key unit
// (a) collapses to a shared category token so different names in the same
// category are interchangeable (all C'tan → "§ctan"), and (b) is weighted
// heavily in the overlap so its COUNT dominates; a per-category count mismatch
// then subtracts an explicit penalty. Extend as more faction rules are found.
interface KeyCategory { token: string; re: RegExp; }
const FACTION_KEY_UNITS: Record<string, KeyCategory[]> = {
  "T'au Empire": [
    { token: "§riptide", re: /riptide/i },
    { token: "§stormsurge", re: /stormsurge/i },
    { token: "§broadside", re: /broadside/i },
  ],
  // All five C'tan datasheets read as one category — count is what matters.
  Necrons: [
    { token: "§ctan", re: /c['’]?tan|nightbringer|deceiver|void dragon|silent king|szarekh/i },
  ],
  "Chaos Space Marines": [{ token: "§defiler", re: /defiler/i }],
  "Emperor's Children": [{ token: "§defiler", re: /defiler/i }],
  "Thousand Sons": [{ token: "§defiler", re: /defiler/i }],
};
const KEY_UNIT_WEIGHT = 6; // a key unit counts as this many copies in the overlap
const KEY_MISMATCH_PENALTY = 7; // points lost per key-unit count difference

function expandForKeys(
  cats: KeyCategory[],
  units: string[]
): { tokens: string[]; counts: Map<string, number> } {
  const tokens: string[] = [];
  const counts = new Map<string, number>();
  for (const u of units) {
    const cat = cats.find((c) => c.re.test(u));
    if (cat) {
      counts.set(cat.token, (counts.get(cat.token) || 0) + 1);
      for (let k = 0; k < KEY_UNIT_WEIGHT; k++) tokens.push(cat.token);
    } else {
      tokens.push(u);
    }
  }
  return { tokens, counts };
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
    const cats = FACTION_KEY_UNITS[a.faction];
    if (cats) {
      const ea = expandForKeys(cats, aUnits);
      const eb = expandForKeys(cats, bUnits);
      let mismatch = 0;
      for (const c of cats) {
        mismatch += Math.abs((ea.counts.get(c.token) || 0) - (eb.counts.get(c.token) || 0));
      }
      const raw =
        30 +
        50 * unitOverlap(ea.tokens, eb.tokens) +
        15 * detScore +
        (sameDisp ? 5 : 0) -
        KEY_MISMATCH_PENALTY * mismatch;
      return Math.max(0, raw);
    }
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
