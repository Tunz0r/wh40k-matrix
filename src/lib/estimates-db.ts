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
  wtc?: boolean; // true = a real WTC 2026 roster (loaded from the doc), vs a stale/placeholder team
  createdAt?: number; // for library sources: when the event/lists are from (freshness)
  optIn?: boolean; // per-tournament marker: this archetype is pulled into the tournament's view
}

export type OpponentMap = Record<string, OpponentTeam>;

const BASE = `estimates/${TEAM_SLUG}`;
// Per-tournament opponent-data root. Estimate pages pass the active tournament's
// dataSlug; everything else defaults to TEAM_SLUG (WTC 2026 / the legacy data).
// Phase 2a: reads are parameterized; writes still default to TEAM_SLUG (correct
// for WTC 2026, and new tournaments have no opponents to write to yet).
const baseFor = (slug: string = TEAM_SLUG) => `estimates/${slug}`;

// The shared archetype library: the `Meta …`-tier reference teams (and their
// estimates) live here, read by EVERY tournament, so estimating an archetype
// carries across tournaments. "_library" can't collide with a real tournament
// slug ("_" prefix). `LIB_SLUGS` mirrors its team keys so writes can route each
// cell to the library (shared) vs the per-tournament node — kept in sync by the
// _library subscription in subscribeToOpponents. Empty until the migration runs,
// so everything defaults to the per-tournament node (current behavior).
const LIBRARY = "estimates/_library";
let LIB_SLUGS = new Set<string>();
// Where a team's LISTS/notes live: the shared library for library archetypes
// (so the reference lists stay global), else the per-tournament node.
const listNodeForTeam = (teamSlug: string, tournamentSlug: string) =>
  LIB_SLUGS.has(teamSlug) ? LIBRARY : baseFor(tournamentSlug);
// Where a team's ESTIMATE CELLS live: ALWAYS the per-tournament node — an
// estimate is "my army (in THIS tournament) vs their list", so it must never be
// shared. For a library archetype this lands at estimates/{slug}/{archetype}/
// estimates, an estimates-only entry the read merge grafts onto the global lists.
const estNodeForTeam = (_teamSlug: string, tournamentSlug: string) => baseFor(tournamentSlug);

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

// `includeLibrary` (default true) merges the shared archetype library into the
// view — used where you MANAGE estimates (/estimates) or prep against archetypes.
// Pass false for the tournament-LOCAL field: the analysis pages (/meta, /sanity,
// /stats) that should reflect only THIS tournament's opponent countries, not the
// global reference library.
export function subscribeToOpponents(
  callback: (teams: OpponentMap) => void,
  slug: string = TEAM_SLUG,
  includeLibrary: boolean = true
): () => void {
  let cancelled = false;
  let offBase: (() => void) | null = null;
  let offLib: (() => void) | null = null;
  let baseTeams: OpponentMap = {};
  let libTeams: OpponentMap = {};
  let baseReady = false;
  let libReady = !includeLibrary; // when excluded, the library half is "ready" (empty)
  const emit = () => {
    if (!baseReady || !libReady) return; // wait for both to avoid a flash of half the field
    if (!includeLibrary) {
      // Tournament-local view: only real teams (country teams carry a `name`);
      // skip the estimates-only archetype entries that share this node.
      const local: OpponentMap = {};
      for (const [k, team] of Object.entries(baseTeams)) if (team && team.name) local[k] = team;
      callback(local);
      return;
    }
    const result: OpponentMap = {};
    // Library archetypes: LISTS come from the global _library; ESTIMATES come
    // from THIS tournament's own node (grafted on), so a fresh tournament starts
    // with an empty estimate slate. LEGACY FALLBACK: for the original team
    // (TEAM_SLUG), whose archetype estimates still live inside _library until
    // migrated out, merge those under the per-tournament ones — so nothing
    // disappears pre-migration and a partial write can't shadow the old values.
    // Other tournaments get NO fallback → true isolation.
    for (const [teamKey, libTeam] of Object.entries(libTeams)) {
      // The legacy team (WTC 2026) shows its whole curated library, EXCEPT the
      // WTC-2026 tier entries promoted from its own opponents — those would be
      // circular there. Other tournaments opt these in like anything else.
      if (slug === TEAM_SLUG && libTeam.wtc) continue;
      // Global catalog, OPT-IN per tournament: a library archetype only appears
      // if this tournament has pulled it in (a per-tournament entry exists —
      // an optIn marker or actual estimates). The legacy team (TEAM_SLUG) shows
      // all of the rest of its curated library for backward-compatibility.
      const optedIn = slug === TEAM_SLUG || baseTeams[teamKey] !== undefined;
      if (!optedIn) continue;
      const legacy = slug === TEAM_SLUG ? libTeam.estimates || {} : {};
      result[teamKey] = { ...libTeam, estimates: { ...legacy, ...(baseTeams[teamKey]?.estimates || {}) } };
    }
    // Country teams (real name/armies) from the per-tournament node.
    for (const [k, team] of Object.entries(baseTeams)) {
      if (team && team.name) result[k] = team;
    }
    callback(result);
  };
  authReady().then(() => {
    if (cancelled) return;
    const rb = ref(getDb(), baseFor(slug));
    onValue(rb, (snap) => { baseTeams = snap.val() || {}; baseReady = true; emit(); });
    offBase = () => off(rb);
    if (includeLibrary) {
      const rl = ref(getDb(), LIBRARY);
      onValue(rl, (snap) => {
        libTeams = (snap.val() as OpponentMap) || {};
        LIB_SLUGS = new Set(Object.keys(libTeams));
        libReady = true;
        emit();
      });
      offLib = () => off(rl);
    }
  });
  return () => {
    cancelled = true;
    offBase?.();
    offLib?.();
  };
}

