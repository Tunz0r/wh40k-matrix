import { ref, set, get, onValue, off, update, push, remove } from "firebase/database";
import { getDb, authReady } from "./firebase";
import type { RosterExport } from "./roster";

export type RoundStatus = "pairing" | "live" | "completed";

export interface TournamentRound {
  number: number;
  opponentName: string;
  sessionId: string | null;
  status: RoundStatus;
  // Final team BP score, recorded when the round is completed from coaching
  score?: { us: number; them: number };
}

export interface SeedingTier {
  name: string;
  teams: string[];
}

// A logged practice game vs an archetype, for pre-WTC calibration.
export interface WarmupGame {
  date: string; // YYYY-MM-DD
  faction: string;
  detachments: string[];
  disposition: string | null;
  // The player's OWN archetype at log time (their profile snapshot) — a game
  // is "my archetype vs theirs", and the player may switch archetype later.
  own?: { faction: string; detachments: string[]; disposition: string | null } | null;
  estimate: number | null; // our estimate at log time (0-20 BP scale)
  actual: number; // actual result in BP (0-20)
  notes?: string;
}

// Keyed "a0".."a7" per army index (prefixed so Firebase never coerces the
// node into an array), then push-id → game.
export type WarmupsNode = Record<string, Record<string, WarmupGame>>;

// A player's own army mapped to a field archetype ("Min profil"). The
// archetype descriptor comes from a cluster in the estimates field, so the
// sanity checks can find the matching cluster live; `units` is the player's
// own pasted list when available (better similarity matching).
export interface PlayerProfile {
  faction: string;
  detachments: string[];
  disposition: string | null;
  units?: string[];
}

// Keyed "a0".."a7" per army index.
export type ProfilesNode = Record<string, PlayerProfile>;

export interface TournamentDoc {
  teamName: string;
  activeSessionId: string | null;
  currentRound: number;
  rounds: TournamentRound[];
  roster?: RosterExport | null;
  seedingTiers?: SeedingTier[];
  eventDate?: string | null; // ISO date of the tournament, for the readiness countdown
  warmups?: WarmupsNode; // prep-game history, survives tournament resets
  profiles?: ProfilesNode; // players' own archetypes, survives tournament resets
  _join?: { open?: boolean }; // owner-controlled onboarding window (Phase 2 self-claim)
}

// Patch tournament-level settings (event date etc.) without touching rounds.
export async function saveTournamentSettings(
  slug: string,
  data: Partial<Pick<TournamentDoc, "eventDate">>
): Promise<void> {
  await authReady();
  await update(ref(getDb(), `tournaments/${slug}`), data);
}

export async function createTournament(
  slug: string,
  teamName: string,
  roster?: RosterExport
): Promise<void> {
  await authReady();
  const tournamentRef = ref(getDb(), `tournaments/${slug}`);
  await set(tournamentRef, {
    teamName,
    activeSessionId: null,
    currentRound: 0,
    rounds: [],
    roster: roster ?? null,
  });
}

// Patch team setup fields without touching round state.
export async function saveTeamSetup(
  slug: string,
  data: Partial<Pick<TournamentDoc, "teamName" | "roster" | "seedingTiers">>
): Promise<void> {
  await authReady();
  await update(ref(getDb(), `tournaments/${slug}`), data);
}

export async function setActiveSession(
  slug: string,
  sessionId: string,
  roundNumber: number,
  opponentName: string
): Promise<void> {
  await authReady();
  const tournamentRef = ref(getDb(), `tournaments/${slug}`);
  const snapshot = await get(tournamentRef);
  const doc: TournamentDoc = snapshot.val() || {
    teamName: "",
    activeSessionId: null,
    currentRound: 0,
    rounds: [],
  };

  const rounds = (doc.rounds || []).map((r) =>
    r.status === "live" ? { ...r, status: "completed" as RoundStatus } : r
  );

  const existing = rounds.findIndex((r) => r.number === roundNumber);
  if (existing >= 0) {
    rounds[existing] = { number: roundNumber, opponentName, sessionId, status: "live" };
  } else {
    rounds.push({ number: roundNumber, opponentName, sessionId, status: "live" });
  }

  // Patch only round fields (not the whole doc) so coaching stays writable by
  // members under the per-child SoD rules — roster/profiles are admin/owner-only.
  await update(tournamentRef, {
    activeSessionId: sessionId,
    currentRound: roundNumber,
    rounds,
  });
}

