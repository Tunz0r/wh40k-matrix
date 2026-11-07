import { describe, it, expect } from "vitest";
import {
  dispositionEdgeWR,
  dispositionEdgeBP,
  DISP_MATCHUP_WR,
  DISP_BP_CAP,
} from "./disposition-meta";
import type { Disposition } from "./data";

describe("disposition matchup data", () => {
  const disps = Object.keys(DISP_MATCHUP_WR) as Disposition[];

  it("has a 50% mirror and complementary off-diagonals (~100)", () => {
    for (const a of disps) {
      expect(DISP_MATCHUP_WR[a][a]).toBe(50);
      for (const b of disps) {
        if (a === b) continue;
        // listhammer rounding means the pair sums to 100 ± ~0.1
        expect(DISP_MATCHUP_WR[a][b] + DISP_MATCHUP_WR[b][a]).toBeCloseTo(100, 0);
      }
    }
  });
});

describe("dispositionEdgeWR / dispositionEdgeBP", () => {
  it("edge is win-rate minus 50", () => {
    expect(dispositionEdgeWR("Priority Assets", "Disruption")).toBeCloseTo(8, 1); // 58
    expect(dispositionEdgeWR("Disruption", "Priority Assets")).toBeCloseTo(-8, 1); // 42
  });

  it("converts the edge to a bounded, signed BP nudge", () => {
    expect(dispositionEdgeBP("Priority Assets", "Disruption")).toBe(DISP_BP_CAP); // +2 (capped)
    expect(dispositionEdgeBP("Disruption", "Priority Assets")).toBe(-DISP_BP_CAP); // -2
  });

  it("rounds small edges to 0 and the mirror to 0", () => {
    expect(dispositionEdgeBP("Purge the Foe", "Reconnaissance")).toBe(0); // 51% -> 0.35 -> 0
    expect(dispositionEdgeBP("Take and Hold", "Take and Hold")).toBe(0);
  });

  it("falls through to 0 for unknown / missing dispositions", () => {
    expect(dispositionEdgeBP(null, "Disruption")).toBe(0);
    expect(dispositionEdgeBP("Priority Assets", null)).toBe(0);
    expect(dispositionEdgeBP("Nonsense", "Disruption")).toBe(0);
  });
});
