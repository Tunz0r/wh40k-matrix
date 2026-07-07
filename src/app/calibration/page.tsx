"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { TEAM_SLUG, TEAM_NAME } from "@/lib/team";
import { subscribeToTournament, type TournamentDoc, type TournamentRound } from "@/lib/tournament-db";
import { fetchSession, type SessionData } from "@/lib/session";
import { vpToBP } from "@/lib/scoring";
import { estimateStyle } from "@/lib/estimates-db";

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
  const [sessions, setSessions] = useState<Record<string, SessionData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      return subscribeToTournament(TEAM_SLUG, setDoc);
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
        const estimate = m.estimate && m.estimate > 0 ? m.estimate : null;
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

  // Per-army/player bias across all finished games with an estimate
  const playerStats = useMemo(() => {
    const map = new Map<string, { player: string | null; deltas: number[]; games: number }>();
    for (const g of games) {
      const entry = map.get(g.ourFaction) || { player: g.player, deltas: [], games: 0 };
      entry.games++;
      if (g.delta !== null) entry.deltas.push(g.delta);
      if (g.player) entry.player = g.player;
      map.set(g.ourFaction, entry);
    }
    return [...map.entries()]
      .map(([faction, e]) => ({
        faction,
        player: e.player,
        games: e.games,
        rated: e.deltas.length,
        avgDelta: e.deltas.length
          ? e.deltas.reduce((a, b) => a + b, 0) / e.deltas.length
          : null,
        avgAbs: e.deltas.length
          ? e.deltas.reduce((a, b) => a + Math.abs(b), 0) / e.deltas.length
          : null,
      }))
      .sort((a, b) => (b.avgAbs ?? -1) - (a.avgAbs ?? -1));
  }, [games]);

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
          Estimat vs. faktisk resultat (0-20 BP) for alle færdigspillede kampe. Positiv delta = spillet bedre end estimeret.
        </p>
      </header>

      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
        {loading && games.length === 0 ? (
          <div className="text-[#8888a0] text-sm text-center py-12">Indlæser...</div>
        ) : games.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.08] p-8 text-center">
            <p className="text-[12px] text-[#8888a0]">
              Ingen færdigspillede kampe endnu — kalibreringen fyldes ud efterhånden som runderne afsluttes.
            </p>
            <Link
              href="/tournament"
              className="inline-block mt-3 text-[11px] text-[#a855f7] hover:text-[#c084fc] transition-colors"
            >
              ← Til turneringen
            </Link>
          </div>
        ) : (
          <>
            {/* Per-player bias */}
            <div className="rounded-xl border border-white/[0.08] p-4">
              <h2 className="text-xs font-semibold text-[#8888a0] uppercase tracking-wider mb-3">
                Bias pr. spiller
              </h2>
              <div className="space-y-1.5">
                {playerStats.map((s) => (
                  <div
                    key={s.faction}
                    className="flex items-center gap-3 rounded-lg border border-white/[0.06] px-3 py-2"
                  >
                    <span className="text-[12px] text-[#e8e8f0] font-medium flex-1 min-w-0 truncate">
                      {s.player ? `${s.player} — ` : ""}
                      {s.faction}
                    </span>
                    <span className="text-[10px] text-[#8888a0] shrink-0">
                      {s.rated}/{s.games} kampe med estimat
                    </span>
                    {s.avgDelta !== null ? (
                      <span
                        className={`text-[12px] font-bold shrink-0 w-24 text-right ${
                          Math.abs(s.avgDelta) <= 1
                            ? "text-[#4ade80]"
                            : s.avgDelta > 0
                              ? "text-[#facc15]"
                              : "text-[#f87171]"
                        }`}
                        title={
                          s.avgDelta > 0
                            ? "Undervurderer sig selv — spiller bedre end estimaterne"
                            : s.avgDelta < 0
                              ? "Overvurderer sig selv — estimaterne er for optimistiske"
                              : "Rammer plet"
                        }
                      >
                        {s.avgDelta > 0 ? "+" : ""}
                        {s.avgDelta.toFixed(1)}
                        <span className="text-[9px] text-[#8888a0] font-normal ml-1">
                          (±{s.avgAbs!.toFixed(1)})
                        </span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#8888a0] w-24 text-right">—</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[#8888a0] mt-2">
                Delta = faktisk BP minus estimat. Negativ (rød) = for optimistiske estimater; brug det når I retter estimater til de kommende runder.
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
