"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { TEAM_SLUG, TEAM_NAME } from "@/lib/team";
import { subscribeToTournament, type TournamentDoc, type TournamentRound } from "@/lib/tournament-db";
import { fetchSession, type SessionData } from "@/lib/session";
import { vpToBP } from "@/lib/scoring";
import {
  estimateStyle,
  lookupEstimate,
  subscribeToOpponents,
  type OpponentMap,
  type OpponentList,
} from "@/lib/estimates-db";

interface GameRow {
  roundNumber: number;
  opponentName: string;
  ourFaction: string;
  player: string | null;
  theirFaction: string;
  estimate: number | null; // null = no estimate was set at pairing time
  actual: number; // our BP on the 0-20 scale
  delta: number | null;
}

function BPChip({ v }: { v: number }) {
  const s = estimateStyle(v);
  return (
    <span
      className="inline-flex items-center justify-center w-8 h-6 rounded border text-[11px] font-bold"
      style={{ background: s.bg, color: s.fg, borderColor: s.border }}
    >
      {v}
    </span>
  );
}

function DeltaBadge({ d }: { d: number | null }) {
  if (d === null) return <span className="text-[11px] text-[#8888a0]">—</span>;
  const abs = Math.abs(d);
  const color = abs <= 1 ? "text-[#8888a0]" : d > 0 ? "text-[#4ade80]" : "text-[#f87171]";
  return (
    <span className={`text-[12px] font-bold ${color}`}>
      {d > 0 ? "+" : ""}
      {d}
    </span>
  );
}

