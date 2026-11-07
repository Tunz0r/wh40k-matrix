import { describe, it, expect } from "vitest";
import { shrunkForecast, matchupForecast } from "./forecast";
import type { OpponentMap, OpponentList } from "./estimates-db";

describe("shrunkForecast", () => {
  it("returns the base when there are no warmups", () => {
    expect(shrunkForecast(12, null)).toBe(12);
    expect(shrunkForecast(null, null)).toBe(null);
  });

  it("blends the base toward the warmup average by sample weight", () => {
    // base 10, prior 2; two on-archetype games averaging 16 (weight 2):
    // (10*2 + 32) / (2 + 2) = 13
    const w = { n: 2, onArchetype: 2, weight: 2, weightedActual: 32, avgActual: 16 };
    expect(shrunkForecast(10, w)).toBe(13);
  });

  it("uses the warmup average alone when there's no base", () => {
    const w = { n: 1, onArchetype: 1, weight: 1, weightedActual: 17, avgActual: 17 };
    expect(shrunkForecast(null, w)).toBe(17);
  });
});

describe("matchupForecast — disposition bias is opt-in", () => {
  const theirList: OpponentList = { faction: "Orks", detachments: [], disposition: "Disruption", units: [] };
  const opp: OpponentMap = {
    x: { name: "X", tier: "", armies: [theirList], estimates: { "0_0": { v: 12 } } },
  };
  const ours = { faction: "Adepta Sororitas", detachments: [], disposition: "Priority Assets" };

  it("is raw by default — no disposition edge folded in", () => {
    const f = matchupForecast(opp, undefined, 0, theirList, ours, "X");
    expect(f.base).toBe(12);
    expect(f.dispBP).toBe(0);
    expect(f.adjusted).toBe(12);
  });

  it("folds in the disposition edge when applyDispBias is true", () => {
    const f = matchupForecast(opp, undefined, 0, theirList, ours, "X", true);
    // Priority Assets vs Disruption = +2 BP (capped)
    expect(f.dispBP).toBe(2);
    expect(f.adjusted).toBe(14);
  });

  it("never sprouts a bias on an empty cell", () => {
    const empty: OpponentMap = { x: { name: "X", tier: "", armies: [theirList], estimates: {} } };
    const f = matchupForecast(empty, undefined, 0, theirList, ours, "X", true);
    expect(f.base).toBe(null);
    expect(f.dispBP).toBe(0);
    expect(f.adjusted).toBe(0);
  });
});
