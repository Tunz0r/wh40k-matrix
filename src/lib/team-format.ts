// Team-size rules, from the GW Warhammer 40,000 Teams Event Companion.
// The engine is parameterized on team size so the app can run 5-player events
// (Initial Skirmish + Main Engagement, +6 BP to win) as well as 8-player WTC
// (Skirmish ×2 + Main + Champion, +12 BP).

export type PairingModule = "skirmish" | "main" | "champion";

export const DEFAULT_TEAM_SIZE = 8;
export const SUPPORTED_TEAM_SIZES = [3, 4, 5, 6, 7, 8] as const;

// "Team Scoring" table: a team's total BP must exceed the opponent's by at least
// this margin to WIN; a smaller margin is a draw.
const WIN_MARGIN: Record<number, number> = { 3: 4, 4: 6, 5: 6, 6: 8, 7: 10, 8: 12 };
export function winMarginFor(teamSize: number): number {
  return WIN_MARGIN[teamSize] ?? WIN_MARGIN[DEFAULT_TEAM_SIZE];
}

// Games each pairing module resolves.
export const MODULE_GAMES: Record<PairingModule, number> = {
  skirmish: 2, // two defender match-ups; the refused attackers return to the pool
  main: 3, //     two defender match-ups + the two refused attackers play each other
  champion: 1, //  the single leftover player on each team
};

// "Pairing System": which modules a team size uses, in order. Skirmishes come
// first, then the Main Engagement, then a Champion game for even team sizes.
// The module games always sum to teamSize.
export function pairingPlanFor(teamSize: number): PairingModule[] {
  const skirmishes = Math.max(0, Math.floor((teamSize - 3) / 2));
  const hasChampion = teamSize % 2 === 0;
  return [
    ...(Array(skirmishes).fill("skirmish") as PairingModule[]),
    "main",
    ...(hasChampion ? (["champion"] as PairingModule[]) : []),
  ];
}

// Team Points awarded for a round result.
export function teamPointsFor(result: "win" | "draw" | "loss"): number {
  return result === "win" ? 3 : result === "draw" ? 2 : 1;
}

// Classify a round from the two teams' total BP, using the team-size margin.
export function roundResult(us: number, them: number, teamSize: number): "win" | "draw" | "loss" {
  const margin = winMarginFor(teamSize);
  const diff = us - them;
  if (diff >= margin) return "win";
  if (diff <= -margin) return "loss";
  return "draw";
}
