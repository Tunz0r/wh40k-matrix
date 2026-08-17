// Bridge: turn played tournament games into per-army "Min side" rows.
//
// For each of our armies, walk the completed rounds' coaching sessions, find the
// game that army played, and pair it with the estimate for that exact matchup —
// taken from the OPPONENT COUNTRY'S estimate matrix (not the value snapshotted on
// the matchup at pairing time) — and the actual Battle Points from the session.
//
// The army is matched by faction today (our 8 armies are all distinct factions).
// TODO(login): once players log in and own a profile, resolve "which game is
// mine" from the profile instead of the roster faction.

import type { Disposition } from "./data";
import {
  lookupEstimate,
  type OpponentMap,
  type OpponentList,
} from "./estimates-db";
import { vpToBP } from "./scoring";
import type { SessionData, MatchupData } from "./session";

export interface TournamentGame {
  round: number;
  sessionId: string;
  opponentTeam: string; // country name (e.g. "Belgium")
  theirFaction: string;
  theirDetachments: string[];
  theirDisposition: Disposition | null;
  // Estimate for our army vs this opponent list, read from the country matrix.
  // null when the matrix has no cell / no close-enough list.
  estimate: number | null;
  tableAdj: number; // live per-game table adjustment recorded during play
  actual: number; // our Battle Points (0-20) from the played result
  delta: number | null; // actual - estimate (null when no estimate)
}

// The game our army played in a session, matched by faction.
function matchupForFaction(session: SessionData | null | undefined, faction: string): MatchupData | null {
  if (!session) return null;
  return (session.matchups || []).find((m) => m.aFaction === faction) || null;
}

export function tournamentGamesForArmy(params: {
  opponents: OpponentMap;
  rounds: { number: number; opponentName: string; sessionId: string }[];
  sessions: Record<string, SessionData>;
  armyIdx: number;
  armyFaction: string;
}): TournamentGame[] {
  const { opponents, rounds, sessions, armyIdx, armyFaction } = params;
  if (!armyFaction) return [];
  const games: TournamentGame[] = [];
  for (const r of rounds) {
    const m = matchupForFaction(sessions[r.sessionId], armyFaction);
    if (!m || !m.final) continue;
    const theirList: OpponentList = {
      faction: m.bFaction,
      detachments: m.bDetachments || [],
      disposition: m.bDisposition ?? null,
    };
    // Estimate from the opponent country's matrix; fall back to the value
    // captured on the matchup at pairing time if the matrix has no match.
    const fromMatrix = lookupEstimate(opponents, r.opponentName, armyIdx, theirList);
    const estimate = fromMatrix ?? (m.estimate && m.estimate > 0 ? m.estimate : null);
    // Actual result: convert the game's VP differential to our Battle Points.
    const diff = (m.aVP ?? 0) - (m.bVP ?? 0);
    const bp = vpToBP(diff);
    const actual = diff >= 0 ? bp.winner : bp.loser;
    games.push({
      round: r.number,
      sessionId: r.sessionId,
      opponentTeam: r.opponentName,
      theirFaction: m.bFaction,
      theirDetachments: m.bDetachments || [],
      theirDisposition: m.bDisposition ?? null,
      estimate,
      tableAdj: m.tableAdj ?? 0,
      actual,
      delta: estimate !== null ? actual - estimate : null,
    });
  }
  return games.sort((a, b) => a.round - b.round);
}