// The shared archetype CATALOG (the _library teams), for the opt-in picker —
// every archetype, regardless of which tournaments have pulled it in.
export function subscribeToLibraryTeams(
  callback: (teams: OpponentMap) => void
): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  authReady().then(() => {
    if (cancelled) return;
    const r = ref(getDb(), LIBRARY);
    onValue(
      r,
      (snap) => callback((snap.val() as OpponentMap) || {}),
      () => callback({})
    );
    cleanup = () => off(r);
  });
  return () => {
    cancelled = true;
    cleanup?.();
  };
}

// Pull a catalog archetype INTO this tournament's estimate view (opt-in). Merges
// an `optIn` marker so an existing estimates object is preserved.
export async function optInArchetype(
  archetypeSlug: string,
  tournamentSlug: string = TEAM_SLUG
): Promise<void> {
  await authReady();
  await update(ref(getDb(), `${baseFor(tournamentSlug)}/${archetypeSlug}`), { optIn: true });
}

// Remove an archetype from this tournament (opt-out) — drops its per-tournament
// entry including any estimates the team made against it.
export async function optOutArchetype(
  archetypeSlug: string,
  tournamentSlug: string = TEAM_SLUG
): Promise<void> {
  await authReady();
  await remove(ref(getDb(), `${baseFor(tournamentSlug)}/${archetypeSlug}`));
}

// The full verbatim WTC lists (with wargear/enhancements/points) live in a
// sibling node, kept OUT of the opponents subscription because they're ~1MB and
// that stream loads on every estimates/stats/player page. Fetched on demand by
// the /lists reader. Returns { [armyIdx]: rawListText }.
export async function fetchRawLists(
  slug: string,
  tournamentSlug: string = TEAM_SLUG
): Promise<Record<string, string>> {
  await authReady();
  const snap = await get(ref(getDb(), `estimates/${tournamentSlug}-lists-raw/${slug}`));
  return (snap.val() as Record<string, string> | null) || {};
}

export async function saveOpponentTeam(
  slug: string,
  team: OpponentTeam,
  tournamentSlug: string = TEAM_SLUG
): Promise<void> {
  await authReady();
  await set(ref(getDb(), `${listNodeForTeam(slug, tournamentSlug)}/${slug}`), team);
}

export async function deleteOpponentTeam(
  slug: string,
  tournamentSlug: string = TEAM_SLUG
): Promise<void> {
  await authReady();
  await remove(ref(getDb(), `${listNodeForTeam(slug, tournamentSlug)}/${slug}`));
}

// Restore teams from a backup by writing each team individually. Teams present
// in the backup are overwritten; teams NOT in the backup are left untouched
// (never a blanket wipe), so restoring an old backup can't delete newer teams.
export async function restoreOpponents(
  map: OpponentMap,
  tournamentSlug: string = TEAM_SLUG
): Promise<number> {
  await authReady();
  const updates: Record<string, OpponentTeam> = {};
  for (const [slug, team] of Object.entries(map)) {
    if (team && team.name) updates[`${listNodeForTeam(slug, tournamentSlug)}/${slug}`] = team;
  }
  if (Object.keys(updates).length) await update(ref(getDb()), updates);
  return Object.keys(updates).length;
}

