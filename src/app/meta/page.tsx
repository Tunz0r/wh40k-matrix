"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { TEAM_SLUG, TEAM_NAME } from "@/lib/team";
import { subscribeToTournament, type TournamentDoc } from "@/lib/tournament-db";
import {
  subscribeToOpponents,
  estimateStyle,
  clusterLists,
  lookupEstimate,
  type OpponentMap,
  type ListCluster,
  type ClusterMember,
  type EstimateCell,
  type OpponentList,
} from "@/lib/estimates-db";
import { formatUnitsLines } from "@/lib/list-parser";

// An archetype is "answered" when at least one of our armies estimates ≥ ANSWER
// against it; a "problem" when the BEST we have is ≤ PROBLEM.
const ANSWER = 12;
const PROBLEM = 8;

// Per-player bias needs a few games before it's trusted; below this we fall
// back to the team-wide number.
const MIN_PLAYER_GAMES = 3;
type BiasMode = "raw" | "team" | "player";
const BIAS_KEY = "wtc-meta-bias";

// Same seeding-tier weighting as the estimate priority: prevalence in strong
// fields matters most. Meta reference copies count 0.
const TIER_WEIGHT: Record<number, number> = { 1: 4, 2: 3, 3: 2, 4: 1 };
function tierWeight(tier: string): number {
  const m = /^tier/i.test(tier) ? tier.match(/\d+/) : null;
  return m ? TIER_WEIGHT[Number(m[0])] ?? 0 : 0;
}

function Chip({ v, answer, test }: { v: number; answer?: boolean; test?: boolean }) {
  const s = estimateStyle(v);
  return (
    <span className="relative inline-flex">
      <span
        className={`inline-flex items-center justify-center rounded border font-bold w-7 h-6 text-[11px] ${answer ? "ring-2 ring-[#a855f7]" : ""}`}
        style={{ background: s.bg, color: s.fg, borderColor: s.border }}
      >
        {v}
      </span>
      {test && (
        <span
          className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#fb923c] border border-[#0f0f13]"
          title="Estimatet skal testes (usikkert)"
        />
      )}
    </span>
  );
}

type Category = "problem" | "even" | "unknown" | "single" | "covered";

const SECTIONS: { cat: Category; title: string; desc: string; color: string; border: string }[] = [
  { cat: "problem", title: "Problemer — intet svar", desc: `Bedste estimat ≤ ${PROBLEM}: ingen af vores hære slår arketypen`, color: "#f87171", border: "rgba(239,68,68,0.3)" },
  { cat: "even", title: "Kun lige kampe", desc: `Bedste estimat 9–11: vi kan holde stand, men ingen vinder på den`, color: "#facc15", border: "rgba(250,204,21,0.3)" },
  { cat: "unknown", title: "Ukendte — ingen estimater", desc: "Ingen af vores hære har estimeret mod arketypen endnu", color: "#8888a0", border: "rgba(255,255,255,0.12)" },
  { cat: "single", title: "Kun ét svar — sårbart", desc: `Præcis én hær estimerer ≥ ${ANSWER}: bliver den hær pairet væk, står vi uden svar. Målet er mindst to.`, color: "#fb923c", border: "rgba(251,146,60,0.3)" },
  { cat: "covered", title: "Dækket — mindst to svar", desc: `To eller flere hære estimerer ≥ ${ANSWER} mod arketypen`, color: "#4ade80", border: "rgba(34,197,94,0.3)" },
];

