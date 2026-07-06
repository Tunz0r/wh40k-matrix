import { ref, set, get, onValue, off, update } from "firebase/database";
import { getDb } from "./firebase";
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

export interface TournamentDoc {
  teamName: string;
  activeSessionId: string | null;
  currentRound: number;
  rounds: TournamentRound[];
  roster?: RosterExport | null;
  seedingTiers?: SeedingTier[];
}

export async function createTournament(
  slug: string,
  teamName: string,
  roster?: RosterExport
): Promise<void> {
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
  await update(ref(getDb(), `tournaments/${slug}`), data);
}

export async function setActiveSession(
  slug: string,
  sessionId: string,
  roundNumber: number,
  opponentName: string
): Promise<void> {
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
  });
}

export function subscribeToTournament(
  slug: string,
  callback: (data: TournamentDoc | null) => void
): () => void {
  const tournamentRef = ref(getDb(), `tournaments/${slug}`);
  onValue(tournamentRef, (snapshot) => {
    callback(snapshot.val());
  });
  return () => off(tournamentRef);
}
