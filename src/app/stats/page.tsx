"use client";

import { useState, useEffect, useMemo } from "react";
import { TEAM_SLUG, TEAM_NAME } from "@/lib/team";
import { subscribeToTournament, type TournamentDoc } from "@/lib/tournament-db";
import {
  subscribeToOpponents,
  clusterLists,
  type OpponentMap,
  type OpponentList,
} from "@/lib/estimates-db";
import { DISP_STYLES, DISPOSITIONS, getGroupForFaction, type Disposition } from "@/lib/data";

const GROUP_COLORS: Record<string, string> = {
  "Space Marines": "#60a5fa",
  Imperial: "#facc15",
  Chaos: "#f87171",
  Xenos: "#4ade80",
};

// A horizontal ranked bar row.
function Bar({ label, value, max, pct, color, sub }: { label: string; value: number; max: number; pct?: number; color?: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <div className="w-40 shrink-0 truncate text-[#e8e8f0]" title={label}>{label}</div>
      <div className="flex-1 h-4 rounded bg-white/[0.04] overflow-hidden relative">
        <div className="h-full rounded" style={{ width: `${max ? (100 * value) / max : 0}%`, background: color || "#a855f7", opacity: 0.85 }} />
      </div>
      <div className="w-16 shrink-0 text-right tabular-nums text-[#8888a0]">
        <span className="text-[#e8e8f0] font-semibold">{value}</span>
        {pct !== undefined && <span className="ml-1 text-[9px]">{pct}%</span>}
      </div>
      {sub && <div className="w-10 shrink-0 text-[9px] text-[#8888a0]">{sub}</div>}
    </div>
  );
}

// A stacked horizontal bar: total width ∝ total/max, segments coloured by disposition.
function StackedBar({ label, breakdown, total, max }: { label: string; breakdown: Record<string, number>; total: number; max: number }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <div className="w-40 shrink-0 truncate text-[#e8e8f0]" title={label}>{label}</div>
      <div className="flex-1 h-4 rounded bg-white/[0.04] overflow-hidden flex" style={{ width: `${max ? (100 * total) / max : 0}%` }}>
        {DISPOSITIONS.filter((d) => breakdown[d]).map((d) => (
          <div
            key={d}
            className="h-full first:rounded-l last:rounded-r"
            style={{ width: `${(100 * breakdown[d]) / total}%`, background: DISP_STYLES[d as Disposition].color, opacity: 0.85 }}
            title={`${breakdown[d]}× ${d}`}
          />
        ))}
      </div>
      <div className="w-8 shrink-0 text-right tabular-nums text-[#e8e8f0] font-semibold">{total}</div>
    </div>
  );
}

function DispLegend() {
  return (
    <div className="flex items-center gap-2 flex-wrap mb-2">
      {DISPOSITIONS.map((d) => (
        <span key={d} className="flex items-center gap-1 text-[9px] text-[#8888a0]">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: DISP_STYLES[d as Disposition].color }} />
          {d}
        </span>
      ))}
    </div>
  );
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.08] p-4">
      <div className="flex items-baseline gap-2 mb-3 flex-wrap">
        <h2 className="text-sm font-semibold text-[#e8e8f0]">{title}</h2>
        {desc && <span className="text-[10px] text-[#8888a0]">{desc}</span>}
      </div>
      {children}
    </div>
  );
}