export async function updateRoundStatus(
  slug: string,
  roundNumber: number,
  status: RoundStatus,
  score?: { us: number; them: number }
): Promise<void> {
  await authReady();
  const tournamentRef = ref(getDb(), `tournaments/${slug}`);
  const snapshot = await get(tournamentRef);
  const doc: TournamentDoc = snapshot.val();
  if (!doc) return;

  const rounds = (doc.rounds || []).slice();
  const existing = rounds.findIndex((r) => r.number === roundNumber);
  if (existing >= 0) {
    rounds[existing] = { ...rounds[existing], status, ...(score ? { score } : {}) };
  } else {
    rounds.push({ number: roundNumber, opponentName: "", sessionId: null, status, ...(score ? { score } : {}) });
  }

  const updates: Partial<TournamentDoc> = { rounds };
  if (status === "completed" && doc.activeSessionId) {
    const activeRound = rounds.find((r) => r.sessionId === doc.activeSessionId);
    if (activeRound && activeRound.number === roundNumber) {
      updates.activeSessionId = null;
    }
  }

  // Patch only round fields so the coaching flow stays member-writable (SoD).
  await update(tournamentRef, updates);
}

export async function resetTournamentDoc(slug: string): Promise<void> {
  await authReady();
  // Clear only round state; roster/seeding/eventDate/warmups/profiles are left
  // untouched (a partial update preserves them and stays member-writable / SoD).
  await update(ref(getDb(), `tournaments/${slug}`), {
    activeSessionId: null,
    currentRound: 0,
    rounds: [],
  });
}

// Reset a single round: removes just that round from the doc (detaching the
// active session if it belonged to it) — every other round's history is kept.
// The coaching session itself is not deleted, so the record survives in
// Firebase even after the round is redone.
export async function resetRound(slug: string, roundNumber: number): Promise<void> {
  await authReady();
  const tournamentRef = ref(getDb(), `tournaments/${slug}`);
  const snapshot = await get(tournamentRef);
  const doc: TournamentDoc | null = snapshot.val();
  if (!doc) return;
  const removed = (doc.rounds || []).find((r) => r.number === roundNumber);
  const rounds = (doc.rounds || []).filter((r) => r.number !== roundNumber);
  const activeSessionId =
    removed?.sessionId && doc.activeSessionId === removed.sessionId
      ? null
      : doc.activeSessionId ?? null;
  // Patch only round fields (SoD: roster/profiles are admin/owner-only).
  await update(tournamentRef, {
    rounds,
    activeSessionId,
    currentRound: rounds.reduce((m, r) => Math.max(m, r.number), 0),
  });
}

// --- Warmup games (pre-WTC prep, per army) ---
// Stored under the tournament doc because the DB rules only open the
// sessions/tournaments/estimates nodes.

export async function addWarmupGame(
  slug: string,
  armyIdx: number,
  game: WarmupGame
): Promise<void> {
  await authReady();
  const newRef = push(ref(getDb(), `tournaments/${slug}/warmups/a${armyIdx}`));
  await set(newRef, game);
}

// Set or clear a player's own archetype profile.
export async function savePlayerProfile(
  slug: string,
  armyIdx: number,
  profile: PlayerProfile | null
): Promise<void> {
  await authReady();
  await set(ref(getDb(), `tournaments/${slug}/profiles/a${armyIdx}`), profile);
}

export async function deleteWarmupGame(
  slug: string,
  armyIdx: number,
  id: string
): Promise<void> {
  await authReady();
  await remove(ref(getDb(), `tournaments/${slug}/warmups/a${armyIdx}/${id}`));
}

// --- Join window + slot claiming (Phase 2 self-service onboarding) ---

