import {
  type OpponentMap,
  type OpponentList,
  listSimilarity,
  lookupEstimate,
  SIMILARITY_THRESHOLD,
} from "./estimates-db";
import type { WarmupsNode } from "./tournament-db";

export interface MatchupForecast {
  base: number | null; // library estimate (raw), before any warmup adjustment
  adjusted: number; // forecast after archetype-specific warmup correction
  n: number; // warmup games this army has vs THIS archetype (0 = no data)
  avgActual: number | null; // avg actual BP in those games
}

export interface ArchetypeWarmup {
  n: number;
  avgActual: number;
}

// The library estimate counts as this many "pseudo-games" of prior belief, so a
// single warmup nudges the number while several games move it most of the way to
// the measured average. Shrinkage keeps one blowout/loss from dominating a
// pairing decision; raise it to trust warmups less, lower it to trust them more.
export const WARMUP_PRIOR = 2;

// Blend a base estimate with archetype-specific warmup results, weighted by game
// count: (base·prior + Σactual) / (prior + n). With no games the base stands; with
// no base the warmup average is all we have.
export function shrunkForecast(base: number | null, w: ArchetypeWarmup | null): number | null {
  if (!w) return base;
  if (base === null) return Math.max(0, Math.min(20, Math.round(w.avgActual)));
  const blended = (base * WARMUP_PRIOR + w.avgActual * w.n) / (WARMUP_PRIOR + w.n);
  return Math.max(0, Math.min(20, Math.round(blended)));
}

// Warmup games army `ourIdx` has played against the archetype `theirList`
// resembles (faction + detachments + disposition, ≥ threshold). Returns the count
// and average actual result, or null when there are none. Kept separate from the
// base estimate so callers can pair it with whichever base they use (the country
// matrix uses lookupEstimate; /meta uses its cluster estimate).
export function archetypeWarmupStats(
  warmups: WarmupsNode | undefined,
  ourIdx: number,
  theirList: OpponentList
): ArchetypeWarmup | null {
  const node = warmups?.[`a${ourIdx}`];
  if (!node) return null;
  const games = Object.values(node).filter(
    (g) =>
      listSimilarity(
        {
          faction: g.faction,
          detachments: g.detachments || [],
          disposition: (g.disposition ?? null) as OpponentList["disposition"],
        },
        theirList
      ) >= SIMILARITY_THRESHOLD
  );
  if (!games.length) return null;
  return { n: games.length, avgActual: games.reduce((s, g) => s + g.actual, 0) / games.length };
}

// Archetype-specific warmup forecast for one matchup: how army `ourIdx` has
// actually fared in warmup games against the archetype `theirList` resembles.
//
// Unlike a blanket per-player/team bias added to every estimate, this only shifts
// the number when we have games against THIS specific archetype — otherwise the
// raw library estimate stands untouched. Where games exist the forecast moves to
// the observed average result (estimate + measured bias), which is exactly the
// "how has this list historically done vs this build" signal you want when
// pairing a specific game. Warmup games carry only archetype metadata (no unit
// list), so matching is faction + detachments + disposition via listSimilarity.
export function matchupForecast(
  opponents: OpponentMap,
  warmups: WarmupsNode | undefined,
  ourIdx: number,
  theirList: OpponentList,
  opponentName?: string | null
): MatchupForecast {
  const base = lookupEstimate(opponents, opponentName ?? null, ourIdx, theirList);
  const w = archetypeWarmupStats(warmups, ourIdx, theirList);
  if (!w) return { base, adjusted: base ?? 0, n: 0, avgActual: null };
  return { base, adjusted: shrunkForecast(base, w) ?? base ?? 0, n: w.n, avgActual: w.avgActual };
}
