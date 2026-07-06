"use client";

import { useState, useEffect, useMemo } from "react";
import type { RosterArmy } from "@/lib/roster";
import { DISP_STYLES } from "@/lib/data";
import {
  type OpponentMap,
  type EstimateCell,
  type ListCluster,
  type ClusterMember,
  clusterLists,
} from "@/lib/estimates-db";
import EstimateInput from "./EstimateInput";

const MY_ARMY_KEY = "wtc-my-army";

function tierRank(tier: string): number {
  const m = tier.match(/\d+/);
  return m ? Number(m[0]) : 99;
}

export default function PlayerEstimates({
  opponents,
  ourArmies,
  playedRounds,
  onSet,
}: {
  opponents: OpponentMap;
  ourArmies: RosterArmy[];
  playedRounds: Map<string, number>;
  onSet: (teamSlug: string, ourIdx: number, theirIdx: number, v: number | null) => void;
}) {
  const [myIdx, setMyIdx] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(MY_ARMY_KEY);
    if (saved !== null && Number(saved) < ourArmies.length) setMyIdx(Number(saved));
  }, [ourArmies.length]);

  function pickArmy(i: number) {
    setMyIdx(i);
    localStorage.setItem(MY_ARMY_KEY, String(i));
  }

  const clusters = useMemo(() => clusterLists(opponents), [opponents]);

  const cellFor = (member: ClusterMember, ourIdx: number): EstimateCell | undefined =>
    opponents[member.teamSlug]?.estimates?.[`${ourIdx}_${member.listIdx}`];

  // Per-army progress for the selector chips / captain overview
  const progress = useMemo(() => {
    return ourArmies.map((_, i) => {
      let filled = 0,
        total = 0;
      for (const team of Object.values(opponents)) {
        (team.armies || []).forEach((_, j) => {
          total++;
          if (team.estimates?.[`${i}_${j}`]) filled++;
        });
      }
      return { filled, total };
    });
  }, [opponents, ourArmies]);

  // Clusters annotated for the selected army, unfilled first, tier 1 first,
  // biggest clusters first.
  const annotated = useMemo(() => {
    if (myIdx === null) return [];
    return clusters
      .map((cluster) => {
        const repCell = cellFor(cluster.rep, myIdx);
        const manualCell = cluster.members
          .map((m) => cellFor(m, myIdx))
          .find((c) => c && !c.auto);
        const anyCell = cluster.members.map((m) => cellFor(m, myIdx)).find(Boolean);
        const displayCell = (repCell && !repCell.auto ? repCell : manualCell) ?? repCell ?? anyCell;
        const unlockedMembers = cluster.members.filter((m) => !playedRounds.has(m.teamSlug));
        // Anchor for writes: the representative unless it's locked
        const anchor = !playedRounds.has(cluster.rep.teamSlug)
          ? cluster.rep
          : unlockedMembers[0] ?? null;
        const bestTier = Math.min(...cluster.members.map((m) => tierRank(m.tier)));
        const filledCount = cluster.members.filter((m) => cellFor(m, myIdx)).length;
        return { cluster, displayCell, anchor, bestTier, filledCount };
      })
      .sort((a, b) => {
        const aEmpty = a.filledCount === 0 ? 0 : 1;
        const bEmpty = b.filledCount === 0 ? 0 : 1;
        if (aEmpty !== bEmpty) return aEmpty - bEmpty;
        if (a.bestTier !== b.bestTier) return a.bestTier - b.bestTier;
        return b.cluster.members.length - a.cluster.members.length;
      });
  }, [clusters, myIdx, opponents, playedRounds]);

  const clusterKey = (c: ListCluster) => `${c.rep.teamSlug}_${c.rep.listIdx}`;
  const myProgress = myIdx !== null ? progress[myIdx] : null;
  const clustersDone = annotated.filter((a) => a.filledCount === a.cluster.members.length).length;

  return (
    <div className="space-y-4">
      {/* Army selector doubling as captain overview */}
      <div className="rounded-xl border border-white/[0.08] p-4">
        <h2 className="text-xs font-semibold text-[#8888a0] uppercase tracking-wider mb-2">
          Vælg din hær
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5">
          {ourArmies.map((army, i) => {
            const p = progress[i];
            const pct = p.total ? Math.round((100 * p.filled) / p.total) : 0;
            const active = myIdx === i;
            return (
              <button
                key={i}
                onClick={() => pickArmy(i)}
                className={`text-left rounded-lg border p-2.5 transition-colors ${
                  active
                    ? "border-[#a855f7]/60 bg-[#a855f7]/10"
                    : "border-white/[0.08] hover:border-white/[0.18]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#8888a0]">{i + 1}.</span>
                  <span className="text-[12px] text-[#e8e8f0] font-medium truncate flex-1">
                    {army.player ? `${army.player} — ` : ""}
                    {army.faction}
                  </span>
                  <span className={`text-[10px] font-bold ${pct >= 100 ? "text-[#4ade80]" : "text-[#8888a0]"}`}>
                    {pct}%
                  </span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${pct >= 100 ? "bg-[#4ade80]" : "bg-[#a855f7]"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {myIdx === null ? (
        <p className="text-[11px] text-[#8888a0] text-center py-6">
          Vælg din hær ovenfor for at udfylde dine estimater.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap text-[11px] text-[#8888a0]">
            <span>
              <span className="text-[#e8e8f0] font-semibold">{myProgress?.filled}</span>/
              {myProgress?.total} celler
            </span>
            <span>·</span>
            <span>
              <span className="text-[#e8e8f0] font-semibold">{clustersDone}</span>/
              {annotated.length} arketyper
            </span>
            <span className="ml-auto">Uudfyldte arketyper vises først — ét estimat dækker alle lignende lister</span>
          </div>

          <div className="space-y-1.5">
            {annotated.map(({ cluster, displayCell, anchor, filledCount }) => {
              const key = clusterKey(cluster);
              const isOpen = expanded === key;
              const disp = cluster.rep.list.disposition;
              const countries = cluster.members.map((m) => m.teamName);
              return (
                <div
                  key={key}
                  className={`rounded-lg border ${filledCount === 0 ? "border-[rgba(168,85,247,0.25)]" : "border-white/[0.08]"}`}
                >
                  <div className="flex items-center gap-2.5 p-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[12px] font-medium text-[#e8e8f0]">
                          {cluster.rep.list.faction}
                        </span>
                        <span className="text-[11px] text-[#8888a0] truncate">
                          {(cluster.rep.list.detachments || []).join(", ")}
                        </span>
                        {disp && (
                          <span
                            className="text-[8px] font-semibold px-1 py-0.5 rounded whitespace-nowrap"
                            style={{ background: DISP_STYLES[disp].bg, color: DISP_STYLES[disp].color }}
                          >
                            {disp}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setExpanded(isOpen ? null : key)}
                        className="text-[10px] text-[#8888a0] hover:text-[#a855f7] transition-colors mt-0.5"
                      >
                        {cluster.members.length}{" "}
                        {cluster.members.length === 1 ? "liste" : "lister"}:{" "}
                        {countries.slice(0, 3).join(", ")}
                        {countries.length > 3 ? ` +${countries.length - 3}` : ""}{" "}
                        {isOpen ? "▴" : "▾"}
                      </button>
                    </div>
                    <span className="text-[9px] text-[#8888a0] shrink-0">
                      {filledCount}/{cluster.members.length}
                    </span>
                    <EstimateInput
                      cell={displayCell}
                      locked={!anchor}
                      onChange={(v) => anchor && onSet(anchor.teamSlug, myIdx, anchor.listIdx, v)}
                    />
                  </div>

                  {isOpen && (
                    <div className="px-2.5 pb-2.5 space-y-1">
                      {cluster.members.map((m) => {
                        const locked = playedRounds.has(m.teamSlug);
                        return (
                          <div
                            key={`${m.teamSlug}_${m.listIdx}`}
                            className="flex items-center gap-2 rounded-md border border-white/[0.05] px-2 py-1"
                          >
                            <span className="text-[11px] text-[#e8e8f0] flex-1 truncate">
                              {m.teamName}
                              {locked && <span className="text-[#8888a0] ml-1.5">🔒</span>}
                            </span>
                            <span className="text-[10px] text-[#8888a0] truncate max-w-[40%]">
                              {(m.list.detachments || []).join(", ")}
                              {m.list.disposition ? ` · ${m.list.disposition}` : ""}
                            </span>
                            <EstimateInput
                              cell={cellFor(m, myIdx)}
                              locked={locked}
                              onChange={(v) => onSet(m.teamSlug, myIdx, m.listIdx, v)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