export default function StatsPage() {
  const [opponents, setOpponents] = useState<OpponentMap>({});
  const [doc, setDoc] = useState<TournamentDoc | null>(null);

  useEffect(() => {
    try {
      const u1 = subscribeToOpponents(setOpponents);
      const u2 = subscribeToTournament(TEAM_SLUG, setDoc);
      return () => { u1(); u2(); };
    } catch {}
  }, []);

  const stats = useMemo(() => {
    // Real WTC 2026 field: teams flagged wtc + our own roster.
    const wtcEntries = Object.entries(opponents).filter(([, t]) => t.wtc);
    type Team = { name: string; armies: OpponentList[] };
    const teams: Team[] = wtcEntries.map(([, t]) => ({ name: t.name, armies: t.armies || [] }));
    const roster = doc?.roster?.armies || [];
    if (roster.length) teams.push({ name: TEAM_NAME, armies: roster.map((a) => ({ faction: a.faction, detachments: a.detachments, disposition: a.disposition })) });

    const lists = teams.flatMap((t) => t.armies);
    const listCount = lists.length;

    // faction counts
    const faction = new Map<string, number>();
    for (const l of lists) if (l.faction) faction.set(l.faction, (faction.get(l.faction) || 0) + 1);
    const factions = [...faction.entries()].sort((a, b) => b[1] - a[1]);

    // grand alliance
    const alliance = new Map<string, number>();
    for (const l of lists) { const g = getGroupForFaction(l.faction) || "?"; alliance.set(g, (alliance.get(g) || 0) + 1); }

    // disposition counts
    const disp = new Map<string, number>();
    for (const l of lists) if (l.disposition) disp.set(l.disposition, (disp.get(l.disposition) || 0) + 1);

    // faction × disposition: per faction, how its lists split across dispositions
    const factionDisp = factions.map(([f, total]) => {
      const b: Record<string, number> = {};
      for (const l of lists) if (l.faction === f && l.disposition) b[l.disposition] = (b[l.disposition] || 0) + 1;
      const top = DISPOSITIONS.map((d) => [d, b[d] || 0] as const).sort((a, b2) => b2[1] - a[1])[0];
      return { faction: f, total, b, topDisp: top && top[1] > 0 ? top[0] : null };
    });
    // disposition × faction: top factions running each disposition
    const dispFaction = DISPOSITIONS.map((d) => {
      const b = new Map<string, number>();
      for (const l of lists) if (l.disposition === d && l.faction) b.set(l.faction, (b.get(l.faction) || 0) + 1);
      return { disp: d, total: disp.get(d) || 0, factions: [...b.entries()].sort((a, b2) => b2[1] - a[1]) };
    });

    // disposition compositions per team (multiset of the team's 8 dispositions)
    const comp = new Map<string, { count: number; breakdown: Record<string, number> }>();
    for (const t of teams) {
      const b: Record<string, number> = {};
      for (const a of t.armies) if (a.disposition) b[a.disposition] = (b[a.disposition] || 0) + 1;
      const key = DISPOSITIONS.map((d) => `${d}:${b[d] || 0}`).join("|");
      const e = comp.get(key) || { count: 0, breakdown: b };
      e.count++;
      comp.set(key, e);
    }
    const compositions = [...comp.values()].sort((a, b) => b.count - a.count);

    // detachments
    const det = new Map<string, number>();
    for (const l of lists) for (const d of l.detachments || []) det.set(d, (det.get(d) || 0) + 1);
    const detachments = [...det.entries()].sort((a, b) => b[1] - a[1]);

    // units — prevalence (# lists containing), from lists that have unit data
    const listsWithUnits = lists.filter((l) => l.units?.length);
    const unit = new Map<string, number>();
    for (const l of listsWithUnits) for (const u of new Set(l.units)) unit.set(u, (unit.get(u) || 0) + 1);
    const units = [...unit.entries()].sort((a, b) => b[1] - a[1]);

    // archetypes (clusters) over the wtc field only
    const wtcMap: OpponentMap = Object.fromEntries(wtcEntries);
    const clusters = clusterLists(wtcMap);
    const topArchetypes = [...clusters]
      .sort((a, b) => b.members.length - a.members.length)
      .map((c) => ({
        label: `${c.rep.list.faction} — ${(c.rep.list.detachments || []).join(", ")}`,
        disp: c.rep.list.disposition,
        n: c.members.length,
      }));

    const avgUnits = listsWithUnits.length
      ? Math.round((listsWithUnits.reduce((s, l) => s + (l.units?.length || 0), 0) / listsWithUnits.length) * 10) / 10
      : 0;

    return { teams, listCount, factions, alliance, disp, factionDisp, dispFaction, compositions, detachments, units, clusters, topArchetypes, avgUnits, listsWithUnits: listsWithUnits.length };
  }, [opponents, doc]);

  const s = stats;
  const noData = s.teams.length === 0;

  return (
    <>
      <header className="px-4 sm:px-6 py-4 border-b border-white/[0.08] sticky top-12 bg-[#0f0f13] z-20">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-[#e8e8f0] tracking-tight">
            Statistik
            <span className="text-[#4ade80] ml-2 text-sm font-normal">— WTC 2026 felt</span>
          </h1>
          <span className="text-[11px] text-[#8888a0]">
            {s.teams.length} hold · {s.listCount} lister · {s.clusters.length} arketyper
          </span>
        </div>
        <p className="text-[10px] text-[#8888a0] mt-1">
          Meta-overblik over hele WTC 2026-feltet (inkl. {TEAM_NAME}). Enheds-statistik dækker de {s.listsWithUnits} lister med indsat liste-indhold.
        </p>
      </header>

      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
        {noData ? (
          <p className="text-[11px] text-[#8888a0]">Ingen WTC-hold indlæst endnu.</p>
        ) : (
          <>
            {/* Summary tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { k: "Hold", v: s.teams.length },
                { k: "Lister", v: s.listCount },
                { k: "Distinkte arketyper", v: s.clusters.length },
                { k: "Gns. enheder/liste", v: s.avgUnits },
              ].map((t) => (
                <div key={t.k} className="rounded-xl border border-white/[0.08] p-3 text-center">
                  <div className="text-2xl font-bold text-[#e8e8f0] tabular-nums">{t.v}</div>
                  <div className="text-[10px] text-[#8888a0] uppercase tracking-wider mt-0.5">{t.k}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Card title="Factions" desc={`${s.factions.length} forskellige · antal lister`}>
                <div className="space-y-1">
                  {s.factions.map(([f, n]) => (
                    <Bar key={f} label={f} value={n} max={s.factions[0][1]} pct={Math.round((100 * n) / s.listCount)}
                      color={GROUP_COLORS[getGroupForFaction(f) || ""] || "#a855f7"} />
                  ))}
                </div>
              </Card>

              <div className="space-y-5">
                <Card title="Dispositioner" desc="hvor ofte hver blev valgt">
                  <div className="space-y-1">
                    {DISPOSITIONS.map((d) => {
                      const n = s.disp.get(d) || 0;
                      const max = Math.max(...DISPOSITIONS.map((x) => s.disp.get(x) || 0));
                      return <Bar key={d} label={d} value={n} max={max} pct={Math.round((100 * n) / s.listCount)} color={DISP_STYLES[d as Disposition].color} />;
                    })}
                  </div>
                </Card>

                <Card title="Grand alliance" desc="fordeling af feltet">
                  <div className="space-y-1">
                    {[...s.alliance.entries()].sort((a, b) => b[1] - a[1]).map(([g, n]) => (
                      <Bar key={g} label={g} value={n} max={Math.max(...s.alliance.values())} pct={Math.round((100 * n) / s.listCount)} color={GROUP_COLORS[g] || "#a855f7"} />
                    ))}
                  </div>
                </Card>
              </div>
            </div>

            <Card title="Faction × disposition" desc="hvilken disposition hver faction typisk bringer (bredde = antal lister)">
              <DispLegend />
              <div className="space-y-1">
                {s.factionDisp.map((fd) => (
                  <StackedBar key={fd.faction} label={fd.faction} breakdown={fd.b} total={fd.total} max={s.factions[0][1]} />
                ))}
              </div>
            </Card>

            <Card title="Disposition × faction" desc="hvilke factions oftest bringer hver disposition">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {s.dispFaction.map((df) => (
                  <div key={df.disp}>
                    <div className="text-[11px] font-semibold mb-1" style={{ color: DISP_STYLES[df.disp as Disposition].color }}>
                      {df.disp} <span className="text-[#8888a0] font-normal">· {df.total}</span>
                    </div>
                    <div className="space-y-0.5">
                      {df.factions.slice(0, 6).map(([f, n]) => (
                        <div key={f} className="flex items-center gap-1.5 text-[10px]">
                          <div className="flex-1 h-3 rounded bg-white/[0.04] overflow-hidden">
                            <div className="h-full rounded" style={{ width: `${(100 * n) / (df.factions[0]?.[1] || 1)}%`, background: DISP_STYLES[df.disp as Disposition].color, opacity: 0.7 }} />
                          </div>
                          <span className="w-28 shrink-0 truncate text-[#8888a0]" title={f}>{f}</span>
                          <span className="w-5 shrink-0 text-right tabular-nums text-[#e8e8f0]">{n}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Populære disposition-sammensætninger" desc="hvordan hold fordeler deres 8 lister på dispositioner">
              <div className="space-y-2">
                {s.compositions.slice(0, 10).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold text-[#e8e8f0] w-6 tabular-nums">{c.count}×</span>
                    <div className="flex gap-1 flex-wrap flex-1">
                      {DISPOSITIONS.filter((d) => c.breakdown[d]).map((d) => (
                        <span key={d} className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: DISP_STYLES[d as Disposition].bg, color: DISP_STYLES[d as Disposition].color }}>
                          {c.breakdown[d]}× {d}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Card title="Mest spillede detachments" desc="top 20">
                <div className="space-y-1">
                  {s.detachments.slice(0, 20).map(([d, n]) => (
                    <Bar key={d} label={d} value={n} max={s.detachments[0][1]} />
                  ))}
                </div>
              </Card>

              <Card title="Mest spillede enheder" desc={`top 25 · antal lister der kører enheden (af ${s.listsWithUnits})`}>
                <div className="space-y-1">
                  {s.units.slice(0, 25).map(([u, n]) => (
                    <Bar key={u} label={u} value={n} max={s.units[0]?.[1] || 1} pct={Math.round((100 * n) / (s.listsWithUnits || 1))} />
                  ))}
                </div>
              </Card>
            </div>

            <Card title="Største arketyper" desc="top 20 klynger på tværs af feltet (≥75% lighed)">
              <div className="space-y-1">
                {s.topArchetypes.slice(0, 20).map((a, i) => (
                  <Bar
                    key={i}
                    label={a.label}
                    value={a.n}
                    max={s.topArchetypes[0]?.n || 1}
                    color={a.disp ? DISP_STYLES[a.disp as Disposition].color : "#a855f7"}
                    sub={a.disp ? a.disp.slice(0, 4) : ""}
                  />
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
