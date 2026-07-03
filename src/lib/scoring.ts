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
