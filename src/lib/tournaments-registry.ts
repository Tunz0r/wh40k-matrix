// Tournament registry — the wrapper that turns the app from a single hardcoded
// tournament into a list of them. Each entry is metadata that points at where
// that tournament's data lives (`dataSlug`), so the existing single-tournament
// data (tournaments/team-denmark, estimates/team-denmark, …) can be wrapped as
// "WTC 2026" WITHOUT moving anything: its dataSlug stays "team-denmark".
//
// New tournaments get a fresh dataSlug (== their id). NOTE: the estimates layer
// (estimates-db BASE/VERSIONS/BANK/lists-raw) is still keyed to the legacy slug;
// isolating estimates per dataSlug is the next phase. For now WTC 2026 is fully
// wired and new tournaments share the estimate pool until that lands.

import { ref, set, get, update, onValue, off } from "firebase/database";
import { getDb, authReady, currentUser } from "./firebase";
import { TEAM_SLUG, TEAM_NAME } from "./team";

export type TournamentStatus = "upcoming" | "active" | "completed";

export interface TournamentMeta {
  id: string; // stable id used in the URL, e.g. "wtc-2026"
  name: string; // display name, e.g. "WTC 2026"
  dataSlug: string; // tournaments/{dataSlug} + estimates/{dataSlug} live here
  teamName: string; // our team for this tournament
  teamSize?: number; // players per team (5 or 8, …); drives roster/pairing/margins
  format?: string; // free text, e.g. "WTC · 7 runder"
  rounds?: number; // expected round count (drives finish/standings)
  startDate?: string | null; // ISO
  endDate?: string | null; // ISO
  status: TournamentStatus;
  createdAt: number;
}

// The registry lives under the write-allowed `tournaments` node (DB rules only
// open sessions/tournaments/estimates). "_registry" can't collide with a real
// tournament slug — slugs never start with "_".
const REGISTRY = "tournaments/_registry";

// The legacy single-tournament data, wrapped. dataSlug stays TEAM_SLUG so no
// data has to move; only the registry pointer is new.
export const WTC_2026: TournamentMeta = {
  id: "wtc-2026",
  name: "WTC 2026",
  dataSlug: TEAM_SLUG,
  teamName: TEAM_NAME,
  teamSize: 8,
  format: "WTC · 7 runder",
  rounds: 7,
  startDate: null,
  endDate: null,
  status: "completed",
  createdAt: 0, // sorts as the oldest tournament
};

// Seed WTC 2026 on first load if the registry doesn't have it yet. Idempotent
// and only writes the one pointer — never touches the underlying data.
export async function ensureRegistry(): Promise<void> {
  await authReady();
  const r = ref(getDb(), `${REGISTRY}/${WTC_2026.id}`);
  if (!(await get(r)).exists()) await set(r, WTC_2026);
}

export function subscribeToRegistry(
  callback: (tournaments: TournamentMeta[]) => void
): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  authReady().then(() => {
    if (cancelled) return;
    const r = ref(getDb(), REGISTRY);
    onValue(r, (snap) => {
      const val = (snap.val() as Record<string, TournamentMeta>) || {};
      // Newest first; the seeded WTC 2026 (createdAt 0) sorts last.
      callback(Object.values(val).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    });
    cleanup = () => off(r);
  });
  return () => {
    cancelled = true;
    cleanup?.();
  };
}

export async function getTournament(id: string): Promise<TournamentMeta | null> {
  await authReady();
  const snap = await get(ref(getDb(), `${REGISTRY}/${id}`));
  return snap.exists() ? (snap.val() as TournamentMeta) : null;
}

// Create a tournament. The signed-in user becomes its owner (captain) and it is
// added to their tournament index — all atomically so ownership + visibility
// exist the instant the registry entry does. Any signed-in user may create one.
export async function addTournament(
  meta: Omit<TournamentMeta, "createdAt">
): Promise<void> {
  await authReady();
  const uid = currentUser()?.uid;
  const entry = { ...meta, createdAt: Date.now() };
  const updates: Record<string, unknown> = {
    [`${REGISTRY}/${meta.id}`]: entry,
  };
  if (uid) {
    updates[`tournaments/_owners/${meta.dataSlug}/${uid}`] = true;
    updates[`tournaments/_myTournaments/${uid}/${meta.id}`] = true;
  }
  await update(ref(getDb()), updates);
}

export async function updateTournament(
  id: string,
  patch: Partial<TournamentMeta>
): Promise<void> {
  await authReady();
  await update(ref(getDb(), `${REGISTRY}/${id}`), patch);
}
