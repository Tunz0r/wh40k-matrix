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

const COLLAPSE_KEY = "wtc-warmups-collapsed";
const MODE_KEY = "wtc-warmups-mode";

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

interface FlatRow extends GameRow {
  playerIdx: number;
  playerLabel: string;
  delta: number | null;
}

interface CalStats {
  n: number;
  avg: number;
  abs: number;
}

function calStats(games: { actual: number; currentEstimate: number | null }[]): CalStats | null {
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

// One warmup row; `showPlayer` adds the player badge (explore mode).
function GameRowView({ g, delta, showPlayer, playerLabel }: {
  g: GameRow;
  delta: number | null;
  showPlayer?: boolean;
  playerLabel?: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.05] px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-[#8888a0] shrink-0 w-16">{g.date.slice(5)}</span>
        {showPlayer && (
          <span className="text-[10px] font-semibold text-[#a855f7] bg-[rgba(168,85,247,0.1)] px-1.5 py-0.5 rounded shrink-0">
            {playerLabel}
          </span>
        )}
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
}

export default function WarmupsPage() {
  const [doc, setDoc] = useState<TournamentDoc | null>(null);
  const [opponents, setOpponents] = useState<OpponentMap>({});
  const [mode, setMode] = useState<"players" | "explore">("players");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  // Explore filters
  const [fPlayer, setFPlayer] = useState("");
  const [fFaction, setFFaction] = useState("");
  const [fOnlyEst, setFOnlyEst] = useState(false);
  const [fMinDelta, setFMinDelta] = useState(0);
  const [sort, setSort] = useState("absdelta");

  useEffect(() => {
    try {
      const u1 = subscribeToTournament(TEAM_SLUG, setDoc);
      const u2 = subscribeToOpponents(setOpponents);
      return () => { u1(); u2(); };
    } catch {}
  }, []);

  // Collapse/mode state survives navigation within the browser session.
  useEffect(() => {
    try {
      const m = sessionStorage.getItem(MODE_KEY);
      if (m === "players" || m === "explore") setMode(m);
      const c = JSON.parse(sessionStorage.getItem(COLLAPSE_KEY) || "[]");
      if (Array.isArray(c)) setCollapsed(new Set(c));
    } catch {}
  }, []);

  function switchMode(m: "players" | "explore") {
    setMode(m);
    try { sessionStorage.setItem(MODE_KEY, m); } catch {}
  }

  function toggleCollapsed(idx: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      try { sessionStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }

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

  const allRows: FlatRow[] = useMemo(
    () =>
      players.flatMap((p) =>
        p.games.map((g) => ({
          ...g,
          playerIdx: p.idx,
          playerLabel: p.army.player || p.army.faction,
          delta: g.currentEstimate !== null ? g.actual - g.currentEstimate : null,
        }))
      ),
    [players]
  );
  const teamStats = useMemo(() => calStats(allRows), [allRows]);

  const factionOptions = useMemo(
    () => [...new Set(allRows.map((r) => r.faction))].sort(),
    [allRows]
  );

  const filtered = useMemo(() => {
    let rows = allRows;
    if (fPlayer !== "") rows = rows.filter((r) => r.playerIdx === Number(fPlayer));
    if (fFaction) rows = rows.filter((r) => r.faction === fFaction);
    if (fOnlyEst || fMinDelta > 0) rows = rows.filter((r) => r.delta !== null);
    if (fMinDelta > 0) rows = rows.filter((r) => Math.abs(r.delta!) >= fMinDelta);
    const byDate = (a: FlatRow, b: FlatRow) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
    return [...rows].sort((a, b) => {
      if (sort === "date") return byDate(a, b);
      const ad = a.delta, bd = b.delta;
      if (ad === null && bd === null) return byDate(a, b);
      if (ad === null) return 1;
      if (bd === null) return -1;
      if (sort === "delta-desc") return bd - ad || byDate(a, b);
      if (sort === "delta-asc") return ad - bd || byDate(a, b);
      return Math.abs(bd) - Math.abs(ad) || byDate(a, b); // absdelta
    });
  }, [allRows, fPlayer, fFaction, fOnlyEst, fMinDelta, sort]);

  const filteredStats = useMemo(() => calStats(filtered), [filtered]);

  return (
    <>
      <header className="px-4 sm:px-6 py-4 border-b border-white/[0.08] sticky top-12 bg-[#0f0f13] z-20">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-[#e8e8f0] tracking-tight">
            Warmup-kampe
            <span className="text-[#4ade80] ml-2 text-sm font-normal">— {TEAM_NAME}</span>
          </h1>
          <div className="flex gap-1">
            <button
              onClick={() => switchMode("players")}
              className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                mode === "players" ? "bg-[#a855f7] text-white" : "bg-[#22222e] text-[#8888a0] hover:text-[#e8e8f0]"
              }`}
            >
              Pr. spiller
            </button>
            <button
              onClick={() => switchMode("explore")}
              className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                mode === "explore" ? "bg-[#a855f7] text-white" : "bg-[#22222e] text-[#8888a0] hover:text-[#e8e8f0]"
              }`}
            >
              Udforsk
            </button>
          </div>
          <span className="text-[11px] text-[#8888a0]">{allRows.length} kampe i alt</span>
          {teamStats && <span className="ml-auto"><AvgLabel stats={teamStats} /></span>}
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

        {mode === "explore" && (
          <>
            {/* Filter bar */}
            <div className="rounded-xl border border-white/[0.08] p-3 flex items-center gap-2 flex-wrap">
              <select
                value={fPlayer}
                onChange={(e) => setFPlayer(e.target.value)}
                className="bg-[#1a1a22] border border-white/[0.14] rounded-lg px-2 py-1.5 text-[11px] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
              >
                <option value="">Alle spillere</option>
                {players.map((p) => (
                  <option key={p.idx} value={p.idx}>{p.army.player || p.army.faction}</option>
                ))}
              </select>
              <select
                value={fFaction}
                onChange={(e) => setFFaction(e.target.value)}
                className="bg-[#1a1a22] border border-white/[0.14] rounded-lg px-2 py-1.5 text-[11px] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
              >
                <option value="">Alle modstander-factions</option>
                {factionOptions.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <select
                value={fMinDelta}
                onChange={(e) => setFMinDelta(Number(e.target.value))}
                title="Kun kampe hvor resultatet afveg mindst så meget fra estimatet"
                className="bg-[#1a1a22] border border-white/[0.14] rounded-lg px-2 py-1.5 text-[11px] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
              >
                <option value={0}>Alle afvigelser</option>
                <option value={3}>|Δ| ≥ 3</option>
                <option value={5}>|Δ| ≥ 5</option>
              </select>
              <label className="flex items-center gap-1.5 text-[11px] text-[#8888a0] cursor-pointer">
                <input
                  type="checkbox"
                  checked={fOnlyEst}
                  onChange={(e) => setFOnlyEst(e.target.checked)}
                  className="accent-[#a855f7]"
                />
                Kun med estimat
              </label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="ml-auto bg-[#1a1a22] border border-white/[0.14] rounded-lg px-2 py-1.5 text-[11px] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
              >
                <option value="absdelta">Størst afvigelse først</option>
                <option value="date">Nyeste først</option>
                <option value="delta-desc">Δ faldende (bedst over estimat)</option>
                <option value="delta-asc">Δ stigende (værst under estimat)</option>
              </select>
            </div>

            {/* Filtered summary + rows */}
            <div className="flex items-center gap-2 text-[11px] text-[#8888a0]">
              <span>
                <span className="text-[#e8e8f0] font-semibold">{filtered.length}</span> kampe i filteret
              </span>
              {filteredStats && (
                <>
                  <span>·</span>
                  <AvgLabel stats={filteredStats} />
                </>
              )}
            </div>
            {filtered.length === 0 ? (
              <p className="text-[11px] text-[#8888a0]">Ingen kampe matcher filtrene.</p>
            ) : (
              <div className="space-y-1">
                {filtered.map((r) => (
                  <GameRowView
                    key={`${r.playerIdx}_${r.id}`}
                    g={r}
                    delta={r.delta}
                    showPlayer
                    playerLabel={r.playerLabel}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {mode === "players" &&
          players.map(({ army, idx, games, stats }) => {
            const isCollapsed = collapsed.has(idx);
            return (
              <div key={idx} className="rounded-xl border border-white/[0.08] p-4">
                <button
                  onClick={() => toggleCollapsed(idx)}
                  className="w-full flex items-center gap-2 flex-wrap text-left"
                >
                  <span className="text-[10px] text-[#8888a0] w-3">{isCollapsed ? "▸" : "▾"}</span>
                  <span className="text-[11px] text-[#8888a0]">{idx + 1}.</span>
                  <h2 className="text-sm font-semibold text-[#e8e8f0]">
                    {army.player ? `${army.player} — ` : ""}{army.faction}
                  </h2>
                  <span className="text-[10px] text-[#8888a0]">
                    {games.length} {games.length === 1 ? "kamp" : "kampe"}
                  </span>
                  {stats && <span className="ml-auto"><AvgLabel stats={stats} /></span>}
                </button>
                {!isCollapsed && (
                  <div className="mt-2">
                    {games.length === 0 ? (
                      <p className="text-[11px] text-[#8888a0]">Ingen warmup-kampe logget endnu.</p>
                    ) : (
                      <div className="space-y-1">
                        {games.map((g) => (
                          <GameRowView
                            key={g.id}
                            g={g}
                            delta={g.currentEstimate !== null ? g.actual - g.currentEstimate : null}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </>
  );
}
