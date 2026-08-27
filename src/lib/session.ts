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
  // Flags carried from the estimate cell at pairing (see estimates-db).
  volatile?: boolean; // swingy/bimodal — coaching starts it at 0 BP and flags it for follow-up
  tableDependent?: boolean; // outcome swings on the table — surfaced hard during pairing
  startDependent?: boolean; // outcome swings on who gets the first turn — surfaced during pairing
  aVP: number; // Team A total = sum(aPrim) + sum(aSec) once per-turn scoring is used
  bVP: number; // Team B total = sum(bPrim) + sum(bSec)
  // Per-battle-round score split into primary and secondary (index 0 = round 1),
  // one array each per team. Each category's running total (its sum across the
  // turns) is capped at SCORE_CAP (45), so a player's game total can't exceed 90.
  // Games scored before this existed (e.g. round 1) have no arrays and keep their
  // aVP/bVP totals as-is.
  aPrim?: number[];
  aSec?: number[];
  bPrim?: number[];
  bSec?: number[];
  // Coach's editable projected team-A BP for this game (0-20). Seeds from the
  // table-adjusted estimate, is overridden by hand as the game develops, and is
  // ignored once the game is final (the projection then equals the actual BP).
  projBP?: number;
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
  teamSize?: number; // players per team; drives the win margin (default 8)
  teamSlug?: string; // the tournament this session belongs to (dataSlug)
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
    onValue(
      sessionRef,
      (snapshot) => callback(snapshot.val()),
      // Permission denied (not a member of this session's team) -> null, not a hang.
      () => callback(null)
    );
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

// Max primary or secondary a player can score in one game (running total across
// all battle rounds). Total game score is therefore capped at 2×45 = 90.
export const SCORE_CAP = 45;

// Per-turn scoring: write the four per-battle-round arrays (primary/secondary ×
// two teams) and keep the game totals aVP/bVP equal to their sums, in one atomic
// multi-path update so breakdown and totals never diverge. Each array is padded
// to 5 dense non-negative ints (never a sparse Firebase object) and its running
// sum is clamped to SCORE_CAP — the cap is enforced here, not just in the UI.
export async function updateMatchupScores(
  sessionId: string,
  matchupIndex: number,
  aPrim: number[],
  aSec: number[],
  bPrim: number[],
  bSec: number[]
): Promise<void> {
  await authReady();
  const capArr = (arr: number[]) => {
    let running = 0;
    return Array.from({ length: 5 }, (_, i) => {
      let v = Math.max(0, Math.floor(Number(arr[i]) || 0));
      if (running + v > SCORE_CAP) v = Math.max(0, SCORE_CAP - running);
      running += v;
      return v;
    });
  };
  const aP = capArr(aPrim);
  const aS = capArr(aSec);
  const bP = capArr(bPrim);
  const bS = capArr(bSec);
  const sum = (x: number[]) => x.reduce((s, v) => s + v, 0);
  const base = `sessions/${sessionId}/matchups/${matchupIndex}`;
  await update(ref(getDb()), {
    [`${base}/aPrim`]: aP,
    [`${base}/aSec`]: aS,
    [`${base}/bPrim`]: bP,
    [`${base}/bSec`]: bS,
    [`${base}/aVP`]: sum(aP) + sum(aS),
    [`${base}/bVP`]: sum(bP) + sum(bS),
  });
}

// Set the coach's projected team-A BP for a game (0-20). Clamped and rounded.
export async function updateMatchupProjection(
  sessionId: string,
  matchupIndex: number,
  projBP: number
): Promise<void> {
  await authReady();
  const v = Math.max(0, Math.min(20, Math.round(Number(projBP) || 0)));
  await set(ref(getDb(), `sessions/${sessionId}/matchups/${matchupIndex}/projBP`), v);
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
