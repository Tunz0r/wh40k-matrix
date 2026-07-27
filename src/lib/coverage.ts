import type { ListCluster } from "./estimates-db";

export const ANSWER = 12;

const popcount = (x: number) => {
  let c = 0;
  while (x) { c += x & 1; x >>= 1; }
  return c;
};

const clusterKey = (c: ListCluster) => `${c.rep.teamSlug}_${c.rep.listIdx}`;

export interface CoverageResult {
  contested: Set<string>; // cluster keys whose ≥2 coverage is fake (see below)
  armyLoad: number[]; // per army: distinct factions it answers ≥ ANSWER
  factionCount: number;
}

// Real-coverage analysis, faction-once aware. `maskOf(clusterIdx)` returns a
// bitmask of the armies that answer that cluster ≥ ANSWER (the caller decides how
// the estimate is computed — raw, warmup-adjusted, etc.).
//
// An archetype's "≥2 covered" is FAKE (contested) when each of its answer armies
// is also the SOLE answer to a distinct OTHER faction: the opponent can bring
// those, we must spend our armies there, and this archetype is left uncovered
// despite looking covered. Detected by bipartite saturation of its answer armies
// against sole-dependent factions.
export function computeCoverage(
  clusters: ListCluster[],
  armyCount: number,
  maskOf: (clusterIdx: number) => number
): CoverageResult {
  const A = armyCount;
  const soleFac: Set<string>[] = Array.from({ length: A }, () => new Set());
  const armyFac: Set<string>[] = Array.from({ length: A }, () => new Set());
  clusters.forEach((c, ci) => {
    const m = maskOf(ci);
    if (!m) return;
    const f = c.rep.list.faction;
    for (let i = 0; i < A; i++) if (m & (1 << i)) armyFac[i].add(f);
    if ((m & (m - 1)) === 0) soleFac[31 - Math.clz32(m)].add(f); // single-bit mask
  });

  const contested = new Set<string>();
  clusters.forEach((c, ci) => {
    const AX = maskOf(ci);
    if (popcount(AX) < 2) return;
    const fx = c.rep.list.faction;
    const armyBits: number[] = [];
    for (let i = 0; i < A; i++) if (AX & (1 << i)) armyBits.push(i);
    const assign = new Map<string, number>(); // sole-dependent faction → army bit index
    const tryClaim = (bi: number, seen: Set<string>): boolean => {
      for (const f of soleFac[armyBits[bi]]) {
        if (f === fx || seen.has(f)) continue;
        seen.add(f);
        const cur = assign.get(f);
        if (cur === undefined || tryClaim(cur, seen)) { assign.set(f, bi); return true; }
      }
      return false;
    };
    let claimed = 0;
    for (let bi = 0; bi < armyBits.length; bi++) if (tryClaim(bi, new Set())) claimed++;
    if (claimed === armyBits.length) contested.add(clusterKey(c));
  });

  return {
    contested,
    armyLoad: armyFac.map((s) => s.size),
    factionCount: new Set(clusters.map((c) => c.rep.list.faction)).size,
  };
}
