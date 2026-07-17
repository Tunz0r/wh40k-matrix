import { ref, set, get, onValue, off, push, update } from "firebase/database";
import { getDb, authReady } from "./firebase";
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
  estimate: number; // pairing estimate (0-20 WTC scale), set when the matchup is created
  tableAdj?: number; // live per-game adjustment once the defender's table is known; effective = estimate + tableAdj
  aVP: number; // Team A victory points
  bVP: number; // Team B victory points
  round: number; // current game round (1-5)
  notes: string;
  final: boolean; // true when game is done
  startedAt?: number | null; // game clock: auto-set on the first score/round input
  finishedAt?: number | null; // set when marked final, freezing the duration
}

export interface SessionData {
  teamAName: string;
  teamBName: string;
  createdAt: number;
  matchups: MatchupData[];
  timerStartedAt?: number | null; // round clock, epoch ms (null = not started)
  timerMinutes?: number; // round length in minutes, default 180
}

export async function createSession(data: SessionData): Promise<string> {
  await authReady();
  const sessionsRef = ref(getDb(), "sessions");
  const newRef = push(sessionsRef);
  await set(newRef, data);
  return newRef.key!;
}

export async function fetchSession(sessionId: string): Promise<SessionData | null> {
  await authReady();
  const snapshot = await get(ref(getDb(), `sessions/${sessionId}`));
  return snapshot.val();
}

export function subscribeToSession(
  sessionId: string,
  callback: (data: SessionData | null) => void
): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  authReady().then(() => {
    if (cancelled) return;
    const sessionRef = ref(getDb(), `sessions/${sessionId}`);
    onValue(sessionRef, (snapshot) => {
      callback(snapshot.val());
    });
    cleanup = () => off(sessionRef);
  });
  return () => {
    cancelled = true;
    cleanup?.();
  };
}

export async function updateMatchupRound(
  sessionId: string,
  matchupIndex: number,
  round: number
): Promise<void> {
  await authReady();
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
  await authReady();
  const matchupRef = ref(
    getDb(),
    `sessions/${sessionId}/matchups/${matchupIndex}/notes`
  );
  await set(matchupRef, notes);
}

export async function updateMatchupVP(
  sessionId: string,
  matchupIndex: number,
  aVP: number,
  bVP: number
): Promise<void> {
  await authReady();
  const base = `sessions/${sessionId}/matchups/${matchupIndex}`;
  await Promise.all([
    set(ref(getDb(), `${base}/aVP`), aVP),
    set(ref(getDb(), `${base}/bVP`), bVP),
  ]);
}

export async function updateMatchupFinal(
  sessionId: string,
  matchupIndex: number,
  final: boolean
): Promise<void> {
  await authReady();
  const matchupRef = ref(
    getDb(),
    `sessions/${sessionId}/matchups/${matchupIndex}/final`
  );
  await set(matchupRef, final);
}

// Set or clear a single game's clock fields.
export async function updateMatchupClock(
  sessionId: string,
  matchupIndex: number,
  clock: { startedAt?: number | null; finishedAt?: number | null }
): Promise<void> {
  await authReady();
  const base = `sessions/${sessionId}/matchups/${matchupIndex}`;
  const updates: Record<string, unknown> = {};
  if (clock.startedAt !== undefined) updates[`${base}/startedAt`] = clock.startedAt;
  if (clock.finishedAt !== undefined) updates[`${base}/finishedAt`] = clock.finishedAt;
  await update(ref(getDb()), updates);
}

// Start (startedAt = now), stop (null) or reconfigure the shared round clock.
export async function setSessionTimer(
  sessionId: string,
  startedAt: number | null,
  minutes?: number
): Promise<void> {
  await authReady();
  const updates: Record<string, unknown> = {
    [`sessions/${sessionId}/timerStartedAt`]: startedAt,
  };
  if (minutes !== undefined) updates[`sessions/${sessionId}/timerMinutes`] = minutes;
  await update(ref(getDb()), updates);
}

// Firebase RTDB keeps pending writes in memory only — surface the connection
// state so a coach on venue wifi can see whether edits are actually syncing.
export function subscribeToConnection(
  callback: (online: boolean) => void
): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  authReady().then(() => {
    if (cancelled) return;
    const r = ref(getDb(), ".info/connected");
    onValue(r, (snap) => callback(!!snap.val()));
    cleanup = () => off(r);
  });
  return () => {
    cancelled = true;
    cleanup?.();
  };
}

export async function updateMatchupTableAdj(
  sessionId: string,
  matchupIndex: number,
  tableAdj: number
): Promise<void> {
  await authReady();
  const matchupRef = ref(
    getDb(),
    `sessions/${sessionId}/matchups/${matchupIndex}/tableAdj`
  );
  await set(matchupRef, tableAdj);
}
