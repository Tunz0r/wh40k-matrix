"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { TEAM_SLUG, TEAM_NAME } from "@/lib/team";
import {
  subscribeToTournament,
  type TournamentDoc,
  type PlayerProfile,
} from "@/lib/tournament-db";
import {
  subscribeToOpponents,
  estimateStyle,
  clusterLists,
  listSimilarity,
  SIMILARITY_THRESHOLD,
  type OpponentMap,
  type OpponentList,
  type ListCluster,
  type ClusterMember,
  type EstimateCell,
} from "@/lib/estimates-db";

// How far a mirror-pair sum may drift from 20 (or a self-mirror from 10)
// before it's flagged.
const TOLERANCE = 2;

// Rule 3: two archetypes at least this similar (but below the cluster
// threshold, or they'd be one archetype) with estimates differing more than
// DIVERGENCE_MAX are flagged — near-identical lists shouldn't score wildly
// differently.
const SIMILAR_PAIR_MIN = 60;
const DIVERGENCE_MAX = 4;

function BPChip({ v }: { v: number }) {
  const s = estimateStyle(v);
  return (
    <span
      className="inline-flex items-center justify-center rounded border font-bold w-8 h-6 text-[11px]"
      style={{ background: s.bg, color: s.fg, borderColor: s.border }}
    >
      {v}
    </span>
  );
}

interface Finding {
  severity: number; // how far outside tolerance
  text: React.ReactNode;
}

