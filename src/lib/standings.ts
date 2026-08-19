import { TOTAL_ROUNDS } from "./team";
import { DEFAULT_TEAM_SIZE, roundResult, teamPointsFor } from "./team-format";

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
  teamPoints: number; // WTC/Companion Team Points: win 3 / draw 2 / loss 1
  bpFor: number; // cumulative team BP scored
  bpAgainst: number;
  bpDiff: number;
  avgFor: number; // average team BP per played round
  roundsLeft: number;
  // Projected final cumulative BP if the current per-round average holds
  projectedFinal: number;
}

// Win/draw/loss uses the team-size margin (Companion table): 5-player +6,
// 8-player +12. `totalRounds` drives roundsLeft/projection (per tournament).
export function computeStandings(
  rounds: ScoredRound[],
  opts: { teamSize?: number; totalRounds?: number } = {}
): Standings {
  const teamSize = opts.teamSize ?? DEFAULT_TEAM_SIZE;
  const totalRounds = opts.totalRounds ?? TOTAL_ROUNDS;
  const scored = rounds.filter((r) => r.score);
  let wins = 0, draws = 0, losses = 0, teamPoints = 0, bpFor = 0, bpAgainst = 0;
  for (const r of scored) {
    const { us, them } = r.score!;
    bpFor += us;
    bpAgainst += them;
    const res = roundResult(us, them, teamSize);
    if (res === "win") wins++;
    else if (res === "loss") losses++;
    else draws++;
    teamPoints += teamPointsFor(res);
  }
  const played = scored.length;
  const avgFor = played ? bpFor / played : 0;
  const roundsLeft = Math.max(0, totalRounds - played);
  return {
    played,
    wins,
    draws,
    losses,
    teamPoints,
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