// Save scouting note for a whole team (patch, doesn't touch lists/estimates).
export async function saveTeamNote(
  slug: string,
  note: string,
  tournamentSlug: string = TEAM_SLUG
): Promise<void> {
  await authReady();
  await set(ref(getDb(), `${listNodeForTeam(slug, tournamentSlug)}/${slug}/notes`), note || null);
}

// Save scouting note for a single list.
export async function saveListNote(
  slug: string,
  idx: number,
  note: string,
  tournamentSlug: string = TEAM_SLUG
): Promise<void> {
  await authReady();
  await set(ref(getDb(), `${listNodeForTeam(slug, tournamentSlug)}/${slug}/armies/${idx}/notes`), note || null);
}

// Replace a single list on a team without touching the other seven or the estimates.
export async function updateOpponentList(
  slug: string,
  idx: number,
  list: OpponentList,
  tournamentSlug: string = TEAM_SLUG
): Promise<void> {
  await authReady();
  await set(ref(getDb(), `${listNodeForTeam(slug, tournamentSlug)}/${slug}/armies/${idx}`), list);
}

// Multi-path write of estimate cells. Keys are `${teamSlug}/${ourIdx}_${theirIdx}`;
// null deletes the cell.
export async function writeEstimateCells(
  cells: Record<string, EstimateCell | null>,
  tournamentSlug: string = TEAM_SLUG
): Promise<void> {
  await authReady();
  const updates: Record<string, EstimateCell | null> = {};
  for (const [key, value] of Object.entries(cells)) {
    const [teamSlug, cellKey] = key.split("/");
    updates[`${estNodeForTeam(teamSlug, tournamentSlug)}/${teamSlug}/estimates/${cellKey}`] = value;
  }
  await update(ref(getDb()), updates);
}

// Write ONE archetype's estimate for a given army across every list in the
// cluster — a quick, cluster-correct edit usable from anywhere (e.g. /sanity),
// mirroring the "archetype card" write on /estimates. The manual value lands on
// a durable anchor (a permanent meta-reference member — tier "Meta …" — if the
// cluster has one, so it survives country rebuilds; else the rep/first unlocked
// list); the other members become auto copies. Played opponents stay locked.
// `value: null` clears the whole cluster.
export async function writeClusterEstimate(opts: {
  ourIdx: number;
  cluster: ListCluster;
  value: number | null;
  currentVersion: string;
  playedSlugs?: Set<string>;
  tournamentSlug?: string;
}): Promise<void> {
  const { ourIdx, cluster, value, currentVersion, playedSlugs, tournamentSlug } = opts;
  const locked = (slug: string) => Boolean(playedSlugs?.has(slug));
  const unlocked = cluster.members.filter((m) => !locked(m.teamSlug));
  if (unlocked.length === 0) return;
  const anchor =
    unlocked.find((m) => /^meta/i.test(m.tier)) ??
    (!locked(cluster.rep.teamSlug) ? cluster.rep : unlocked[0]);
  const updates: Record<string, EstimateCell | null> = {};
  for (const m of unlocked) {
    updates[`${m.teamSlug}/${ourIdx}_${m.listIdx}`] =
      value === null
        ? null
        : stampVersion(m === anchor ? { v: value } : { v: value, auto: true }, currentVersion);
  }
  await writeEstimateCells(updates, tournamentSlug);
}

