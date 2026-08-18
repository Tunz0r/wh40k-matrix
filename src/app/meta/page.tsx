"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { TEAM_NAME } from "@/lib/team";
import { useActiveTournament } from "@/lib/active-tournament";
import { subscribeToTournament, type TournamentDoc } from "@/lib/tournament-db";
import {
  subscribeToOpponents,
  estimateStyle,
  clusterLists,
  type OpponentMap,
  type ListCluster,
  type ClusterMember,
  type EstimateCell,
  type OpponentList,
} from "@/lib/estimates-db";
import { archetypeWarmupStats, shrunkForecast } from "@/lib/forecast";
import { computeCoverage } from "@/lib/coverage";
import { formatUnitsLines } from "@/lib/list-parser";

// An archetype is "answered" when at least one of our armies estimates ≥ ANSWER
// against it; a "problem" when the BEST we have is ≤ PROBLEM.
const ANSWER = 12;
const PROBLEM = 8;

// "raw" = library estimates as-is; "warmup" = archetype-specific correction,
// where each cell we've warmed up against is replaced by our measured average
// result — a targeted shift, not a blanket per-player/team average.
type BiasMode = "raw" | "warmup";
const BIAS_KEY = "wtc-meta-bias";
const TEST_KEY = "wtc-meta-onlytest";

// Same seeding-tier weighting as the estimate priority: prevalence in strong
// fields matters most. Meta reference copies count 0.
const TIER_WEIGHT: Record<number, number> = { 1: 4, 2: 3, 3: 2, 4: 1 };
function tierWeight(tier: string): number {
  const m = /^tier/i.test(tier) ? tier.match(/\d+/) : null;
  return m ? TIER_WEIGHT[Number(m[0])] ?? 0 : 0;
}

