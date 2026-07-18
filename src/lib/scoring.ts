// VP differential → Battle Points table (from GW Teams Event Companion)
const BP_TABLE: [number, number, number][] = [
  [5, 10, 10],
  [10, 11, 9],
  [15, 12, 8],
  [20, 13, 7],
  [25, 14, 6],
  [30, 15, 5],
  [35, 16, 4],
  [40, 17, 3],
  [45, 18, 2],
  [50, 19, 1],
];

export function vpToBP(vpDiff: number): { winner: number; loser: number } {
  const absDiff = Math.abs(vpDiff);
  if (absDiff > 50) return { winner: 20, loser: 0 };
  for (const [threshold, winnerBP, loserBP] of BP_TABLE) {
    if (absDiff <= threshold) return { winner: winnerBP, loser: loserBP };
  }
  return { winner: 20, loser: 0 };
}

export function calculateTeamBP(
  estimates: { aVP: number; bVP: number }[]
): { teamABP: number; teamBBP: number } {
  let teamABP = 0;
  let teamBBP = 0;
  for (const est of estimates) {
    const diff = est.aVP - est.bVP;
    const bp = vpToBP(diff);
    if (diff >= 0) {
      teamABP += bp.winner;
      teamBBP += bp.loser;
    } else {
      teamABP += bp.loser;
      teamBBP += bp.winner;
    }
  }
  return { teamABP, teamBBP };
}

// Projected BP for one game, seen from team A: the actual result once final,
// the (table-adjusted) estimate before any score is entered, and a
// round-weighted blend in between — the deeper into the game, the more the
// live score counts over the estimate.
export function projectGame(m: {
  aVP?: number;
  bVP?: number;
  final?: boolean;
  round?: number;
  estimate: number;
  tableAdj?: number;
}): { a: number; b: number } {
  const aVP = m.aVP ?? 0;
  const bVP = m.bVP ?? 0;
  const diff = aVP - bVP;
  const bp = vpToBP(diff);
  const actualA = diff >= 0 ? bp.winner : bp.loser;
  if (m.final) return { a: actualA, b: 20 - actualA };
  const est =
    m.estimate > 0 ? Math.min(20, Math.max(0, m.estimate + (m.tableAdj ?? 0))) : 10;
  if (aVP === 0 && bVP === 0) return { a: est, b: 20 - est };
  const w = Math.min(1, (m.round ?? 1) / 5);
  const a = Math.round(actualA * w + est * (1 - w));
  return { a, b: 20 - a };
}

// A game's actual BP is a draw from a distribution around its expected value,
// not a fixed number — same lists, different dice/terrain/first-turn give
// different results. GAME_BP_SIGMA is the aleatoric spread on the 0-20 scale,
// anchored in the team's own warmup scatter (results land ~4-5 BP off the
// estimate on average → σ ≈ 5 for an unstarted game). As a game progresses the
// VP become known and the spread shrinks toward 0.
const GAME_BP_SIGMA = 5;

function randNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface WinProbability {
  win: number;
  draw: number;
  loss: number;
}

// Monte-Carlo the team result: each unfinished game is sampled from a normal
// around its projected BP (finished games are fixed). Team A wins when its BP
// lead reaches the win margin (12 of the 160 total across 8 games).
export function teamWinProbability(
  matchups: {
    aVP?: number;
    bVP?: number;
    final?: boolean;
    round?: number;
    estimate: number;
    tableAdj?: number;
  }[],
  samples = 3000
): WinProbability {
  const games = matchups.map((m) => {
    const mean = projectGame(m).a;
    const started = (m.aVP ?? 0) > 0 || (m.bVP ?? 0) > 0;
    const w = started ? Math.min(1, (m.round ?? 1) / 5) : 0;
    return { mean, sigma: m.final ? 0 : GAME_BP_SIGMA * (1 - w) };
  });
  const total = 20 * matchups.length;
  const margin = 12;
  let win = 0;
  let draw = 0;
  let loss = 0;
  for (let s = 0; s < samples; s++) {
    let teamA = 0;
    for (const g of games) {
      const a = g.sigma > 0 ? g.mean + g.sigma * randNormal() : g.mean;
      teamA += Math.max(0, Math.min(20, Math.round(a)));
    }
    const diff = 2 * teamA - total;
    if (diff >= margin) win++;
    else if (diff <= -margin) loss++;
    else draw++;
  }
  return { win: win / samples, draw: draw / samples, loss: loss / samples };
}

// 8-player teams need 12 BP differential for a win
export function teamResult(
  teamABP: number,
  teamBBP: number
): "A" | "B" | "draw" {
  const diff = teamABP - teamBBP;
  if (diff >= 12) return "A";
  if (diff <= -12) return "B";
  return "draw";
}
