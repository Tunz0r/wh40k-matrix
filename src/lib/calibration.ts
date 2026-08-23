"use client";

// Personal calibration: a person's estimate-vs-realised bias across EVERY event
// they've played. A person is a stable uid; their games are those on the roster
// slots they claimed in each team. Two sources: warmup games (Min side — the
// cleanest signal, carries the player's own estimate + actual) and finished
// tournament games (the pairing estimate + actual BP from the coaching session).
//
// bias = mean(actual − estimate): positive => you score MORE than you estimate
// (you under-rate the matchup), negative => you over-rate it.

import { fetchTournamentDoc } from "./tournament-db";
import { fetchSession } from "./session";
import { vpToBP } from "./scoring";
import type { TournamentMeta } from "./tournaments-registry";

export interface CalibGame {
  source: "warmup" | "tournament";
  event: string;
  date?: string;
  ownFaction?: string;
  oppFaction: string;
  oppDetachments: string[];
  oppDisposition: string | null;
  estimate: number;
  actual: number;
  delta: number; // actual − estimate
}

// Gather every finished, estimate-carrying game the user played across the given
// tournaments (their own — pass what subscribeToMyTournaments returns).
export async function gatherMyCalibration(
  uid: string,
  metas: TournamentMeta[]
): Promise<CalibGame[]> {
  const out: CalibGame[] = [];
  for (const meta of metas) {
    const doc = await fetchTournamentDoc(meta.dataSlug);
    if (!doc?.roster) continue;
    const myIdx = doc.roster.armies.findIndex((a) => a.claimedByUid === uid);
    if (myIdx < 0) continue;
    const myFaction = doc.roster.armies[myIdx]?.faction || "";

    // Warmup games logged on this slot.
    const wus = doc.warmups?.[`a${myIdx}`] || {};
    for (const g of Object.values(wus)) {
      if (g.estimate == null) continue;
      out.push({
        source: "warmup",
        event: meta.name,
        date: g.date,
        ownFaction: g.own?.faction ?? myFaction,
        oppFaction: g.faction,
        oppDetachments: g.detachments || [],
        oppDisposition: g.disposition ?? null,
        estimate: g.estimate,
        actual: g.actual,
        delta: g.actual - g.estimate,
      });
    }

    // Finished tournament games for this army (matched by faction in the session).
    if (myFaction) {
      const completed = (doc.rounds || []).filter((r) => r.status === "completed" && r.sessionId);
      for (const r of completed) {
        const s = await fetchSession(r.sessionId!);
        const m = (s?.matchups || []).find((x) => x.aFaction === myFaction && x.final);
        if (!m) continue;
        const est = m.estimate && m.estimate > 0 ? m.estimate : null;
        if (est == null) continue;
        const diff = (m.aVP ?? 0) - (m.bVP ?? 0);
        const bp = vpToBP(diff);
        const actual = diff >= 0 ? bp.winner : bp.loser;
        out.push({
          source: "tournament",
          event: meta.name,
          date: undefined,
          ownFaction: myFaction,
          oppFaction: m.bFaction,
          oppDetachments: m.bDetachments || [],
          oppDisposition: m.bDisposition ?? null,
          estimate: est,
          actual,
          delta: actual - est,
        });
      }
    }
  }
  return out;
}

export interface Bias {
  n: number;
  mean: number; // mean signed error (actual − estimate)
  abs: number; // mean absolute error (spread)
}

export function computeBias(games: CalibGame[]): Bias {
  const n = games.length;
  if (!n) return { n: 0, mean: 0, abs: 0 };
  const mean = games.reduce((s, g) => s + g.delta, 0) / n;
  const abs = games.reduce((s, g) => s + Math.abs(g.delta), 0) / n;
  return { n, mean, abs };
}

// Bucket games by a key, most-played first.
export function bucketBias(
  games: CalibGame[],
  key: (g: CalibGame) => string
): { key: string; bias: Bias }[] {
  const m = new Map<string, CalibGame[]>();
  for (const g of games) {
    const k = key(g);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(g);
  }
  return [...m]
    .map(([k, gs]) => ({ key: k, bias: computeBias(gs) }))
    .sort((a, b) => b.bias.n - a.bias.n || Math.abs(b.bias.mean) - Math.abs(a.bias.mean));
}

export const factionKey = (g: CalibGame) => g.oppFaction || "?";
export const archetypeKey = (g: CalibGame) =>
  `${g.oppFaction}${g.oppDetachments.length ? " — " + g.oppDetachments.join(", ") : ""}`;
