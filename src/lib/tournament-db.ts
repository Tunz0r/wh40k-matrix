import { ref, set, get, onValue, off } from "firebase/database";
import { getDb } from "./firebase";

export type RoundStatus = "pairing" | "live" | "completed";

export interface TournamentRound {
  number: number;
  opponentName: string;
  sessionId: string | null;
  status: RoundStatus;
}

export interface TournamentDoc {
  teamName: string;
  activeSessionId: string | null;
  currentRound: number;
  rounds: TournamentRound[];
}

export async function createTournament(
  slug: string,
  teamName: string
): Promise<void> {
  const tournamentRef = ref(getDb(), `tournaments/${slug}`);
  await set(tournamentRef, {
    teamName,
    activeSessionId: null,
    currentRound: 0,
    rounds: [],
  });
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
  status: RoundStatus
): Promise<void> {
  const tournamentRef = ref(getDb(), `tournaments/${slug}`);
  const snapshot = await get(tournamentRef);
  const doc: TournamentDoc = snapshot.val();
  if (!doc) return;

  const rounds = (doc.rounds || []).slice();
  const existing = rounds.findIndex((r) => r.number === roundNumber);
  if (existing >= 0) {
    rounds[existing] = { ...rounds[existing], status };
  } else {
    rounds.push({ number: roundNumber, opponentName: "", sessionId: null, status });
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
  const teamName = doc?.teamName || "";
  await set(tournamentRef, {
    teamName,
    activeSessionId: null,
    currentRound: 0,
    rounds: [],
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