// Toggle the "needs testing" flag on existing estimate cells without touching
// their value/auto. Keys are `${teamSlug}/${ourIdx}_${theirIdx}`. Only writes
// the subfield, so cells that don't exist are left alone (nothing to flag).
export async function setNeedsTestCells(
  keys: string[],
  flag: boolean,
  tournamentSlug: string = TEAM_SLUG
): Promise<void> {
  await authReady();
  const updates: Record<string, true | null> = {};
  for (const key of keys) {
    const [teamSlug, cellKey] = key.split("/");
    updates[`${estNodeForTeam(teamSlug, tournamentSlug)}/${teamSlug}/estimates/${cellKey}/needsTest`] = flag ? true : null;
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

const versionsFor = (slug: string = TEAM_SLUG) => `estimates/${slug}-versioner`;

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
  callback: (versions: VersionsNode) => void,
  slug: string = TEAM_SLUG
): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  authReady().then(() => {
    if (cancelled) return;
    const r = ref(getDb(), versionsFor(slug));
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
export async function ensureVersions(slug: string = TEAM_SLUG): Promise<void> {
  await authReady();
  const r = ref(getDb(), versionsFor(slug));
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
export async function createVersion(label: string, slug: string = TEAM_SLUG): Promise<string> {
  await authReady();
  const id = versionId(label);
  if (!id) throw new Error("Tomt versionsnavn");
  await update(ref(getDb(), versionsFor(slug)), {
    current: id,
    [`list/${id}`]: { id, label, createdAt: Date.now() },
  });
  return id;
}

// Switch back to an existing version (e.g. undoing a version cut).
export async function setCurrentVersion(id: string, slug: string = TEAM_SLUG): Promise<void> {
  await authReady();
  await set(ref(getDb(), `${versionsFor(slug)}/current`), id);
}

// --- Sanity check-offs ---
// The /sanity page flags estimate conflicts by cross-checking the team's numbers.
// A flagged conflict can be a real, deliberate asymmetry the team has looked at
// and judged fine — so it can be "checked off" to clear it from the outstanding
// list. The check-off is keyed by a SIGNATURE that includes the conflicting
// values (see sanitySig on /sanity), so if any of those estimates later changes
// the conflict re-surfaces for a fresh look instead of staying silently
// dismissed. Lives next to the team node so subscribeToOpponents never streams it.
const sanityFor = (slug: string = TEAM_SLUG) => `estimates/${slug}-sanity-ok`;

export interface SanityAck {
  at: number; // when it was checked off
}
export type SanityAckMap = Record<string, SanityAck>;

export function subscribeToSanityAcks(
  callback: (acks: SanityAckMap) => void,
  slug: string = TEAM_SLUG
): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  authReady().then(() => {
    if (cancelled) return;
    const r = ref(getDb(), sanityFor(slug));
    onValue(r, (snap) => callback((snap.val() as SanityAckMap) || {}));
    cleanup = () => off(r);
  });
  return () => {
    cancelled = true;
    cleanup?.();
  };
}

// Check off (ok=true) or un-check (ok=false) a single conflict by signature.
export async function setSanityAck(sig: string, ok: boolean, slug: string = TEAM_SLUG): Promise<void> {
  await authReady();
  await set(ref(getDb(), `${sanityFor(slug)}/${sig}`), ok ? { at: Date.now() } : null);
}

// --- Archetype estimate bank ---
// An estimate is a statement about "my archetype vs theirs" — it belongs to
// the archetype, not to a roster slot. When a slot's chosen archetype is set,
// switched or cleared, the slot's estimate row is parked here (keyed by the
// archetype descriptor) and the new archetype's banked row is inherited.
// Lives NEXT TO the team node (not inside it) so subscribeToOpponents never
// sees it.
const bankFor = (slug: string = TEAM_SLUG) => `estimates/${slug}-arketype-bank`;

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
  id: string,
  slug: string = TEAM_SLUG
): Promise<Record<string, EstimateCell>> {
  await authReady();
  const snap = await get(ref(getDb(), `${bankFor(slug)}/${id}/cells`));
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
  lockedSlugs: Set<string>,
  tournamentSlug: string = TEAM_SLUG
): Promise<{ parked: number; inherited: number }> {
  await authReady();
  const snapshot = snapshotSlotCells(opponents, armyIdx);
  const updates: Record<string, EstimateCell | null> = {};
  let inherited = 0;

  const writeCell = (key: string, value: EstimateCell | null): boolean => {
    const [slug, j] = key.split("|");
    if (lockedSlugs.has(slug)) return false;
    if (value !== null && !opponents[slug]?.armies?.[Number(j)]) return false;
    updates[`${estNodeForTeam(slug, tournamentSlug)}/${slug}/estimates/${armyIdx}_${j}`] = value;
    return true;
  };

  if (oldProfile) {
    await set(ref(getDb(), `${bankFor(tournamentSlug)}/${archetypeId(oldProfile)}`), {
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
    const bank = await fetchArchetypeBank(id, tournamentSlug);
    for (const [key, cell] of Object.entries(bank)) {
      if (!snapshot[key] && writeCell(key, cell)) inherited++;
    }
    await set(ref(getDb(), `${bankFor(tournamentSlug)}/${id}`), {
      descriptor: newProfile,
      cells: { ...bank, ...snapshot },
      savedAt: Date.now(),
    });
  } else if (archetypeId(oldProfile) !== archetypeId(newProfile)) {
    const bank = await fetchArchetypeBank(archetypeId(newProfile), tournamentSlug);
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
  // The warmup library is a shared archetype team — write it wherever it lives
  // (the shared node once migrated, else the legacy per-team node).
  const node = listNodeForTeam(WARMUP_TEAM_SLUG, TEAM_SLUG);
  const teamRef = ref(getDb(), `${node}/${WARMUP_TEAM_SLUG}`);
  const snap = await get(teamRef);
  const team = snap.val() as OpponentTeam | null;
  if (!team) {
    await set(teamRef, { name: "Warmup Arketyper", tier: "Meta (Warmup)", armies: [list] });
    return 0;
  }
  const idx = (team.armies || []).length;
  await set(ref(getDb(), `${node}/${WARMUP_TEAM_SLUG}/armies/${idx}`), list);
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
  // Flatten every list into a member, preserving encounter order (the first
  // member of a cluster becomes its rep, so labels stay stable).
  const members: ClusterMember[] = [];
  for (const [slug, team] of Object.entries(opponents)) {
    (team.armies || []).forEach((list, idx) => {
      members.push({ teamSlug: slug, teamName: team.name, tier: team.tier || "", listIdx: idx, list });
    });
  }

  // Single-linkage clustering via union-find, gated on the DETACHMENT SET: two
  // lists merge only if they share the same faction, the same (order-independent)
  // set of detachments, AND are ≥ threshold similar. The detachment gate stops
  // cross-build chaining — units + a shared secondary detachment used to drag,
  // say, Votann Farseekers/Recon into the same cluster as Hearthguard/Priority,
  // producing 20-list mega-archetypes that blurred estimates and couldn't be
  // edited. Similarity still applies WITHIN a detachment set, so key-unit builds
  // (e.g. 1-C'tan vs 3-C'tan Necrons) stay distinct.
  const detKey = (l: OpponentList) =>
    [...(l.detachments || [])].map((d) => d.trim().toLowerCase()).sort().join("|");
  const keys = members.map((m) => detKey(m.list));
  const n = members.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // listSimilarity is 0 across factions; different detachment sets never merge.
      if (members[i].list.faction !== members[j].list.faction) continue;
      if (keys[i] !== keys[j]) continue;
      if (find(i) === find(j)) continue;
      if (listSimilarity(members[i].list, members[j].list) >= SIMILARITY_THRESHOLD) {
        parent[find(i)] = find(j);
      }
    }
  }

  // Group by root; rep = the lowest-index (first-encountered) member of each set.
  const byRoot = new Map<number, ListCluster>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const existing = byRoot.get(r);
    if (existing) existing.members.push(members[i]);
    else byRoot.set(r, { rep: members[i], members: [members[i]] });
  }
  return [...byRoot.values()];
}

// Best cluster for a loose list, matched against the closest MEMBER of each
// cluster — not just its representative. Single-linkage picks a low-index rep
// that can sit below the similarity threshold to a chained-in member, so a
// profile that IS a member (e.g. a Votann build merged into a wider Votann
// cluster) would otherwise read as "matches nothing". Used for profile→archetype
// resolution on /player and /sanity.
export function matchClusterByMember(
  clusters: ListCluster[],
  list: OpponentList
): ListCluster | null {
  let best: { c: ListCluster; sim: number } | null = null;
  for (const c of clusters) {
    let sim = 0;
    for (const m of c.members) {
      const s = listSimilarity(list, m.list);
      if (s > sim) sim = s;
    }
    if (sim >= SIMILARITY_THRESHOLD && (!best || sim > best.sim)) best = { c, sim };
  }
  return best?.c ?? null;
}

// Best current estimate for one of our armies vs an archetype cluster: a manual
// value wins over an auto one; falls back to any member's cell. Shared by /meta
// and the coverage analysis so "do we answer this archetype" is computed one way.
export function clusterEstimateValue(
  opponents: OpponentMap,
  cluster: ListCluster,
  ourIdx: number
): number | null {
  const cellFor = (m: ClusterMember): EstimateCell | undefined =>
    opponents[m.teamSlug]?.estimates?.[`${ourIdx}_${m.listIdx}`];
  const rep = cellFor(cluster.rep);
  const manual = cluster.members.map(cellFor).find((c) => c && !c.auto);
  const cell = (rep && !rep.auto ? rep : manual) ?? rep ?? cluster.members.map(cellFor).find(Boolean);
  return cell ? cell.v : null;
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
