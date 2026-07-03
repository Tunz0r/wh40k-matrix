import { ref, set, onValue, off, push } from "firebase/database";
import { getDb } from "./firebase";
import type { Disposition } from "./data";

export interface MatchupData {
  aFaction: string;
  aDetachments: string[];
  aDisposition: Disposition | null;
  bFaction: string;
  bDetachments: string[];
  bDisposition: Disposition | null;
  module: string;
  layoutPage: number | null;
  estimate: number; // VP differential estimate (positive = team A ahead)
  round: number; // current game round (1-5)
  notes: string;
  final: boolean; // true when game is done
}

export interface SessionData {
  teamAName: string;
  teamBName: string;
  createdAt: number;
  matchups: MatchupData[];
}

export async function createSession(data: SessionData): Promise<string> {
  const sessionsRef = ref(getDb(), "sessions");
  const newRef = push(sessionsRef);
  await set(newRef, data);
  return newRef.key!;
}

export function subscribeToSession(
  sessionId: string,
  callback: (data: SessionData | null) => void
): () => void {
  const sessionRef = ref(getDb(), `sessions/${sessionId}`);
  const unsub = onValue(sessionRef, (snapshot) => {
    callback(snapshot.val());
  });
  return () => off(sessionRef);
}

export async function updateMatchupEstimate(
  sessionId: string,
  matchupIndex: number,
  estimate: number
): Promise<void> {
  const matchupRef = ref(
    getDb(),
    `sessions/${sessionId}/matchups/${matchupIndex}/estimate`
  );
  await set(matchupRef, estimate);
}

export async function updateMatchupRound(
  sessionId: string,
  matchupIndex: number,
  round: number
): Promise<void> {
  const matchupRef = ref(
    getDb(),
    `sessions/${sessionId}/matchups/${matchupIndex}/round`
  );
  await set(matchupRef, round);
}

export async function updateMatchupNotes(
  sessionId: string,
  matchupIndex: number,
  notes: string
): Promise<void> {
  const matchupRef = ref(
    getDb(),
    `sessions/${sessionId}/matchups/${matchupIndex}/notes`
  );
  await set(matchupRef, notes);
}

export async function updateMatchupFinal(
  sessionId: string,
  matchupIndex: number,
  final: boolean
): Promise<void> {
  const matchupRef = ref(
    getDb(),
    `sessions/${sessionId}/matchups/${matchupIndex}/final`
  );
  await set(matchupRef, final);
}