export default function MetaPage() {
  const [doc, setDoc] = useState<TournamentDoc | null>(null);
  const [opponents, setOpponents] = useState<OpponentMap>({});
  const [biasMode, setBiasMode] = useState<BiasMode>("raw");

  useEffect(() => {
    try {
      const u1 = subscribeToTournament(TEAM_SLUG, setDoc);
      const u2 = subscribeToOpponents(setOpponents);
      return () => { u1(); u2(); };
    } catch {}
  }, []);
  useEffect(() => {
    const m = sessionStorage.getItem(BIAS_KEY);
    if (m === "team" || m === "player" || m === "raw") setBiasMode(m);
  }, []);
  function pickBias(m: BiasMode) {
    setBiasMode(m);
    try { sessionStorage.setItem(BIAS_KEY, m); } catch {}
  }

  const armies = useMemo(() => doc?.roster?.armies || [], [doc]);
  const clusters = useMemo(() => clusterLists(opponents), [opponents]);

  // Calibration bias from warmup games: how far actuals land from our CURRENT
  // estimate, per army and team-wide. Positive = we play better than we
  // estimate (estimates too pessimistic). Display-only — never rewrites data.
  const bias = useMemo(() => {
    const perArmy: Record<number, { bias: number; n: number }> = {};
    const teamDeltas: number[] = [];
    armies.forEach((_, idx) => {
      const node = doc?.warmups?.[`a${idx}`] || {};
      const deltas: number[] = [];
      for (const g of Object.values(node)) {
        const est = lookupEstimate(opponents, null, idx, {
          faction: g.faction,
          detachments: g.detachments || [],
          disposition: (g.disposition ?? null) as OpponentList["disposition"],
        });
        if (est !== null) {
          deltas.push(g.actual - est);
          teamDeltas.push(g.actual - est);
        }
      }
      perArmy[idx] = deltas.length
        ? { bias: deltas.reduce((a, b) => a + b, 0) / deltas.length, n: deltas.length }
        : { bias: 0, n: 0 };
    });
    const team = teamDeltas.length
      ? { bias: teamDeltas.reduce((a, b) => a + b, 0) / teamDeltas.length, n: teamDeltas.length }
      : { bias: 0, n: 0 };
    return { perArmy, team };
  }, [doc, opponents, armies]);

  // The correction applied to army idx under the current mode. Player mode
  // falls back to the team number until the player has enough games.
  const biasFor = useMemo(() => {
    return (idx: number): number => {
      if (biasMode === "team") return bias.team.bias;
      if (biasMode === "player") {
        const p = bias.perArmy[idx];
        return p && p.n >= MIN_PLAYER_GAMES ? p.bias : bias.team.bias;
      }
      return 0;
    };
  }, [biasMode, bias]);

  // Our best current estimate per army vs a cluster — manual values win.
  const clusterEstimate = useMemo(() => {
    return (cluster: ListCluster, idx: number): number | null => {
      const cellFor = (m: ClusterMember): EstimateCell | undefined =>
        opponents[m.teamSlug]?.estimates?.[`${idx}_${m.listIdx}`];
      const rep = cellFor(cluster.rep);
      const manual = cluster.members.map(cellFor).find((c) => c && !c.auto);
      const cell = (rep && !rep.auto ? rep : manual) ?? rep ?? cluster.members.map(cellFor).find(Boolean);
      return cell ? cell.v : null;
    };
  }, [opponents]);

  // Does one army's estimate against this cluster carry the "needs testing" flag?
  const cellNeedsTest = useMemo(() => {
    return (cluster: ListCluster, idx: number): boolean =>
      cluster.members.some((m) => opponents[m.teamSlug]?.estimates?.[`${idx}_${m.listIdx}`]?.needsTest);
  }, [opponents]);

  const rows = useMemo(() => {
    return clusters.map((c) => {
      const rawCells = armies.map((_, i) => clusterEstimate(c, i));
      // Bias-adjusted view (display-only); raw kept for the hover tooltip.
      const cells = rawCells.map((v, i) =>
        v === null ? null : Math.max(0, Math.min(20, Math.round(v + biasFor(i))))
      );
      const known = cells.filter((v): v is number => v !== null);
      const best = known.length ? Math.max(...known) : null;
      const bestIdx = best !== null ? cells.indexOf(best) : -1;
      const answerCount = cells.filter((v): v is number => v !== null && v >= ANSWER).length;
      const category: Category =
        best === null
          ? "unknown"
          : answerCount >= 2
            ? "covered"
            : answerCount === 1
              ? "single"
              : best > PROBLEM
                ? "even"
                : "problem";
      const weight = c.members.reduce((s, m) => s + tierWeight(m.tier), 0);
      const countries = [...new Set(c.members.map((m) => m.teamName))];
      // Which of our answers are still just guesses? Flag the row when EVERY
      // positive answer is untested — that's a coverage number we can't trust.
      const answerIdxs = cells
        .map((v, i) => (v !== null && v >= ANSWER ? i : -1))
        .filter((i) => i >= 0);
      const testedAnswers = answerIdxs.filter((i) => !cellNeedsTest(c, i)).length;
      const allAnswersUntested = answerIdxs.length > 0 && testedAnswers === 0;
      const units = c.rep.list.units?.length
        ? c.rep.list.units
        : c.members.find((m) => m.list.units?.length)?.list.units;
      const title =
        [c.rep.list.disposition, countries.join(", ")].filter(Boolean).join(" · ") +
        (units ? `\n\n${formatUnitsLines(units)}` : "");
      return { c, cells, rawCells, best, bestIdx, answerCount, testedAnswers, allAnswersUntested, category, weight, countries, title };
    });
  }, [clusters, armies, clusterEstimate, cellNeedsTest, biasFor]);

  const counts = useMemo(() => {
    const n: Record<Category, number> = { problem: 0, even: 0, unknown: 0, single: 0, covered: 0 };
    for (const r of rows) n[r.category]++;
    return n;
  }, [rows]);

  // Answered archetypes whose answers are ALL still untested guesses.
  const untestedCovered = useMemo(
    () => rows.filter((r) => r.answerCount > 0 && r.allAnswersUntested).length,
    [rows]
  );

  return (
    <>
      <header className="px-4 sm:px-6 py-4 border-b border-white/[0.08] sticky top-12 bg-[#0f0f13] z-20">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-[#e8e8f0] tracking-tight">
            Meta-overblik
            <span className="text-[#4ade80] ml-2 text-sm font-normal">— {TEAM_NAME}</span>
          </h1>
          <span className="text-[11px] text-[#8888a0]">{rows.length} arketyper i feltet</span>
          <span className="ml-auto flex items-center gap-2 text-[10px]">
            <span className="text-[#f87171] font-semibold">{counts.problem} problemer</span>
            <span className="text-[#facc15] font-semibold">{counts.even} lige</span>
            <span className="text-[#8888a0] font-semibold">{counts.unknown} ukendte</span>
            <span className="text-[#fb923c] font-semibold">{counts.single} sårbare</span>
            <span className="text-[#4ade80] font-semibold">{counts.covered} dækket</span>
            {untestedCovered > 0 && (
              <span className="text-[#fb923c] font-semibold" title="Arketyper hvor alle vores svar stadig kun er utestede gæt">
                🧪 {untestedCovered} utestet
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold">Justér for bias</span>
          <div className="flex gap-1">
            {([
              ["raw", "Rå"],
              ["team", `Hold (${bias.team.bias >= 0 ? "+" : ""}${bias.team.bias.toFixed(1)})`],
              ["player", "Pr. spiller"],
            ] as [BiasMode, string][]).map(([m, label]) => (
              <button
                key={m}
                onClick={() => pickBias(m)}
                disabled={m !== "raw" && bias.team.n === 0}
                className={`text-[10px] px-2 py-0.5 rounded-md transition-colors disabled:opacity-30 ${
                  biasMode === m ? "bg-[#a855f7] text-white" : "bg-[#22222e] text-[#8888a0] hover:text-[#e8e8f0]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {biasMode !== "raw" && (
            <span className="text-[10px] text-[#facc15]">
              Estimater vist justeret ud fra {bias.team.n} warmup-kampe (kun visning — rå værdi ved hover)
            </span>
          )}
        </div>
        <p className="text-[10px] text-[#8888a0] mt-1">
          Hver arketype vs alle vores hære — hvem er vores svar, og hvor har vi huller? Målet er mindst to hære med et positivt svar (≥ {ANSWER}) mod hver arketype. Sorteret efter prioritet (seedingvægtet udbredelse). Ring om hvert svar ≥ {ANSWER}; 🧪-prik = estimatet skal stadig testes. Hover en række for listen.
        </p>
      </header>

      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
        {armies.length === 0 && (
          <p className="text-[11px] text-[#8888a0]">
            Intet roster fundet — gå til <Link href="/tournament" className="text-[#a855f7] underline">turneringen</Link> og opdater roster først.
          </p>
        )}

        {SECTIONS.map(({ cat, title, desc, color, border }) => {
          const sectionRows = rows
            .filter((r) => r.category === cat)
            .sort((a, b) => b.weight - a.weight || b.c.members.length - a.c.members.length);
          if (!sectionRows.length) return null;
          return (
            <div key={cat} className="rounded-xl border p-4" style={{ borderColor: border }}>
              <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
                <h2 className="text-sm font-semibold" style={{ color }}>{title}</h2>
                <span className="text-[10px] text-[#8888a0]">{sectionRows.length} arketyper · {desc}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="border-separate border-spacing-y-1 w-full">
                  <thead>
                    <tr>
                      <th className="text-left text-[9px] text-[#8888a0] font-semibold pr-2 whitespace-nowrap">
                        Arketype (prio)
                      </th>
                      {armies.map((a, i) => (
                        <th
                          key={i}
                          className="text-[9px] text-[#8888a0] font-semibold w-8 px-0.5 truncate max-w-8"
                          title={`${a.player ? a.player + " — " : ""}${a.faction}`}
                        >
                          {(a.player || a.faction).slice(0, 5)}
                        </th>
                      ))}
                      <th className="text-[9px] text-[#8888a0] font-semibold px-1 whitespace-nowrap">Svar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionRows.map((r) => (
                      <tr key={`${r.c.rep.teamSlug}_${r.c.rep.listIdx}`} title={r.title} className="group">
                        <td className="pr-2 py-0.5 min-w-[180px] max-w-[280px]">
                          <div className="text-[11px] text-[#e8e8f0] font-medium truncate group-hover:text-white">
                            {r.c.rep.list.faction}
                            <span className="text-[9px] font-semibold text-[#a855f7] bg-[rgba(168,85,247,0.1)] px-1 py-0.5 rounded ml-1.5">
                              prio {r.weight}
                            </span>
                          </div>
                          <div className="text-[10px] text-[#8888a0] truncate">
                            {(r.c.rep.list.detachments || []).join(", ")} · {r.c.members.length}{" "}
                            {r.c.members.length === 1 ? "liste" : "lister"}
                          </div>
                        </td>
                        {r.cells.map((v, i) => (
                          <td
                            key={i}
                            className="text-center px-0.5"
                            title={
                              v !== null && r.rawCells[i] !== v
                                ? `Rå estimat ${r.rawCells[i]} → justeret ${v}`
                                : undefined
                            }
                          >
                            {v !== null ? (
                              <Chip v={v} answer={v >= ANSWER} test={cellNeedsTest(r.c, i)} />
                            ) : (
                              <span className="text-[10px] text-[#44445a]">·</span>
                            )}
                          </td>
                        ))}
                        <td className="text-center px-1 whitespace-nowrap">
                          {r.best === null ? (
                            <span className="text-[10px] text-[#44445a]">—</span>
                          ) : r.answerCount > 0 ? (
                            <span className="text-[11px] font-bold" style={{ color }} title={`${r.answerCount} hær(e) estimerer ≥ ${ANSWER}; bedste er ${r.best}`}>
                              {r.answerCount}×
                              <span className="text-[9px] text-[#8888a0] font-normal ml-1">
                                {r.bestIdx >= 0 ? (armies[r.bestIdx].player || armies[r.bestIdx].faction).slice(0, 8) : ""}
                              </span>
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold" style={{ color }} title={`Intet svar ≥ ${ANSWER}; bedste er ${r.best}`}>
                              {r.best}
                              <span className="text-[9px] text-[#8888a0] font-normal ml-1">
                                {r.bestIdx >= 0 ? (armies[r.bestIdx].player || armies[r.bestIdx].faction).slice(0, 8) : ""}
                              </span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