export default function CalibrationPage() {
  const [doc, setDoc] = useState<TournamentDoc | null>(null);
  const [opponents, setOpponents] = useState<OpponentMap>({});
  const [sessions, setSessions] = useState<Record<string, SessionData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const u1 = subscribeToTournament(TEAM_SLUG, setDoc);
      const u2 = subscribeToOpponents(setOpponents);
      return () => { u1(); u2(); };
    } catch {}
  }, []);

  const rounds = useMemo(
    () =>
      (doc?.rounds || []).filter(
        (r): r is TournamentRound & { sessionId: string } =>
          !!r.sessionId && (r.status === "live" || r.status === "completed")
      ),
    [doc]
  );

  const loadSessions = useCallback(async () => {
    setLoading(true);
    const entries = await Promise.all(
      rounds.map(async (r) => [r.sessionId, await fetchSession(r.sessionId)] as const)
    );
    const map: Record<string, SessionData> = {};
    for (const [id, data] of entries) if (data) map[id] = data;
    setSessions(map);
    setLoading(false);
  }, [rounds]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // One row per finished game, matched to our roster by faction for player names
  const games = useMemo(() => {
    const rows: GameRow[] = [];
    for (const round of rounds) {
      const session = sessions[round.sessionId];
      if (!session) continue;
      for (const m of session.matchups || []) {
        if (!m.final) continue;
        const vpDiff = (m.aVP ?? 0) - (m.bVP ?? 0);
        const bp = vpToBP(vpDiff);
        const actual = vpDiff >= 0 ? bp.winner : bp.loser;
        const rosterArmy = doc?.roster?.armies?.find((a) => a.faction === m.aFaction);
        // Compare the table-adjusted estimate (what we actually expected on the
        // chosen table) against the result.
        const estimate = m.estimate && m.estimate > 0 ? m.estimate + (m.tableAdj ?? 0) : null;
        rows.push({
          roundNumber: round.number,
          opponentName: round.opponentName || session.teamBName,
          ourFaction: m.aFaction,
          player: rosterArmy?.player || null,
          theirFaction: m.bFaction,
          estimate,
          actual,
          delta: estimate !== null ? actual - estimate : null,
        });
      }
    }
    return rows;
  }, [rounds, sessions, doc]);

  // Per-player bias from BOTH calibration sources, merged on the roster slot:
  // warmup games (prep — deltas vs the CURRENT estimate, same math as /meta's
  // bias correction) and finished tournament rounds (deltas vs the estimate
  // locked at pairing). Comparing the two shows whether prep calibration held
  // up at the event.
  const playerStats = useMemo(() => {
    const armies = doc?.roster?.armies || [];
    const stat = (deltas: number[]) =>
      deltas.length
        ? {
            n: deltas.length,
            avg: deltas.reduce((a, b) => a + b, 0) / deltas.length,
            abs: deltas.reduce((a, b) => a + Math.abs(b), 0) / deltas.length,
          }
        : null;
    return armies
      .map((army, idx) => {
        // warmup deltas vs live estimate (snapshot as fallback)
        const wuDeltas: number[] = [];
        let wuGames = 0;
        for (const g of Object.values(doc?.warmups?.[`a${idx}`] || {})) {
          wuGames++;
          const est =
            lookupEstimate(opponents, null, idx, {
              faction: g.faction,
              detachments: g.detachments || [],
              disposition: (g.disposition ?? null) as OpponentList["disposition"],
            }) ?? g.estimate ?? null;
          if (est !== null) wuDeltas.push(g.actual - est);
        }
        // tournament deltas (rows already computed per game)
        const tourDeltas = games
          .filter((g) => g.ourFaction === army.faction && g.delta !== null)
          .map((g) => g.delta as number);
        const tourGames = games.filter((g) => g.ourFaction === army.faction).length;
        return {
          faction: army.faction,
          player: army.player || null,
          warmup: stat(wuDeltas),
          warmupGames: wuGames,
          tour: stat(tourDeltas),
          tourGames,
        };
      })
      .sort(
        (a, b) =>
          (b.tour?.abs ?? b.warmup?.abs ?? -1) - (a.tour?.abs ?? a.warmup?.abs ?? -1)
      );
  }, [doc, opponents, games]);

  const hasAnyCalibration = playerStats.some((s) => s.warmup || s.tour);

  const roundNumbers = [...new Set(games.map((g) => g.roundNumber))].sort((a, b) => b - a);

  return (
    <>
      <header className="px-4 sm:px-6 py-4 border-b border-white/[0.08] sticky top-12 bg-[#0f0f13] z-20">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-[#e8e8f0] tracking-tight">
            Kalibrering
            <span className="text-[#4ade80] ml-2 text-sm font-normal">— {TEAM_NAME}</span>
          </h1>
          <button
            onClick={loadSessions}
            className="ml-auto text-[11px] text-[#a855f7] hover:text-[#c084fc] transition-colors"
          >
            Opdater
          </button>
        </div>
        <p className="text-xs text-[#8888a0] mt-1">
          Estimat vs. faktisk resultat (0-20 BP) — warmup-kampe under forberedelsen og rigtige runder ved WTC. Positiv delta = spillet bedre end estimeret.
        </p>
      </header>

      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
        {loading && !hasAnyCalibration ? (
          <div className="text-[#8888a0] text-sm text-center py-12">Indlæser...</div>
        ) : !hasAnyCalibration ? (
          <div className="rounded-xl border border-dashed border-white/[0.08] p-8 text-center">
            <p className="text-[12px] text-[#8888a0]">
              Ingen kalibreringsdata endnu — log warmup-kampe på{" "}
              <Link href="/player" className="text-[#a855f7] underline">Min side</Link>, så fyldes siden ud. Rigtige runder kommer til ved WTC.
            </p>
          </div>
        ) : (
          <>
            {/* Per-player bias: warmup (prep) vs tournament rounds side by side */}
            <div className="rounded-xl border border-white/[0.08] p-4">
              <div className="flex items-baseline gap-2 mb-3 flex-wrap">
                <h2 className="text-xs font-semibold text-[#8888a0] uppercase tracking-wider">
                  Bias pr. spiller
                </h2>
                <span className="text-[10px] text-[#8888a0]">
                  warmup-kampe (mod nuværende estimater) · runder (mod estimatet ved pairing)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-y-1.5">
                  <thead>
                    <tr>
                      <th className="text-left text-[9px] text-[#8888a0] font-semibold">Spiller</th>
                      <th className="text-right text-[9px] text-[#8888a0] font-semibold px-2 whitespace-nowrap">Warmup</th>
                      <th className="text-right text-[9px] text-[#8888a0] font-semibold px-2 whitespace-nowrap">Runder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerStats.map((s) => {
                      const cell = (
                        st: { n: number; avg: number; abs: number } | null,
                        total: number
                      ) =>
                        st ? (
                          <span
                            className={`text-[12px] font-bold ${
                              Math.abs(st.avg) <= 1
                                ? "text-[#4ade80]"
                                : st.avg > 0
                                  ? "text-[#facc15]"
                                  : "text-[#f87171]"
                            }`}
                            title={
                              (st.avg > 1
                                ? "Undervurderer sig selv — spiller bedre end estimaterne"
                                : st.avg < -1
                                  ? "Overvurderer sig selv — estimaterne er for optimistiske"
                                  : "Rammer plet") + ` · ${st.n}${total > st.n ? `/${total}` : ""} kampe med estimat`
                            }
                          >
                            {st.avg > 0 ? "+" : ""}
                            {st.avg.toFixed(1)}
                            <span className="text-[9px] text-[#8888a0] font-normal ml-1">
                              (±{st.abs.toFixed(1)} · {st.n})
                            </span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#44445a]">—</span>
                        );
                      return (
                        <tr key={s.faction}>
                          <td className="text-[12px] text-[#e8e8f0] font-medium pr-2 truncate max-w-[220px]">
                            {s.player ? `${s.player} — ` : ""}
                            {s.faction}
                          </td>
                          <td className="text-right px-2 whitespace-nowrap">{cell(s.warmup, s.warmupGames)}</td>
                          <td className="text-right px-2 whitespace-nowrap">{cell(s.tour, s.tourGames)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-[#8888a0] mt-2">
                Delta = faktisk BP minus estimat. Negativ (rød) = for optimistiske estimater. Når runderne begynder, viser kolonnerne om jeres warmup-kalibrering holdt ved WTC.
              </p>
            </div>

            {/* Per-round breakdown */}
            {roundNumbers.map((n) => {
              const roundGames = games.filter((g) => g.roundNumber === n);
              const round = rounds.find((r) => r.number === n);
              return (
                <div key={n} className="rounded-xl border border-white/[0.08] p-4">
                  <h2 className="text-xs font-semibold text-[#8888a0] uppercase tracking-wider mb-3">
                    Runde {n} — vs {roundGames[0]?.opponentName}
                    {round?.score && (
                      <span className="ml-2 text-[#e8e8f0]">
                        {round.score.us}–{round.score.them}
                      </span>
                    )}
                  </h2>
                  <div className="space-y-1">
                    {roundGames.map((g, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded-lg border border-white/[0.05] px-2.5 py-1.5"
                      >
                        <span className="text-[11px] text-[#e8e8f0] flex-1 min-w-0 truncate">
                          {g.player ? `${g.player} — ` : ""}
                          {g.ourFaction}
                        </span>
                        <span className="text-[10px] text-[#8888a0] truncate max-w-[25%]">
                          vs {g.theirFaction}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {g.estimate !== null ? (
                            <BPChip v={g.estimate} />
                          ) : (
                            <span className="inline-flex items-center justify-center w-8 h-6 rounded border border-white/[0.08] text-[10px] text-[#44445a]">
                              —
                            </span>
                          )}
                          <span className="text-[9px] text-[#8888a0]">→</span>
                          <BPChip v={g.actual} />
                          <span className="w-9 text-right">
                            <DeltaBadge d={g.delta} />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
