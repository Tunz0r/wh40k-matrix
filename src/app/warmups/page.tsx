"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { TEAM_SLUG, TEAM_NAME } from "@/lib/team";
import {
  subscribeToTournament,
  type TournamentDoc,
  type WarmupGame,
} from "@/lib/tournament-db";
import {
  subscribeToOpponents,
  estimateStyle,
  lookupEstimate,
  type OpponentMap,
  type OpponentList,
} from "@/lib/estimates-db";

function BPChip({ v, big }: { v: number; big?: boolean }) {
  const s = estimateStyle(v);
  return (
    <span
      className={`inline-flex items-center justify-center rounded border font-bold ${big ? "w-11 h-9 text-[15px]" : "w-8 h-6 text-[11px]"}`}
      style={{ background: s.bg, color: s.fg, borderColor: s.border }}
    >
      {v}
    </span>
  );
}

function DeltaLabel({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  return (
    <span className={`text-[11px] font-bold w-8 text-right ${Math.abs(delta) <= 1 ? "text-[#8888a0]" : delta > 0 ? "text-[#4ade80]" : "text-[#f87171]"}`}>
      {delta > 0 ? "+" : ""}{delta}
    </span>
  );
}

interface GameRow extends WarmupGame {
  id: string;
  currentEstimate: number | null;
}

interface CalStats {
  n: number;
  avg: number;
  abs: number;
}

function calStats(games: GameRow[]): CalStats | null {
  const deltas = games
    .filter((g) => g.currentEstimate !== null)
    .map((g) => g.actual - (g.currentEstimate as number));
  if (!deltas.length) return null;
  return {
    n: deltas.length,
    avg: deltas.reduce((a, b) => a + b, 0) / deltas.length,
    abs: deltas.reduce((a, b) => a + Math.abs(b), 0) / deltas.length,
  };
}

function AvgLabel({ stats }: { stats: CalStats }) {
  return (
    <span className="text-[10px] text-[#8888a0]">
      {stats.n} med estimat · snit{" "}
      <span className={`font-bold ${Math.abs(stats.avg) <= 1 ? "text-[#4ade80]" : stats.avg > 0 ? "text-[#facc15]" : "text-[#f87171]"}`}>
        {stats.avg > 0 ? "+" : ""}{stats.avg.toFixed(1)}
      </span>{" "}
      (±{stats.abs.toFixed(1)})
    </span>
  );
}

export default function WarmupsPage() {
  const [doc, setDoc] = useState<TournamentDoc | null>(null);
  const [opponents, setOpponents] = useState<OpponentMap>({});

  useEffect(() => {
    try {
      const u1 = subscribeToTournament(TEAM_SLUG, setDoc);
      const u2 = subscribeToOpponents(setOpponents);
      return () => { u1(); u2(); };
    } catch {}
  }, []);

  // One section per army: its games enriched with the LIVE estimate for the
  // archetype (log-time snapshot only as fallback), newest first.
  const players = useMemo(() => {
    const armies = doc?.roster?.armies || [];
    return armies.map((army, idx) => {
      const node = doc?.warmups?.[`a${idx}`] || {};
      const games: GameRow[] = Object.entries(node)
        .map(([id, g]) => {
          const snapshot = g.estimate ?? null;
          const live = lookupEstimate(opponents, null, idx, {
            faction: g.faction,
            detachments: g.detachments || [],
            disposition: (g.disposition ?? null) as OpponentList["disposition"],
          });
          return { id, ...g, estimate: snapshot, currentEstimate: live ?? snapshot };
        })
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      return { army, idx, games, stats: calStats(games) };
    });
  }, [doc, opponents]);

  const allGames = useMemo(() => players.flatMap((p) => p.games), [players]);
  const teamStats = useMemo(() => calStats(allGames), [allGames]);

  return (
    <>
      <header className="px-4 sm:px-6 py-4 border-b border-white/[0.08] sticky top-12 bg-[#0f0f13] z-20">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-[#e8e8f0] tracking-tight">
            Warmup-kampe
            <span className="text-[#4ade80] ml-2 text-sm font-normal">— {TEAM_NAME}</span>
          </h1>
          <span className="text-[11px] text-[#8888a0]">
            {allGames.length} kampe i alt
          </span>
          {teamStats && (
            <span className="ml-auto"><AvgLabel stats={teamStats} /></span>
          )}
        </div>
        <p className="text-[10px] text-[#8888a0] mt-1">
          Alle spilleres træningskampe mod arketyper. Estimaterne er de nuværende fra estimat-menuen — positivt snit = spiller bedre end estimatet, negativt = estimaterne er for optimistiske.
        </p>
      </header>

      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
        {!doc?.roster?.armies?.length && (
          <p className="text-[11px] text-[#8888a0]">
            Intet roster fundet — gå til <Link href="/tournament" className="text-[#a855f7] underline">turneringen</Link> og opdater roster først.
          </p>
        )}

        {players.map(({ army, idx, games, stats }) => (
          <div key={idx} className="rounded-xl border border-white/[0.08] p-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[11px] text-[#8888a0]">{idx + 1}.</span>
              <h2 className="text-sm font-semibold text-[#e8e8f0]">
                {army.player ? `${army.player} — ` : ""}{army.faction}
              </h2>
              <span className="text-[10px] text-[#8888a0]">
                {games.length} {games.length === 1 ? "kamp" : "kampe"}
              </span>
              {stats && <span className="ml-auto"><AvgLabel stats={stats} /></span>}
            </div>
            {games.length === 0 ? (
              <p className="text-[11px] text-[#8888a0]">Ingen warmup-kampe logget endnu.</p>
            ) : (
              <div className="space-y-1">
                {games.map((g) => {
                  const delta = g.currentEstimate !== null ? g.actual - g.currentEstimate : null;
                  return (
                    <div key={g.id} className="rounded-lg border border-white/[0.05] px-2.5 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-[#8888a0] shrink-0 w-16">{g.date.slice(5)}</span>
                        <span className="text-[11px] text-[#e8e8f0] flex-1 min-w-0 truncate">
                          vs {g.faction}
                          <span className="text-[#8888a0]"> · {(g.detachments || []).join(", ")}</span>
                        </span>
                        {g.currentEstimate !== null ? (
                          <span
                            title={
                              g.estimate !== null && g.estimate !== g.currentEstimate
                                ? `Estimat da kampen blev logget: ${g.estimate}`
                                : "Nuværende estimat for arketypen"
                            }
                          >
                            <BPChip v={g.currentEstimate} />
                          </span>
                        ) : (
                          <span className="w-8 text-center text-[10px] text-[#44445a]">—</span>
                        )}
                        <span className="text-[9px] text-[#8888a0]">→</span>
                        <BPChip v={g.actual} big />
                        <DeltaLabel delta={delta} />
                      </div>
                      {g.notes && (
                        <p className="text-[10px] text-[#8888a0] mt-0.5 pl-[72px] break-words">{g.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
