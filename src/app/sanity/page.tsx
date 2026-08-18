"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { TEAM_NAME } from "@/lib/team";
import { useActiveTournament } from "@/lib/active-tournament";
import {
  subscribeToTournament,
  type TournamentDoc,
  type PlayerProfile,
} from "@/lib/tournament-db";
import {
  subscribeToOpponents,
  subscribeToSanityAcks,
  setSanityAck,
  subscribeToVersions,
  writeClusterEstimate,
  slugifyTeam,
  estimateStyle,
  clusterLists,
  matchClusterByMember,
  listSimilarity,
  archetypeId,
  BASE_VERSION_ID,
  type OpponentMap,
  type OpponentList,
  type ListCluster,
  type ClusterMember,
  type EstimateCell,
  type SanityAckMap,
  type VersionsNode,
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

// Stable, value-bearing key for a conflict so a check-off can be persisted and
// shared. Including the conflicting values means that if any of them later
// changes, the signature changes too and the conflict re-surfaces for a fresh
// look rather than staying dismissed against numbers that no longer hold.
function sanitySig(parts: (string | number)[]): string {
  return parts.join(":").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const clusterArchId = (c: ListCluster): string =>
  archetypeId({
    faction: c.rep.list.faction,
    detachments: c.rep.list.detachments || [],
    disposition: (c.rep.list.disposition ?? null) as string | null,
  });

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

// Inline-editable estimate value, styled like a BPChip. Commits on blur or
// Enter (only when the number actually changed), so fixing a flagged conflict
// never leaves the /sanity page. Locked = the opponent has been played.
function EditableBP({
  value,
  locked,
  onSave,
}: {
  value: number;
  locked?: boolean;
  onSave: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  // Re-sync the draft when the underlying value changes (e.g. a live save lands)
  // without an effect — React's recommended "adjust state during render".
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    setDraft(String(value));
  }
  const shown = draft === "" ? 0 : Math.max(0, Math.min(20, Number(draft) || 0));
  const s = estimateStyle(shown);
  const commit = () => {
    const next = draft === "" ? null : Math.max(0, Math.min(20, Number(draft) || 0));
    if (next !== value) onSave(next);
  };
  return (
    <input
      type="number"
      min={0}
      max={20}
      value={draft}
      disabled={locked}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      title={locked ? "Låst — holdet er allerede spillet" : "Ret estimatet — gemmes for hele arketypen"}
      className={`w-9 h-6 text-center text-[11px] font-bold rounded border outline-none focus:border-[#a855f7] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${locked ? "cursor-not-allowed opacity-60" : ""}`}
      style={{ background: s.bg, color: s.fg, borderColor: s.border }}
    />
  );
}

// An estimate value a conflict is about, made editable inline. `armyIdx` vs the
// archetype `cluster` — writing reconciles the whole cluster.
interface EditableCell {
  armyIdx: number;
  cluster: ListCluster;
  label: string;
  value: number;
  locked: boolean;
}

interface Finding {
  severity: number; // how far outside tolerance
  sig: string; // stable, value-bearing key for check-offs (see sanitySig)
  text: React.ReactNode;
  players: number[]; // army indices this conflict involves (for player grouping)
  cells: EditableCell[]; // the estimate values in play, for inline editing
}

export default function SanityPage() {
  const [doc, setDoc] = useState<TournamentDoc | null>(null);
  const [opponents, setOpponents] = useState<OpponentMap>({});
  const [acks, setAcks] = useState<SanityAckMap>({});
  const [versions, setVersions] = useState<VersionsNode | null>(null);
  const { activeSlug } = useActiveTournament();

  useEffect(() => {
    try {
      const u1 = subscribeToTournament(activeSlug, setDoc);
      const u2 = subscribeToOpponents(setOpponents, activeSlug, false); // tournament-local field only
      const u3 = subscribeToSanityAcks(setAcks);
      const u4 = subscribeToVersions(setVersions);
      return () => { u1(); u2(); u3(); u4(); };
    } catch {}
  }, [activeSlug]);

  const clusters = useMemo(() => clusterLists(opponents), [opponents]);
  const armies = useMemo(() => doc?.roster?.armies || [], [doc]);

  // Opponents already played this tournament are locked (their lists/estimates
  // are frozen), so a quick edit must skip them — same rule as /estimates.
  const playedSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const r of doc?.rounds || []) {
      if ((r.status === "live" || r.status === "completed") && r.opponentName) {
        set.add(slugifyTeam(r.opponentName));
      }
    }
    return set;
  }, [doc]);

  // Save a corrected estimate for one army vs an archetype — reconciles the
  // whole cluster and version-stamps, so the fix behaves exactly like editing on
  // /estimates. The live subscription re-flows findings, so the conflict clears
  // on its own.
  const saveEstimate = (armyIdx: number, cluster: ListCluster, value: number | null) => {
    writeClusterEstimate({
      ourIdx: armyIdx,
      cluster,
      value,
      currentVersion: versions?.current ?? BASE_VERSION_ID,
      playedSlugs,
      tournamentSlug: activeSlug,
    }).catch(() => {});
  };

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
        cluster = matchClusterByMember(clusters, asList);
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

  // Only archetypes that actually exist at the WTC matter — a cluster is
  // WTC-relevant if any member comes from a real WTC 2026 roster (`wtc: true`).
  // Meta reference lists (ATC/PtG/Listhammer) are prep material, not opponents
  // we'll face, so conflicts involving them are noise.
  const isWtcCluster = useMemo(
    () => (c: ListCluster) => c.members.some((m) => opponents[m.teamSlug]?.wtc),
    [opponents]
  );

  // Archetype pairs similar enough that their estimates should agree. Both sides
  // must be WTC archetypes — we don't care if a meta-only list diverges.
  const similarPairs = useMemo(() => {
    const wtcClusters = clusters.filter(isWtcCluster);
    const pairs: { a: ListCluster; b: ListCluster; sim: number }[] = [];
    for (let i = 0; i < wtcClusters.length; i++) {
      for (let j = i + 1; j < wtcClusters.length; j++) {
        const sim = listSimilarity(wtcClusters[i].rep.list, wtcClusters[j].rep.list);
        if (sim >= SIMILAR_PAIR_MIN) pairs.push({ a: wtcClusters[i], b: wtcClusters[j], sim });
      }
    }
    return pairs;
  }, [clusters, isWtcCluster]);

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
            sig: sanitySig(["mirror", A.idx, B.idx, a, b]),
            players: [A.idx, B.idx],
            cells: [
              { armyIdx: A.idx, cluster: B.cluster!, label: `${A.label} → ${B.archLabel}`, value: a, locked: B.cluster!.members.every((m) => playedSlugs.has(m.teamSlug)) },
              { armyIdx: B.idx, cluster: A.cluster!, label: `${B.label} → ${A.archLabel}`, value: b, locked: A.cluster!.members.every((m) => playedSlugs.has(m.teamSlug)) },
            ],
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
          sig: sanitySig(["self", r.idx, v]),
          players: [r.idx],
          cells: [
            { armyIdx: r.idx, cluster: r.cluster!, label: `${r.label} → egen arketype`, value: v, locked: r.cluster!.members.every((m) => playedSlugs.has(m.teamSlug)) },
          ],
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
          // Order-independent over the two archetypes so the key is stable
          // regardless of how the live clustering orders them.
          const pairKey = [`${clusterArchId(p.a)}=${a}`, `${clusterArchId(p.b)}=${b}`].sort();
          const shortArch = (c: ListCluster) => `${c.rep.list.faction} ${(c.rep.list.detachments || []).join(", ")}`.trim();
          findings.push({
            severity: diff - DIVERGENCE_MAX,
            sig: sanitySig(["similar", r.idx, ...pairKey]),
            players: [r.idx],
            cells: [
              { armyIdx: r.idx, cluster: p.a, label: `${r.label} → ${shortArch(p.a)}`, value: a, locked: p.a.members.every((m) => playedSlugs.has(m.teamSlug)) },
              { armyIdx: r.idx, cluster: p.b, label: `${r.label} → ${shortArch(p.b)}`, value: b, locked: p.b.members.every((m) => playedSlugs.has(m.teamSlug)) },
            ],
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
  }, [resolved, clusterEstimate, similarPairs, playedSlugs]);

  // A conflict is "checked off" when its signature is present in the shared acks
  // node. Acks are kept out of the findings memo so toggling one doesn't recompute
  // every conflict — it only re-styles.
  const isAcked = (f: Finding) => Boolean(acks[f.sig]);
  const outstandingCount = findings.filter((f) => !isAcked(f)).length;
  const ackedCount = findings.length - outstandingCount;

  const toggleAck = (f: Finding) => {
    setSanityAck(f.sig, !isAcked(f)).catch(() => {});
  };

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
        {checkedPairs + checkedSelfs + checkedSimilar === 0 ? (
          <div className="rounded-xl border border-white/[0.08] p-4">
            <p className="text-[12px] text-[#8888a0]">
              Intet at tjekke endnu — spillerne skal vælge deres arketype under{" "}
              <Link href="/player" className="text-[#a855f7] underline">Min side</Link>, og der skal være estimater mod hinandens arketyper.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              <span className={outstandingCount ? "text-[#f87171] font-semibold" : "text-[#4ade80] font-semibold"}>
                {outstandingCount === 0
                  ? "Ingen udestående konflikter — alle estimater er konsistente eller afkrydset"
                  : `${outstandingCount} ${outstandingCount === 1 ? "udestående konflikt" : "udestående konflikter"}`}
              </span>
              {ackedCount > 0 && (
                <span className="text-[#4ade80]/70">· {ackedCount} afkrydset</span>
              )}
              <span className="text-[#8888a0]">· gennemgå spiller for spiller</span>
            </div>
            {resolved.map((r) => {
              // Unchecked conflicts first (by severity), then checked-off ones.
              const pf = findings
                .filter((f) => f.players.includes(r.idx))
                .sort((a, b) => {
                  const aAck = isAcked(a) ? 1 : 0;
                  const bAck = isAcked(b) ? 1 : 0;
                  if (aAck !== bAck) return aAck - bAck;
                  return b.severity - a.severity;
                });
              const outCount = pf.filter((f) => !isAcked(f)).length;
              const ackHere = pf.length - outCount;
              return (
                <div
                  key={r.idx}
                  className={`rounded-xl border p-4 ${
                    outCount
                      ? "border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.03)]"
                      : "border-white/[0.08]"
                  }`}
                >
                  <div className="flex items-baseline gap-2 mb-2 flex-wrap">
                    <span className="text-[11px] text-[#8888a0]">{r.idx + 1}.</span>
                    <h2 className="text-sm font-semibold text-[#e8e8f0]">{r.label}</h2>
                    {r.archLabel && <span className="text-[10px] text-[#8888a0]">{r.archLabel}</span>}
                    <span
                      className={`ml-auto text-[10px] font-semibold ${
                        !r.profile || !r.cluster
                          ? "text-[#facc15]"
                          : outCount
                            ? "text-[#f87171]"
                            : "text-[#4ade80]"
                      }`}
                    >
                      {!r.profile
                        ? "mangler arketype"
                        : !r.cluster
                          ? "matcher ikke feltet"
                          : outCount
                            ? `${outCount} konflikt${outCount === 1 ? "" : "er"}${ackHere ? ` · ${ackHere} afkrydset` : ""}`
                            : ackHere
                              ? `✓ ${ackHere} afkrydset`
                              : "✓ ingen konflikter"}
                    </span>
                  </div>
                  {!r.profile ? (
                    <p className="text-[11px] text-[#facc15]">
                      ⚠ Har ikke valgt sin arketype — vælg den på{" "}
                      <Link href="/player" className="underline">Min side</Link>.
                    </p>
                  ) : !r.cluster ? (
                    <p className="text-[11px] text-[#facc15]">
                      ⚠ Arketypen matcher ikke feltet længere — vælg en ny på{" "}
                      <Link href="/player" className="underline">Min side</Link>.
                    </p>
                  ) : pf.length === 0 ? (
                    <p className="text-[11px] text-[#8888a0]">Alle tjekkede estimater er konsistente.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {pf.map((f) => {
                        const acked = isAcked(f);
                        return (
                          <div
                            key={f.sig}
                            className={`rounded-lg border px-3 py-2 text-[12px] leading-relaxed flex items-start gap-3 ${
                              acked
                                ? "border-l-2 border-l-[#4ade80] border-y border-r border-y-[rgba(74,222,128,0.2)] border-r-[rgba(74,222,128,0.2)] bg-[rgba(74,222,128,0.06)]"
                                : "border border-white/[0.06]"
                            }`}
                          >
                            <div className="flex-1 min-w-0 flex items-start gap-2">
                              {acked && (
                                <span
                                  className="shrink-0 mt-[1px] text-[10px] font-bold text-[#4ade80]"
                                  aria-label="Afkrydset som OK"
                                  title="Afkrydset som OK"
                                >
                                  ✓
                                </span>
                              )}
                              <div className={acked ? "opacity-60" : ""}>
                                {f.text}
                                {f.cells.length > 0 && (
                                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                    {f.cells.map((c, i) => (
                                      <span key={i} className="inline-flex items-center gap-1.5 text-[10px] text-[#8888a0]">
                                        <span className="whitespace-nowrap">{c.label}</span>
                                        <EditableBP
                                          value={c.value}
                                          locked={c.locked}
                                          onSave={(v) => saveEstimate(c.armyIdx, c.cluster, v)}
                                        />
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleAck(f)}
                              title={
                                acked
                                  ? "Afkrydset som OK — klik for at vise som konflikt igen"
                                  : "Marker konflikten som set og i orden"
                              }
                              className={`shrink-0 self-start rounded border px-2 py-1 text-[10px] font-semibold whitespace-nowrap transition-colors ${
                                acked
                                  ? "border-[rgba(74,222,128,0.4)] bg-[rgba(74,222,128,0.12)] text-[#4ade80] hover:bg-transparent hover:border-white/20 hover:text-[#8888a0]"
                                  : "border-white/[0.14] text-[#a8a8b8] hover:border-white/30 hover:text-[#e8e8f0] hover:bg-white/[0.04]"
                              }`}
                            >
                              {acked ? "✓ OK · fortryd" : "Ser rigtigt ud"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