// Owner toggles the onboarding window. While open, invited teammates can read
// the roster and claim an unclaimed slot themselves.
export async function setJoinOpen(slug: string, open: boolean): Promise<void> {
  await authReady();
  await set(ref(getDb(), `tournaments/${slug}/_join/open`), open ? true : null);
}

// A teammate self-claims a roster slot AND admits themselves — no captain
// action needed. One atomic write: the slot's claimedByUid, plus the two
// self-writable access markers (`_myTournaments` so the app lets them in, and
// `_claimants` so the tightened rules grant them read/estimate access). The
// captain's later recompute folds them into full membership (incl. profile
// SoD), but they're in immediately. Rules gate every path (unclaimed slot,
// self, join open). `slug` doubles as the tournament id (new tournaments have
// id === dataSlug).
export async function claimSlot(slug: string, armyIdx: number, uid: string): Promise<void> {
  await authReady();
  await update(ref(getDb()), {
    [`tournaments/${slug}/roster/armies/${armyIdx}/claimedByUid`]: uid,
    [`tournaments/_myTournaments/${uid}/${slug}`]: true,
    [`tournaments/_claimants/${slug}/${uid}`]: true,
  });
}

// Set the display name on a slot. A claimer may set their own name on the slot
// they've just claimed (rules allow it once claimedByUid is theirs); owners can
// set any slot's name.
export async function setSlotName(slug: string, armyIdx: number, name: string): Promise<void> {
  await authReady();
  await set(ref(getDb(), `tournaments/${slug}/roster/armies/${armyIdx}/player`), name);
}

// A player sets the army on THEIR OWN claimed seat (faction/detachments/
// disposition) — "pick your army" on Min side. Rules allow the seat's claimant
// (and owner/admin) to write it. Preserves player/claimedByUid (partial update).
export async function setSlotArmy(
  slug: string,
  armyIdx: number,
  army: { faction: string; detachments: string[]; disposition: string | null }
): Promise<void> {
  await authReady();
  await update(ref(getDb(), `tournaments/${slug}/roster/armies/${armyIdx}`), {
    faction: army.faction,
    detachments: army.detachments,
    disposition: army.disposition,
  });
}

// Owner/admin frees a slot (un-claim / kick).
export async function releaseSlot(slug: string, armyIdx: number): Promise<void> {
  await authReady();
  await set(ref(getDb(), `tournaments/${slug}/roster/armies/${armyIdx}/claimedByUid`), null);
}

// Owner/admin assigns an existing user (uid) to a slot and labels it with their
// name — for carrying known people onto a new team without an invite round-trip.
export async function assignSlot(
  slug: string,
  armyIdx: number,
  uid: string,
  name: string
): Promise<void> {
  await authReady();
  await update(ref(getDb(), `tournaments/${slug}/roster/armies/${armyIdx}`), {
    claimedByUid: uid,
    player: name,
  });
}

// Roster-only subscription — readable by members/owners always, and by anyone
// while the join window is open (so a joiner can pick a slot without seeing the
// rest of the tournament's data).
export function subscribeToRoster(
  slug: string,
  callback: (roster: RosterExport | null) => void
): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  authReady().then(() => {
    if (cancelled) return;
    const r = ref(getDb(), `tournaments/${slug}/roster`);
    onValue(
      r,
      (snap) => callback((snap.val() as RosterExport | null) || null),
      () => callback(null)
    );
    cleanup = () => off(r);
  });
  return () => {
    cancelled = true;
    cleanup?.();
  };
}

export function subscribeToTournament(
  slug: string,
  callback: (data: TournamentDoc | null) => void
): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  authReady().then(() => {
    if (cancelled) return;
    const tournamentRef = ref(getDb(), `tournaments/${slug}`);
    onValue(
      tournamentRef,
      (snapshot) => callback(snapshot.val()),
      // Permission denied (not a member of this camp) -> resolve to null so the
      // UI shows "no access" instead of hanging. Hard per-team isolation.
      () => callback(null)
    );
    cleanup = () => off(tournamentRef);
  });
  return () => {
    cancelled = true;
    cleanup?.();
  };
}
