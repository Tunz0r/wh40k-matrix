import type { Disposition } from "./data";

// Disposition-vs-disposition win rates from listhammer.info/stats (11th ed,
// trailing qualifying events, mirror matches excluded), read 2026-11-06. Cell =
// the ROW disposition's win rate (%) against the COLUMN disposition; the diagonal
// (mirror) is 50. Refresh from the same source as the meta shifts — the current
// load-bearing signal is Priority Assets crushing Disruption (58%), while the
// rest of the field sits within a point or two of even.
export const DISP_MATCHUP_WR: Record<Disposition, Record<Disposition, number>> = {
  "Take and Hold":   { "Take and Hold": 50, "Priority Assets": 48.2, "Reconnaissance": 50, "Purge the Foe": 50.1, "Disruption": 51.5 },
  "Priority Assets": { "Take and Hold": 51.8, "Priority Assets": 50, "Reconnaissance": 48.3, "Purge the Foe": 48.1, "Disruption": 58 },
  "Reconnaissance":  { "Take and Hold": 50, "Priority Assets": 51.8, "Reconnaissance": 50, "Purge the Foe": 49, "Disruption": 51.3 },
  "Purge the Foe":   { "Take and Hold": 49.9, "Priority Assets": 52, "Reconnaissance": 51, "Purge the Foe": 50, "Disruption": 49.3 },
  "Disruption":      { "Take and Hold": 48.5, "Priority Assets": 42, "Reconnaissance": 48.7, "Purge the Foe": 50.7, "Disruption": 50 },
};

// BP awarded per 1 percentage-point of win-rate edge, and the cap. Disposition is
// a minor factor next to the list matchup, so the swing is bounded to ±2 BP: the
// biggest edges (anything vs Disruption, ~+6%) move the estimate ±2, small ones
// (<~1.5%) round to 0.
export const DISP_BP_PER_PCT = 0.35;
export const DISP_BP_CAP = 2;

// Win-rate edge (percentage points above/below 50) of OUR disposition vs THEIRS.
// Accepts loose strings (forecast passes roster/archetype dispositions typed as
// plain string | null); unknown values fall through to 0.
export function dispositionEdgeWR(
  ours?: string | null,
  theirs?: string | null
): number {
  if (!ours || !theirs) return 0;
  const wr = DISP_MATCHUP_WR[ours as Disposition]?.[theirs as Disposition];
  return wr == null ? 0 : wr - 50;
}

// The edge converted to a bounded, signed BP nudge (−2…+2). Small edges round to 0.
export function dispositionEdgeBP(
  ours?: string | null,
  theirs?: string | null
): number {
  const bp = Math.round(dispositionEdgeWR(ours, theirs) * DISP_BP_PER_PCT);
  return Math.max(-DISP_BP_CAP, Math.min(DISP_BP_CAP, bp));
}
