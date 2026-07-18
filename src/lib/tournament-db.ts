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

  await set(tournamentRef, {
    ...doc,
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

  await set(tournamentRef, { ...doc, ...updates });
}

export async function resetTournamentDoc(slug: string): Promise<void> {
  await authReady();
  const tournamentRef = ref(getDb(), `tournaments/${slug}`);
  const snapshot = await get(tournamentRef);
  const doc: TournamentDoc | null = snapshot.val();
  await set(tournamentRef, {
    teamName: doc?.teamName || "",
    activeSessionId: null,
    currentRound: 0,
    rounds: [],
    roster: doc?.roster ?? null,
    seedingTiers: doc?.seedingTiers ?? null,
    eventDate: doc?.eventDate ?? null,
    warmups: doc?.warmups ?? null,
    profiles: doc?.profiles ?? null,
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
  await set(tournamentRef, {
    ...doc,
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

export function subscribeToTournament(
  slug: string,
  callback: (data: TournamentDoc | null) => void
): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  authReady().then(() => {
    if (cancelled) return;
    const tournamentRef = ref(getDb(), `tournaments/${slug}`);
    onValue(tournamentRef, (snapshot) => {
      callback(snapshot.val());
    });
    cleanup = () => off(tournamentRef);
  });
  return () => {
    cancelled = true;
    cleanup?.();
  };
}
