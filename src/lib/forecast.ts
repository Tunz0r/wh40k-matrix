import {
  type OpponentMap,
  type OpponentList,
  listSimilarity,
  lookupEstimate,
  SIMILARITY_THRESHOLD,
} from "./estimates-db";
import { dispositionEdgeBP } from "./disposition-meta";
import type { WarmupsNode } from "./tournament-db";

// A minimal archetype descriptor — our current roster army, or a warmup's own
// snapshot. Only faction/detachments/disposition are compared (no unit list).
export interface ArchetypeRef {
  faction: string;
  detachments: string[];
  disposition: string | null;
}

export interface MatchupForecast {
  base: number | null; // library estimate (raw), before any adjustment
  adjusted: number; // forecast after warmup correction AND disposition edge
  n: number; // warmup games ON our current archetype vs this opponent archetype
  avgActual: number | null; // weighted avg actual BP
  dispBP: number; // disposition-matchup edge (±2) folded into `adjusted`
}

export interface ArchetypeWarmup {
  n: number; // total warmup games vs the opponent archetype (any own list)
  onArchetype: number; // of those, how many were played on our CURRENT roster list
  weight: number; // effective sample weight (on-archetype games count 1, others less)
  weightedActual: number; // Σ(weight · actual) — divide by weight for the average
  avgActual: number; // weighted average actual result
}

// The library estimate counts as this many "pseudo-games" of prior belief, so a
// single warmup nudges the number while several games move it most of the way to
// the measured average. Shrinkage keeps one blowout/loss from dominating a
// pairing decision; raise it to trust warmups less, lower it to trust them more.
export const WARMUP_PRIOR = 2;

// Warmup games where the player piloted a DIFFERENT archetype than the one on the
// current roster count only this much: they reflect the player, not this list's
// matchup. On-archetype games count 1. Raise toward 1 to let other-list games
// speak more; 0 would ignore them entirely.
export const OFF_ARCHETYPE_WEIGHT = 0.25;

// Blend a base estimate with warmup results, weighted by effective sample size:
// (base·prior + Σ(weight·actual)) / (prior + Σweight). No games → base stands;
// no base → the warmup average is all we have.
export function shrunkForecast(base: number | null, w: ArchetypeWarmup | null): number | null {
  if (!w) return base;
  if (base === null) return Math.max(0, Math.min(20, Math.round(w.avgActual)));
  const blended = (base * WARMUP_PRIOR + w.weightedActual) / (WARMUP_PRIOR + w.weight);
  return Math.max(0, Math.min(20, Math.round(blended)));
}

const asRef = (
  a: { faction: string; detachments?: string[]; disposition?: string | null } | null | undefined
): { faction: string; detachments: string[]; disposition: OpponentList["disposition"] } | null =>
  a ? { faction: a.faction, detachments: a.detachments || [], disposition: (a.disposition ?? null) as OpponentList["disposition"] } : null;

// Warmup evidence for one matchup: army `ourIdx`'s games against the archetype
// `theirList` resembles, weighted by whether the game was played on `ourArchetype`
// — the list currently on the roster. A game piloting a different list tells us
// about the player's estimating, not how THIS list fares, so it's down-weighted
// (OFF_ARCHETYPE_WEIGHT) and, on its own, never moves the number: with an
// `ourArchetype` given and zero on-archetype games, this returns null (the raw
// estimate stands). When `ourArchetype` is omitted it falls back to counting all
// games equally. Kept separate from the base estimate so callers pair it with
// their own base (country matrix = lookupEstimate; /meta = cluster estimate).
export function archetypeWarmupStats(
  warmups: WarmupsNode | undefined,
  ourIdx: number,
  theirList: OpponentList,
  ourArchetype?: ArchetypeRef | null
): ArchetypeWarmup | null {
  const node = warmups?.[`a${ourIdx}`];
  if (!node) return null;
  const games = Object.values(node).filter(
    (g) => listSimilarity(asRef(g)!, theirList) >= SIMILARITY_THRESHOLD
  );
  if (!games.length) return null;

  const ownMatches = (g: (typeof games)[number]): boolean => {
    if (!ourArchetype) return true; // no current archetype known → count all (fallback)
    const own = asRef(g.own);
    return own ? listSimilarity(own, ourArchetype as OpponentList) >= SIMILARITY_THRESHOLD : false;
  };

  let onArchetype = 0,
    weight = 0,
    weightedActual = 0;
  for (const g of games) {
    const on = ownMatches(g);
    if (on) onArchetype++;
    const w = on ? 1 : OFF_ARCHETYPE_WEIGHT;
    weight += w;
    weightedActual += w * g.actual;
  }
  // With a current archetype known, other-list games alone don't move the number.
  if (ourArchetype && onArchetype === 0) return null;
  return { n: games.length, onArchetype, weight, weightedActual, avgActual: weightedActual / weight };
}

// Archetype-specific warmup forecast for one matchup: how army `ourIdx` — piloting
// the list it currently has on the roster — has actually fared against the
// archetype `theirList` resembles. Only shifts the number when we have relevant
// games; otherwise the raw library estimate stands. See archetypeWarmupStats.
export function matchupForecast(
  opponents: OpponentMap,
  warmups: WarmupsNode | undefined,
  ourIdx: number,
  theirList: OpponentList,
  ourArchetype?: ArchetypeRef | null,
  opponentName?: string | null
): MatchupForecast {
  const base = lookupEstimate(opponents, opponentName ?? null, ourIdx, theirList);
  const w = archetypeWarmupStats(warmups, ourIdx, theirList, ourArchetype);
  // Disposition-matchup edge (our disposition vs theirs), folded on top of the
  // warmup-corrected value. Only applied when there's actually an estimate to
  // adjust, so an empty cell doesn't sprout a phantom ±2.
  const dispBP = dispositionEdgeBP(ourArchetype?.disposition, theirList.disposition);
  const hasEstimate = base !== null || !!w;
  const warm = w ? (shrunkForecast(base, w) ?? base ?? 0) : (base ?? 0);
  const adjusted = hasEstimate ? Math.max(0, Math.min(20, warm + dispBP)) : 0;
  return { base, adjusted, n: w?.onArchetype ?? 0, avgActual: w?.avgActual ?? null, dispBP: hasEstimate ? dispBP : 0 };
}
