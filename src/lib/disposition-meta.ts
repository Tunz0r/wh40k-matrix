import type { Disposition } from "./data";

// Disposition-vs-disposition win rates from listhammer.info/stats (11th ed,
// trailing 4 weeks of qualifying events, mirror matches excluded), read
// 2026-07-28. Cell = the ROW disposition's win rate (%) against the COLUMN
// disposition; the diagonal (mirror) is 50. Refresh from the same source as the
// meta shifts — Disruption being the field's punching bag is the load-bearing
// signal today.
export const DISP_MATCHUP_WR: Record<Disposition, Record<Disposition, number>> = {
  "Take and Hold":   { "Take and Hold": 50, "Priority Assets": 50.4, "Reconnaissance": 50.8, "Purge the Foe": 51.9, "Disruption": 55.6 },
  "Priority Assets": { "Take and Hold": 49.6, "Priority Assets": 50, "Reconnaissance": 50.6, "Purge the Foe": 52.1, "Disruption": 56.0 },
  "Reconnaissance":  { "Take and Hold": 49.2, "Priority Assets": 49.4, "Reconnaissance": 50, "Purge the Foe": 51.3, "Disruption": 53.9 },
  "Purge the Foe":   { "Take and Hold": 48.1, "Priority Assets": 47.9, "Reconnaissance": 48.7, "Purge the Foe": 50, "Disruption": 54.0 },
  "Disruption":      { "Take and Hold": 44.4, "Priority Assets": 44.0, "Reconnaissance": 46.2, "Purge the Foe": 46.1, "Disruption": 50 },
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
