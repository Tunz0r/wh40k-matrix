import { TOTAL_ROUNDS } from "./team";

export interface ScoredRound {
  number: number;
  opponentName: string;
  score?: { us: number; them: number };
}

export interface Standings {
  played: number; // rounds with a recorded score
  wins: number;
  draws: number;
  losses: number;
  bpFor: number; // cumulative team BP scored
  bpAgainst: number;
  bpDiff: number;
  avgFor: number; // average team BP per played round
  roundsLeft: number;
  // Projected final cumulative BP if the current per-round average holds
  projectedFinal: number;
}

// 8-player WTC team game: 12+ BP differential = team win.
const WIN_MARGIN = 12;

export function computeStandings(rounds: ScoredRound[]): Standings {
  const scored = rounds.filter((r) => r.score);
  let wins = 0, draws = 0, losses = 0, bpFor = 0, bpAgainst = 0;
  for (const r of scored) {
    const { us, them } = r.score!;
    bpFor += us;
    bpAgainst += them;
    const diff = us - them;
    if (diff >= WIN_MARGIN) wins++;
    else if (diff <= -WIN_MARGIN) losses++;
    else draws++;
  }
  const played = scored.length;
  const avgFor = played ? bpFor / played : 0;
  const roundsLeft = Math.max(0, TOTAL_ROUNDS - played);
  return {
    played,
    wins,
    draws,
    losses,
    bpFor,
    bpAgainst,
    bpDiff: bpFor - bpAgainst,
    avgFor,
    roundsLeft,
    projectedFinal: Math.round(bpFor + avgFor * roundsLeft),
  };
}

// Average team BP per round needed over the remaining rounds to reach a target
// cumulative BP total.
export function paceToTarget(s: Standings, targetTotal: number): number | null {
  if (s.roundsLeft === 0) return null;
  return Math.max(0, (targetTotal - s.bpFor) / s.roundsLeft);
}