export default function SanityPage() {
  const [doc, setDoc] = useState<TournamentDoc | null>(null);
  const [opponents, setOpponents] = useState<OpponentMap>({});

  useEffect(() => {
    try {
      const u1 = subscribeToTournament(TEAM_SLUG, setDoc);
      const u2 = subscribeToOpponents(setOpponents);
      return () => { u1(); u2(); };
    } catch {}
  }, []);

  const clusters = useMemo(() => clusterLists(opponents), [opponents]);
  const armies = useMemo(() => doc?.roster?.armies || [], [doc]);

  // Each army's profile resolved to its live cluster in the field.
  const resolved = useMemo(() => {
    return armies.map((army, idx) => {
      const profile: PlayerProfile | null = doc?.profiles?.[`a${idx}`] ?? null;
      let cluster: ListCluster | null = null;
      if (profile) {
        const asList: OpponentList = {
          faction: profile.faction,
          detachments: profile.detachments || [],
          disposition: (profile.disposition ?? null) as OpponentList["disposition"],
          ...(profile.units?.length ? { units: profile.units } : {}),
        };
        let best: { c: ListCluster; sim: number } | null = null;
        for (const c of clusters) {
          const sim = listSimilarity(asList, c.rep.list);
          if (sim >= SIMILARITY_THRESHOLD && (!best || sim > best.sim)) best = { c, sim };
        }
        cluster = best?.c ?? null;
      }
      const label = army.player || army.faction;
      const archLabel = profile
        ? `${profile.faction} ${(profile.detachments || []).join(", ")}`
        : null;
      return { army, idx, profile, cluster, label, archLabel };
    });
  }, [armies, doc, clusters]);

  // Our estimate for army `idx` vs a cluster — manual values win over auto.
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

  // Archetype pairs similar enough that their estimates should agree.
  const similarPairs = useMemo(() => {
    const pairs: { a: ListCluster; b: ListCluster; sim: number }[] = [];
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const sim = listSimilarity(clusters[i].rep.list, clusters[j].rep.list);
        if (sim >= SIMILAR_PAIR_MIN) pairs.push({ a: clusters[i], b: clusters[j], sim });
      }
    }
    return pairs;
  }, [clusters]);

  // Rule 1 — mirror pairs: if our player A (archetype X) estimates 14 vs
  // archetype Y, then our player B (archetype Y) should estimate ~6 vs X;
  // the two must sum to ~20 because it's the same matchup seen from both sides.
  // Rule 2 — self-mirror: an estimate vs your OWN archetype is a mirror match
  // and should be ~10.
  // Rule 3 — similar archetypes: the same army's estimates vs two near-identical
  // archetypes shouldn't diverge wildly.
  const { findings, checkedPairs, checkedSelfs, checkedSimilar } = useMemo(() => {
    const findings: Finding[] = [];
    let checkedPairs = 0;
    let checkedSelfs = 0;
    let checkedSimilar = 0;
    const withCluster = resolved.filter((r) => r.cluster);
    // Countries included so two same-named clusters can be told apart.
    const archLabel = (c: ListCluster) => {
      const countries = [...new Set(c.members.map((m) => m.teamName))];
      const shown = countries.slice(0, 2).join(", ") + (countries.length > 2 ? ` +${countries.length - 2}` : "");
      return `${c.rep.list.faction} ${(c.rep.list.detachments || []).join(", ")} [${shown}]`;
    };

    for (let x = 0; x < withCluster.length; x++) {
      for (let y = x + 1; y < withCluster.length; y++) {
        const A = withCluster[x];
        const B = withCluster[y];
        const a = clusterEstimate(B.cluster!, A.idx); // A vs B's archetype
        const b = clusterEstimate(A.cluster!, B.idx); // B vs A's archetype
        if (a === null || b === null) continue;
        checkedPairs++;
        const dev = a + b - 20;
        if (Math.abs(dev) > TOLERANCE) {
          findings.push({
            severity: Math.abs(dev) - TOLERANCE,
            text: (
              <>
                <span className="font-semibold text-[#e8e8f0]">{A.label}</span>
                <span className="text-[#8888a0]"> ({A.archLabel}) siger </span>
                <BPChip v={a} />
                <span className="text-[#8888a0]"> mod {B.archLabel} — men </span>
                <span className="font-semibold text-[#e8e8f0]">{B.label}</span>
                <span className="text-[#8888a0]"> ({B.archLabel}) siger </span>
                <BPChip v={b} />
                <span className="text-[#8888a0]">
                  {" "}mod {A.archLabel}. Sum {a + b}, burde være ~20 — mindst én af dem er{" "}
                  {dev > 0 ? "for optimistisk" : "for pessimistisk"}.
                </span>
              </>
            ),
          });
        }
      }
    }

    for (const r of withCluster) {
      const v = clusterEstimate(r.cluster!, r.idx);
      if (v === null) continue;
      checkedSelfs++;
      const dev = v - 10;
      if (Math.abs(dev) > TOLERANCE) {
        findings.push({
          severity: Math.abs(dev) - TOLERANCE,
          text: (
            <>
              <span className="font-semibold text-[#e8e8f0]">{r.label}</span>
              <span className="text-[#8888a0]"> ({r.archLabel}) siger </span>
              <BPChip v={v} />
              <span className="text-[#8888a0]">
                {" "}mod sin egen arketype — et spejlkamp burde være ~10.
              </span>
            </>
          ),
        });
      }
    }

    // Rule 3 — for every army, compare estimates across similar archetype pairs.
    resolved.forEach((r) => {
      for (const p of similarPairs) {
        const a = clusterEstimate(p.a, r.idx);
        const b = clusterEstimate(p.b, r.idx);
        if (a === null || b === null) continue;
        checkedSimilar++;
        const diff = Math.abs(a - b);
        if (diff > DIVERGENCE_MAX) {
          findings.push({
            severity: diff - DIVERGENCE_MAX,
            text: (
              <>
                <span className="font-semibold text-[#e8e8f0]">{r.label}</span>
                <span className="text-[#8888a0]"> siger </span>
                <BPChip v={a} />
                <span className="text-[#8888a0]"> mod {archLabel(p.a)}, men </span>
                <BPChip v={b} />
                <span className="text-[#8888a0]">
                  {" "}mod {archLabel(p.b)} — arketyperne er {Math.round(p.sim)}% ens, så en forskel på {diff} ser forkert ud.
                </span>
              </>
            ),
          });
        }
      }
    });

    findings.sort((a, b) => b.severity - a.severity);
    return { findings, checkedPairs, checkedSelfs, checkedSimilar };
  }, [resolved, clusterEstimate, similarPairs]);

  const missing = resolved.filter((r) => !r.profile);
  const unmatched = resolved.filter((r) => r.profile && !r.cluster);

  return (
    <>
      <header className="px-4 sm:px-6 py-4 border-b border-white/[0.08] sticky top-12 bg-[#0f0f13] z-20">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-[#e8e8f0] tracking-tight">
            Sanity-tjek
            <span className="text-[#4ade80] ml-2 text-sm font-normal">— {TEAM_NAME}</span>
          </h1>
          <span className="text-[11px] text-[#8888a0]">
            {checkedPairs} spejl-par · {checkedSelfs} egne arketyper · {checkedSimilar} lignende-par tjekket
          </span>
        </div>
        <p className="text-[10px] text-[#8888a0] mt-1">
          Krydstjek af holdets estimater: samme matchup set fra begge sider skal summe til ~20, et spejlkamp mod egen arketype skal være ~10 (tolerance ±{TOLERANCE}), og estimater mod arketyper der er ≥{SIMILAR_PAIR_MIN}% ens må højst afvige {DIVERGENCE_MAX}.
        </p>
      </header>

      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
        {findings.length > 0 ? (
          <div className="rounded-xl border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.03)] p-4">
            <h2 className="text-sm font-semibold text-[#f87171] mb-3">
              {findings.length} {findings.length === 1 ? "konflikt" : "konflikter"}
            </h2>
            <div className="space-y-1.5">
              {findings.map((f, i) => (
                <div key={i} className="rounded-lg border border-white/[0.06] px-3 py-2 text-[12px] leading-relaxed">
                  {f.text}
                </div>
              ))}
            </div>
          </div>
        ) : checkedPairs + checkedSelfs + checkedSimilar > 0 ? (
          <div className="rounded-xl border border-[rgba(34,197,94,0.25)] bg-[rgba(34,197,94,0.03)] p-4">
            <p className="text-[12px] text-[#4ade80]">
              Ingen konflikter fundet — alle tjekkede estimater er konsistente.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.08] p-4">
            <p className="text-[12px] text-[#8888a0]">
              Intet at tjekke endnu — spillerne skal vælge deres arketype under{" "}
              <Link href="/player" className="text-[#a855f7] underline">Min side</Link>, og der skal være estimater mod hinandens arketyper.
            </p>
          </div>
        )}

        {unmatched.length > 0 && (
          <div className="rounded-xl border border-[rgba(250,204,21,0.25)] p-4">
            <h2 className="text-xs font-semibold text-[#facc15] uppercase tracking-wider mb-2">
              Arketype matcher ikke feltet længere
            </h2>
            <p className="text-[11px] text-[#8888a0]">
              {unmatched.map((r) => r.label).join(", ")} — bed dem vælge en ny arketype på{" "}
              <Link href="/player" className="text-[#a855f7] underline">Min side</Link>.
            </p>
          </div>
        )}

        {missing.length > 0 && (
          <div className="rounded-xl border border-white/[0.08] p-4">
            <h2 className="text-xs font-semibold text-[#8888a0] uppercase tracking-wider mb-2">
              Mangler arketype ({missing.length}/8)
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {missing.map((r) => (
                <span key={r.idx} className="text-[11px] text-[#8888a0] bg-[#22222e] px-2 py-0.5 rounded">
                  {r.label}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-[#8888a0] mt-2">
              Jo flere der har valgt deres arketype under <Link href="/player" className="text-[#a855f7] underline">Min side</Link>, jo flere estimater kan krydstjekkes. Flere regler kommer til.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