function Chip({ v, answer, test, warmup }: { v: number; answer?: boolean; test?: boolean; warmup?: boolean }) {
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
      {warmup && (
        <span
          className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full bg-[#4ade80] border border-[#0f0f13]"
          title="Warmup-justeret ud fra faktiske resultater mod denne arketype"
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
  const [onlyUntested, setOnlyUntested] = useState(false);

  const { activeSlug } = useActiveTournament();
  useEffect(() => {
    try {
      const u1 = subscribeToTournament(activeSlug, setDoc);
      const u2 = subscribeToOpponents(setOpponents, activeSlug);
      return () => { u1(); u2(); };
    } catch {}
  }, [activeSlug]);
  useEffect(() => {
    setOnlyUntested(sessionStorage.getItem(TEST_KEY) === "1");
    const m = sessionStorage.getItem(BIAS_KEY);
    if (m === "warmup" || m === "raw") setBiasMode(m);
  }, []);
  function pickBias(m: BiasMode) {
    setBiasMode(m);
    try { sessionStorage.setItem(BIAS_KEY, m); } catch {}
  }

  const armies = useMemo(() => doc?.roster?.armies || [], [doc]);
  const clusters = useMemo(() => clusterLists(opponents), [opponents]);

  // How many warmup cells the archetype-specific view is currently overriding,
  // for the header note.
  const warmupCellCount = useMemo(() => {
    if (biasMode !== "warmup") return 0;
    let n = 0;
    for (const c of clusters)
      for (let i = 0; i < armies.length; i++)
        if (archetypeWarmupStats(doc?.warmups, i, c.rep.list, armies[i])) n++;
    return n;
  }, [biasMode, clusters, armies, doc]);

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
      // Archetype-specific warmup view (display-only): a cell we've warmed up
      // against is replaced by our measured average result; everything else keeps
      // its raw estimate. `warmupN[i]` = games behind an overridden cell, 0 else.
      const warmupN = armies.map((_, i) =>
        biasMode === "warmup" ? archetypeWarmupStats(doc?.warmups, i, c.rep.list, armies[i])?.onArchetype ?? 0 : 0
      );
      const cells = rawCells.map((v, i) => {
        if (biasMode === "warmup") {
          const w = archetypeWarmupStats(doc?.warmups, i, c.rep.list, armies[i]);
          if (w) return shrunkForecast(v, w);
        }
        return v;
      });
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
      // Every army whose estimate against this archetype is flagged "skal testes".
      const untestedBy = armies
        .map((_, i) => (cells[i] !== null && cellNeedsTest(c, i) ? i : -1))
        .filter((i) => i >= 0);
      const units = c.rep.list.units?.length
        ? c.rep.list.units
        : c.members.find((m) => m.list.units?.length)?.list.units;
      const title =
        [c.rep.list.disposition, countries.join(", ")].filter(Boolean).join(" · ") +
        (units ? `\n\n${formatUnitsLines(units)}` : "");
      return { c, cells, rawCells, warmupN, best, bestIdx, answerCount, testedAnswers, allAnswersUntested, untestedBy, category, weight, countries, title };
    });
  }, [clusters, armies, clusterEstimate, cellNeedsTest, biasMode, doc]);

  // Real coverage ("fake" detection) + per-army load — see lib/coverage. Uses the
  // displayed (warmup-adjusted) answers so it matches what's on screen.
  const coverage = useMemo(() => {
    const maskOf = (ci: number) => {
      let m = 0;
      rows[ci].cells.forEach((v, i) => { if (v !== null && v >= ANSWER) m |= 1 << i; });
      return m;
    };
    return computeCoverage(rows.map((r) => r.c), armies.length, maskOf);
  }, [rows, armies]);

  const counts = useMemo(() => {
    const n: Record<Category, number> = { problem: 0, even: 0, unknown: 0, single: 0, covered: 0 };
    for (const r of rows) n[r.category]++;
    return n;
  }, [rows]);

  // Covered archetypes whose coverage is fake (answers can all be occupied).
  const contestedCovered = useMemo(
    () => rows.filter((r) => r.category === "covered" && coverage.contested.has(`${r.c.rep.teamSlug}_${r.c.rep.listIdx}`)).length,
    [rows, coverage]
  );

  // Answered archetypes whose answers are ALL still untested guesses.
  const untestedCovered = useMemo(
    () => rows.filter((r) => r.answerCount > 0 && r.allAnswersUntested).length,
    [rows]
  );
  // Archetypes with at least one 🧪-flagged estimate, and how many flags total.
  const flagged = useMemo(() => rows.filter((r) => r.untestedBy.length > 0), [rows]);
  const flaggedCells = useMemo(
    () => flagged.reduce((s, r) => s + r.untestedBy.length, 0),
    [flagged]
  );

  function toggleOnlyUntested() {
    setOnlyUntested((v) => {
      try { sessionStorage.setItem(TEST_KEY, v ? "0" : "1"); } catch {}
      return !v;
    });
  }

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
            <span className="text-[#4ade80] font-semibold">
              {counts.covered} dækket
              {contestedCovered > 0 && (
                <span className="text-[#fb923c] font-normal" title="Dækket-arketyper hvis svar-hære alle kan optages af andre factions i samme runde — dækningen er reelt falsk">
                  {" "}({contestedCovered} falsk)
                </span>
              )}
            </span>
            {untestedCovered > 0 && (
              <span className="text-[#fb923c] font-semibold" title="Arketyper hvor alle vores svar stadig kun er utestede gæt">
                🧪 {untestedCovered} utestet
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold">Estimater</span>
          <div className="flex gap-1">
            {([
              ["raw", "Rå"],
              ["warmup", "Warmup-justeret"],
            ] as [BiasMode, string][]).map(([m, label]) => (
              <button
                key={m}
                onClick={() => pickBias(m)}
                className={`text-[10px] px-2 py-0.5 rounded-md transition-colors ${
                  biasMode === m ? "bg-[#a855f7] text-white" : "bg-[#22222e] text-[#8888a0] hover:text-[#e8e8f0]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {biasMode === "warmup" && (
            <span className="text-[10px] text-[#facc15]">
              {warmupCellCount > 0
                ? `${warmupCellCount} celle${warmupCellCount === 1 ? "" : "r"} justeret mod warmup-resultater hvor hæren spillede sin NUVÆRENDE liste mod netop den arketype (vægtet efter antal kampe · grøn prik — rå værdi ved hover). Kampe med andre lister tæller kun lidt. Resten står urørt.`
                : "Ingen warmup-kampe endnu — intet at justere. Log dem på Min side."}
            </span>
          )}
          <button
            onClick={toggleOnlyUntested}
            disabled={!flagged.length}
            title={
              flagged.length
                ? "Vis kun arketyper hvor mindst ét estimat er markeret 'skal testes'"
                : "Ingen estimater er markeret 'skal testes' endnu — markér dem med 🧪 under Estimater → Min hær"
            }
            className={`ml-auto text-[10px] px-2 py-0.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              onlyUntested
                ? "bg-[#fb923c] text-[#0f0f13] font-semibold"
                : "bg-[#22222e] text-[#8888a0] hover:text-[#fb923c]"
            }`}
          >
            🧪 Kun usikre ({flagged.length})
          </button>
        </div>
        {onlyUntested && (
          <p className="text-[10px] text-[#fb923c] mt-1">
            {`Filtrerer: viser ${flagged.length} arketyper med ${flaggedCells} ${flaggedCells === 1 ? "estimat" : "estimater"} markeret "skal testes" — hærene med flaget er fremhævet.`}
          </p>
        )}
        <p className="text-[10px] text-[#8888a0] mt-1">
          Hver arketype vs alle vores hære — hvem er vores svar, og hvor har vi huller? Målet er mindst to hære med et positivt svar (≥ {ANSWER}) mod hver arketype. Grupperet efter faction (A→Å), derefter prioritet (seedingvægtet udbredelse). Ring om hvert svar ≥ {ANSWER}; 🧪-prik = estimatet skal stadig testes. ⚠ = falsk dækning: hver svar-hær er også det eneste svar på en anden faction, så modstanderen kan trække dem væk og efterlade arketypen uden svar. Hover en række for listen.
        </p>
        {armies.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold">Svar-belastning</span>
            {armies.map((a, i) => {
              const n = coverage.armyLoad[i];
              const tone =
                n === 0
                  ? "text-[#f87171] border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.06)]"
                  : n >= Math.round(coverage.factionCount * 0.75)
                    ? "text-[#fb923c] border-[rgba(251,146,60,0.4)] bg-[rgba(251,146,60,0.06)]"
                    : "text-[#8888a0] border-white/[0.1]";
              return (
                <span
                  key={i}
                  title={`${a.player ? a.player + " — " : ""}${a.faction}: svarer på ${n} af ${coverage.factionCount} factions (≥ ${ANSWER})${n === 0 ? " — bidrager ingen dækning" : n >= Math.round(coverage.factionCount * 0.75) ? " — overtegnet: kan kun spille én kamp pr. runde" : ""}`}
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${tone}`}
                >
                  {(a.player || a.faction).slice(0, 5)} {n}
                </span>
              );
            })}
            <span className="text-[10px] text-[#8888a0]">= factions hæren svarer på (0 = ingen dækning · højt = overtegnet, spiller kun én kamp/runde)</span>
          </div>
        )}
      </header>

      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
        {armies.length === 0 && (
          <p className="text-[11px] text-[#8888a0]">
            Intet roster fundet — gå til <Link href="/tournament/wtc-2026" className="text-[#a855f7] underline">turneringen</Link> og opdater roster først.
          </p>
        )}

        {onlyUntested && !flagged.length && (
          <p className="text-[11px] text-[#8888a0]">
            Ingen estimater er markeret &quot;skal testes&quot;. Spillerne markerer dem med 🧪 på arketype-kortene under{" "}
            <Link href="/estimates" className="text-[#a855f7] underline">Estimater → Min hær</Link>.
          </p>
        )}

        {SECTIONS.map(({ cat, title, desc, color, border }) => {
          const detKey = (l: OpponentList) =>
            [...(l.detachments || [])].map((d) => d.trim().toLowerCase()).sort().join(" + ");
          // Group each box by faction (A→Å); within a faction keep priority order,
          // then detachment/disposition for a stable, readable sequence.
          const sectionRows = rows
            .filter((r) => r.category === cat && (!onlyUntested || r.untestedBy.length > 0))
            .sort(
              (a, b) =>
                a.c.rep.list.faction.localeCompare(b.c.rep.list.faction) ||
                b.weight - a.weight ||
                detKey(a.c.rep.list).localeCompare(detKey(b.c.rep.list)) ||
                (a.c.rep.list.disposition || "").localeCompare(b.c.rep.list.disposition || "") ||
                b.c.members.length - a.c.members.length
            );
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
                            {cat === "covered" && coverage.contested.has(`${r.c.rep.teamSlug}_${r.c.rep.listIdx}`) && (
                              <span
                                className="text-[9px] font-semibold text-[#fb923c] bg-[rgba(251,146,60,0.12)] px-1 py-0.5 rounded ml-1.5"
                                title="Falsk dækning: hver hær der svarer på denne arketype er også det eneste svar på en anden faction. Bringer modstanderen dem, skal de hære bruges der — og denne arketype står uden svar, selvom den ser dækket ud."
                              >
                                ⚠ falsk
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-[#8888a0] truncate">
                            {(r.c.rep.list.detachments || []).join(", ")} · {r.c.members.length}{" "}
                            {r.c.members.length === 1 ? "liste" : "lister"}
                          </div>
                        </td>
                        {r.cells.map((v, i) => {
                          const flaggedCell = cellNeedsTest(r.c, i);
                          const wN = r.warmupN[i];
                          return (
                            <td
                              key={i}
                              // While filtering, dim the estimates that are NOT
                              // flagged so the ones needing a test stand out.
                              className={`text-center px-0.5 ${onlyUntested && !flaggedCell ? "opacity-25" : ""}`}
                              title={
                                wN > 0
                                  ? `Warmup-justeret: rå estimat ${r.rawCells[i] ?? "—"} → ${v} (vægtet mod ${wN} kamp${wN === 1 ? "" : "e"} med hærens nuværende liste vs denne arketype)`
                                  : undefined
                              }
                            >
                              {v !== null ? (
                                <Chip v={v} answer={v >= ANSWER} test={flaggedCell} warmup={wN > 0} />
                              ) : (
                                <span className="text-[10px] text-[#44445a]">·</span>
                              )}
                            </td>
                          );
                        })}
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
