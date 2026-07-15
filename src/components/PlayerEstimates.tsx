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
import { formatUnits, formatUnitsLines } from "@/lib/list-parser";
import EstimateInput from "./EstimateInput";

const MY_ARMY_KEY = "wtc-my-army";

function tierRank(tier: string): number {
  const m = /^tier/i.test(tier) ? tier.match(/\d+/) : null;
  return m ? Number(m[0]) : 99;
}

// Priority weight per seeding tier — estimating against stronger fields matters
// more (but prevalence still dominates, since the cluster score SUMS these over
// every country running the archetype). Meta reference copies count 0.
// To emphasise Tier 1 more, use { 1: 5, 2: 3, 3: 2, 4: 1 }.
const TIER_WEIGHT: Record<number, number> = { 1: 4, 2: 3, 3: 2, 4: 1 };
function tierWeight(tier: string): number {
  return /^tier/i.test(tier) ? TIER_WEIGHT[tierRank(tier)] ?? 0 : 0;
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

  // Clusters annotated for the selected army — values update live, but the
  // ORDER is frozen in state so cards don't jump away while you're typing.
  const annotated = useMemo(() => {
    if (myIdx === null) return [];
    return clusters.map((cluster) => {
      const repCell = cellFor(cluster.rep, myIdx);
      const manualCell = cluster.members
        .map((m) => cellFor(m, myIdx))
        .find((c) => c && !c.auto);
      const anyCell = cluster.members.map((m) => cellFor(m, myIdx)).find(Boolean);
      const displayCell = (repCell && !repCell.auto ? repCell : manualCell) ?? repCell ?? anyCell;
      const unlockedMembers = cluster.members.filter((m) => !playedRounds.has(m.teamSlug));
      // Anchor for the MANUAL write: prefer a permanent meta-reference member
      // (ATC/PtG/Listhammer, tier "Meta …") so the manual estimate lives in the
      // library that never gets rebuilt. Nations are disposable and only ever
      // hold auto-inherited copies, so estimating an archetype survives any
      // later country rebuild (incl. loading the real WTC lists). Falls back to
      // the rep/first unlocked list for archetypes not yet in the library.
      const anchor =
        unlockedMembers.find((m) => /^meta/i.test(m.tier)) ??
        (!playedRounds.has(cluster.rep.teamSlug) ? cluster.rep : unlockedMembers[0] ?? null);
      const filledCount = cluster.members.filter((m) => cellFor(m, myIdx)).length;
      // Priority = sum of seeding-tier weights over the countries running this
      // archetype (meta reference copies count 0). Blends prevalence with
      // opponent strength.
      const weight = cluster.members.reduce((s, m) => s + tierWeight(m.tier), 0);
      // Clusters where a real army list has been pasted (unit content) are the
      // useful ones to estimate; synthetic placeholders sink to the bottom.
      const hasUnits = cluster.members.some((m) => m.list.units?.length);
      return { cluster, displayCell, anchor, weight, filledCount, hasUnits };
    });
  }, [clusters, myIdx, opponents, playedRounds]);

  const clusterKey = (c: ListCluster) => `${c.rep.teamSlug}_${c.rep.listIdx}`;

  // Real lists first, then unfilled first, then highest tier-weighted priority.
  // Recomputed only when the army/field changes or focus leaves the list.
  const sortedKeys = (list: typeof annotated) =>
    [...list]
      .sort((a, b) => {
        if (a.hasUnits !== b.hasUnits) return a.hasUnits ? -1 : 1;
        const aEmpty = a.filledCount === 0 ? 0 : 1;
        const bEmpty = b.filledCount === 0 ? 0 : 1;
        if (aEmpty !== bEmpty) return aEmpty - bEmpty;
        if (b.weight !== a.weight) return b.weight - a.weight;
        return b.cluster.members.length - a.cluster.members.length;
      })
      .map((a) => clusterKey(a.cluster));

  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    setOrder(sortedKeys(annotated));
    // Only re-sort when the selected army or the field itself changes —
    // not on every estimate keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myIdx, annotated.length]);

  const displayList = useMemo(() => {
    const pos = new Map(order.map((k, i) => [k, i]));
    return [...annotated].sort(
      (a, b) =>
        (pos.get(clusterKey(a.cluster)) ?? Number.MAX_SAFE_INTEGER) -
        (pos.get(clusterKey(b.cluster)) ?? Number.MAX_SAFE_INTEGER)
    );
  }, [annotated, order]);

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
            // 0% → red (hue 0), 100% → green (hue 120)
            const hue = (pct / 100) * 120;
            return (
              <button
                key={i}
                onClick={() => pickArmy(i)}
                className={`text-left rounded-lg border p-2.5 transition-colors ${
                  active
                    ? "border-[#a855f7]/60"
                    : "border-white/[0.08] hover:border-white/[0.18]"
                }`}
                style={{ background: `hsla(${hue}, 70%, 45%, ${active ? 0.28 : 0.16})` }}
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
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: `hsl(${hue}, 70%, 50%)` }}
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

          <div
            className="space-y-1.5"
            onBlur={(e) => {
              // Re-sort once focus leaves the whole list — not while tabbing
              // between inputs inside it.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setOrder(sortedKeys(annotated));
              }
            }}
          >
            {displayList.map(({ cluster, displayCell, anchor, filledCount, weight }) => {
              const key = clusterKey(cluster);
              const isOpen = expanded === key;
              const disp = cluster.rep.list.disposition;
              const countries = cluster.members.map((m) => m.teamName);
              // Show the representative's list content — or the first member's
              // if the rep hasn't had its list pasted yet
              const cardUnits =
                cluster.rep.list.units?.length
                  ? cluster.rep.list.units
                  : cluster.members.find((m) => m.list.units?.length)?.list.units ?? null;
              // Full hover tooltip for the whole card: "Blood Angels Liberator
              // Assault Group · Take and Hold" plus the list content if present
              const headline = [
                cluster.rep.list.faction,
                (cluster.rep.list.detachments || []).join(", "),
              ].filter(Boolean).join(" ");
              const cardTitle =
                [headline, disp].filter(Boolean).join(" · ") +
                (cardUnits ? `\n\n${formatUnitsLines(cardUnits)}` : "");
              return (
                <div
                  key={key}
                  title={cardTitle}
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
                      {cardUnits && (
                        <p
                          title={formatUnits(cardUnits)}
                          className="text-[10px] leading-[1.6] text-[#8888a0] break-words mt-0.5"
                        >
                          {formatUnits(cardUnits)}
                        </p>
                      )}
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
                    <span
                      className="text-[9px] font-semibold text-[#a855f7] bg-[rgba(168,85,247,0.1)] px-1.5 py-0.5 rounded shrink-0"
                      title="Prioritet: sum af seeding-vægte (Tier 1=4, 2=3, 3=2, 4=1) for landene med denne arketype"
                    >
                      prio {weight}
                    </span>
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
                        // Only repeat the list content when it differs from
                        // what the card already shows
                        const ownUnits =
                          m.list.units?.length &&
                          JSON.stringify(m.list.units) !== JSON.stringify(cardUnits)
                            ? m.list.units
                            : null;
                        return (
                          <div
                            key={`${m.teamSlug}_${m.listIdx}`}
                            className="rounded-md border border-white/[0.05]"
                          >
                            <div className="flex items-center gap-2 px-2 py-1">
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
                            {ownUnits && (
                              <p
                                title={formatUnits(ownUnits)}
                                className="px-2 pb-1 text-[10px] leading-[1.6] text-[#8888a0] break-words"
                              >
                                {formatUnits(ownUnits)}
                              </p>
                            )}
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
