"use client";

import { useState, useEffect, useMemo } from "react";
import { TEAM_NAME } from "@/lib/team";
import { useActiveTournament } from "@/lib/active-tournament";
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

  const { activeSlug, activeFieldSlug } = useActiveTournament();
  useEffect(() => {
    try {
      const u1 = subscribeToOpponents(setOpponents, activeSlug, false, activeFieldSlug); // tournament-local field only
      const u2 = subscribeToTournament(activeSlug, setDoc);
      return () => { u1(); u2(); };
    } catch {}
  }, [activeSlug, activeFieldSlug]);

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

    // archetypes (clusters) over the wtc field only, ranked by size with the
    // running cumulative share — so we can name the core that makes up the field.
    const wtcMap: OpponentMap = Object.fromEntries(wtcEntries);
    const clusters = clusterLists(wtcMap);
    const clusteredTotal = clusters.reduce((a, c) => a + c.members.length, 0) || 1;
    let cumRun = 0;
    const rankedArchetypes = [...clusters]
      .sort((a, b) => b.members.length - a.members.length)
      .map((c, i) => {
        cumRun += c.members.length;
        return {
          rank: i + 1,
          faction: c.rep.list.faction,
          label: `${c.rep.list.faction} — ${(c.rep.list.detachments || []).join(", ")}`,
          disp: c.rep.list.disposition,
          n: c.members.length,
          pct: Math.round((100 * c.members.length) / clusteredTotal),
          cumPct: Math.round((100 * cumRun) / clusteredTotal),
        };
      });
    const idx50 = rankedArchetypes.findIndex((a) => a.cumPct >= 50);
    const archsFor50 = idx50 >= 0 ? idx50 + 1 : rankedArchetypes.length;
    const coreArchetypes = rankedArchetypes.slice(0, archsFor50);
    const singletonArchetypes = rankedArchetypes.filter((a) => a.n === 1).length;

    const avgUnits = listsWithUnits.length
      ? Math.round((listsWithUnits.reduce((s, l) => s + (l.units?.length || 0), 0) / listsWithUnits.length) * 10) / 10
      : 0;

    // --- Meta concentration & diversity ---
    // Effective number of factions (inverse Simpson): how many *evenly-common*
    // factions the field plays like — collapses "18 factions but 3 dominate".
    const p = factions.map(([, n]) => n / listCount);
    const effFactions = p.length ? Math.round((1 / p.reduce((a, x) => a + x * x, 0)) * 10) / 10 : 0;
    const top5Share = Math.round((100 * factions.slice(0, 5).reduce((a, [, n]) => a + n, 0)) / (listCount || 1));
    const singletonFactions = factions.filter(([, n]) => n === 1).length;

    // --- Team "spice": netlisted vs tech ---
    // For each list, how many OTHER field lists share its archetype (cluster−1).
    // Averaged over a team's 8 lists → low = brings unique tech, high = all netlists.
    const sizeByKey = new Map<string, number>();
    for (const c of clusters) for (const m of c.members) sizeByKey.set(`${m.teamSlug}_${m.listIdx}`, c.members.length);
    const teamSpice = wtcEntries.map(([slug, t]) => {
      const armies = t.armies || [];
      let echoSum = 0, uniq = 0, counted = 0;
      armies.forEach((_, idx) => {
        const sz = sizeByKey.get(`${slug}_${idx}`);
        if (sz == null) return;
        echoSum += sz - 1;
        if (sz === 1) uniq++;
        counted++;
      });
      return { name: t.name, tier: t.tier || "", echo: counted ? echoSum / counted : 0, uniq, n: counted };
    }).filter((x) => x.n > 0);
    const spiciest = [...teamSpice].sort((a, b) => a.echo - b.echo || b.uniq - a.uniq).slice(0, 6);
    const chalkiest = [...teamSpice].sort((a, b) => b.echo - a.echo).slice(0, 6);
    const maxEcho = Math.max(1, ...teamSpice.map((x) => x.echo));

    // --- Signature detachment per faction ---
    // When you see a faction, which detachment does it most often bring, and how
    // locked-in is that choice? Predictive prep value.
    const factionSignature = factions.slice(0, 14).map(([f, total]) => {
      const fLists = lists.filter((l) => l.faction === f);
      const dc = new Map<string, number>();
      for (const l of fLists) for (const d of new Set(l.detachments || [])) dc.set(d, (dc.get(d) || 0) + 1);
      const top = [...dc.entries()].sort((a, b) => b[1] - a[1])[0];
      return top ? { faction: f, total, det: top[0], share: Math.round((100 * top[1]) / (fLists.length || 1)), distinct: dc.size } : null;
    }).filter((x): x is { faction: string; total: number; det: string; share: number; distinct: number } => !!x);

    // --- Top-seed tech: what Tier-1 teams over/under-index on vs the field (lift) ---
    const tier1Entries = wtcEntries.filter(([, t]) => /tier\s*1\b/i.test(t.tier || ""));
    const tier1Lists = tier1Entries.flatMap(([, t]) => t.armies || []);
    const t1Faction = new Map<string, number>();
    for (const l of tier1Lists) if (l.faction) t1Faction.set(l.faction, (t1Faction.get(l.faction) || 0) + 1);
    const fieldRate = new Map(factions.map(([f, n]) => [f, n / listCount]));
    const tier1Lift = tier1Lists.length
      ? [...t1Faction.entries()]
          .map(([f, n]) => ({ faction: f, n, share: Math.round((100 * n) / tier1Lists.length), lift: (n / tier1Lists.length) / (fieldRate.get(f) || 1) }))
          .filter((x) => x.n >= 2)
          .sort((a, b) => b.lift - a.lift)
      : [];
    const tier1Over = tier1Lift.slice(0, 6);
    const tier1Under = [...tier1Lift].reverse().filter((x) => x.lift < 1).slice(0, 5);

    return {
      teams, listCount, factions, alliance, disp, factionDisp, dispFaction, compositions, detachments, units, clusters, rankedArchetypes, coreArchetypes, avgUnits, listsWithUnits: listsWithUnits.length,
      effFactions, top5Share, singletonFactions, singletonArchetypes, archsFor50, clusteredTotal,
      spiciest, chalkiest, maxEcho, factionSignature,
      tier1Count: tier1Entries.length, tier1Over, tier1Under,
    };
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

            <Card title="Metaens koncentration" desc="hvor bredt eller smalt feltet spiller">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { v: s.effFactions, k: "Effektive factions", cap: `af ${s.factions.length} i spil` },
                  { v: `${s.top5Share}%`, k: "Top-5 factions", cap: "af alle lister" },
                  { v: s.archsFor50, k: "Arketyper = ½ felt", cap: `af ${s.clusters.length} i alt` },
                  { v: s.singletonArchetypes, k: "Engangs-arketyper", cap: "kun set én gang" },
                  { v: s.singletonFactions, k: "Engangs-factions", cap: "kun bragt én gang" },
                ].map((t) => (
                  <div key={t.k} className="rounded-lg bg-white/[0.03] p-2.5 text-center">
                    <div className="text-xl font-bold text-[#e8e8f0] tabular-nums">{t.v}</div>
                    <div className="text-[9px] text-[#c8c8d4] mt-0.5 leading-tight">{t.k}</div>
                    <div className="text-[8px] text-[#8888a0] mt-0.5">{t.cap}</div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[#8888a0] mt-3 leading-relaxed">
                Feltet spiller reelt som ~{s.effFactions} jævnt fordelte factions, og blot {s.archsFor50} arketyper dækker halvdelen af alle lister —
                resten er den lange hale af {s.singletonArchetypes} engangs-lister, som er den tech I kun møder én gang.
              </p>
            </Card>

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

            <Card title="Signatur-detachment per faction" desc="ser du factionen, hvilket detachment er den så oftest?">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                {s.factionSignature.map((fs) => (
                  <div key={fs.faction} className="flex items-center gap-2 text-[11px]">
                    <div className="w-32 shrink-0 truncate text-[#e8e8f0]" title={fs.faction}>{fs.faction}</div>
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      <div className="flex-1 h-3.5 rounded bg-white/[0.04] overflow-hidden relative">
                        <div className="h-full rounded" style={{ width: `${fs.share}%`, background: GROUP_COLORS[getGroupForFaction(fs.faction) || ""] || "#a855f7", opacity: 0.8 }} />
                        <span className="absolute inset-0 flex items-center px-1.5 text-[9px] text-[#e8e8f0] truncate" title={fs.det}>{fs.det}</span>
                      </div>
                      <span className="w-8 shrink-0 text-right tabular-nums text-[#e8e8f0] font-semibold">{fs.share}%</span>
                      <span className="w-12 shrink-0 text-[8px] text-[#8888a0]" title="antal forskellige detachments factionen kører">{fs.distinct} det.</span>
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Card title="Krydderi-indeks" desc="bringer holdet tech eller netlister? (gns. felt-ekko pr. liste)">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-semibold text-[#4ade80] mb-1.5 uppercase tracking-wide">Mest unikke · tech</div>
                    <div className="space-y-1">
                      {s.spiciest.map((t) => (
                        <div key={t.name} className="flex items-center gap-2 text-[11px]">
                          <div className="w-24 shrink-0 truncate text-[#e8e8f0]" title={t.name}>{t.name}</div>
                          <div className="flex-1 h-3.5 rounded bg-white/[0.04] overflow-hidden">
                            <div className="h-full rounded" style={{ width: `${(100 * t.echo) / s.maxEcho}%`, background: "#4ade80", opacity: 0.65 }} />
                          </div>
                          <span className="w-8 shrink-0 text-right tabular-nums text-[#e8e8f0]">{t.echo.toFixed(1)}</span>
                          <span className="w-9 shrink-0 text-[8px] text-[#8888a0]" title="antal engangs-lister">{t.uniq} unik</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-[#f87171] mb-1.5 uppercase tracking-wide">Mest forudsigelige · netliste</div>
                    <div className="space-y-1">
                      {s.chalkiest.map((t) => (
                        <div key={t.name} className="flex items-center gap-2 text-[11px]">
                          <div className="w-24 shrink-0 truncate text-[#e8e8f0]" title={t.name}>{t.name}</div>
                          <div className="flex-1 h-3.5 rounded bg-white/[0.04] overflow-hidden">
                            <div className="h-full rounded" style={{ width: `${(100 * t.echo) / s.maxEcho}%`, background: "#f87171", opacity: 0.65 }} />
                          </div>
                          <span className="w-8 shrink-0 text-right tabular-nums text-[#e8e8f0]">{t.echo.toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-[9px] text-[#8888a0] mt-2.5 leading-relaxed">
                  Felt-ekko = gns. antal andre hold der bringer samme arketype som holdets lister. Lavt = off-meta tech (svært at forberede), højt = konsensus-lister I kender.
                </p>
              </Card>

              <Card title="Top-seed-tech" desc={s.tier1Count ? `hvad Tier 1-hold (${s.tier1Count}) over-/undervægter vs feltet` : "ingen Tier 1-hold i feltet"}>
                {s.tier1Over.length ? (
                  <>
                    <div className="text-[10px] font-semibold text-[#60a5fa] mb-1.5 uppercase tracking-wide">Overvægtet af top-seeds</div>
                    <div className="space-y-1">
                      {s.tier1Over.map((t) => (
                        <div key={t.faction} className="flex items-center gap-2 text-[11px]">
                          <div className="w-32 shrink-0 truncate text-[#e8e8f0]" title={t.faction}>{t.faction}</div>
                          <div className="flex-1 h-3.5 rounded bg-white/[0.04] overflow-hidden">
                            <div className="h-full rounded" style={{ width: `${Math.min(100, (t.lift / 3) * 100)}%`, background: GROUP_COLORS[getGroupForFaction(t.faction) || ""] || "#60a5fa", opacity: 0.75 }} />
                          </div>
                          <span className="w-9 shrink-0 text-right tabular-nums text-[#e8e8f0] font-semibold">{t.lift.toFixed(1)}×</span>
                          <span className="w-8 shrink-0 text-[8px] text-[#8888a0]">{t.share}%</span>
                        </div>
                      ))}
                    </div>
                    {s.tier1Under.length > 0 && (
                      <>
                        <div className="text-[10px] font-semibold text-[#8888a0] mt-3 mb-1.5 uppercase tracking-wide">Undervægtet</div>
                        <div className="flex flex-wrap gap-1.5">
                          {s.tier1Under.map((t) => (
                            <span key={t.faction} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-[#8888a0]">
                              {t.faction} <span className="text-[#c8c8d4] tabular-nums">{t.lift.toFixed(1)}×</span>
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    <p className="text-[9px] text-[#8888a0] mt-2.5 leading-relaxed">
                      Lift = hvor meget oftere Tier 1-hold bringer factionen ift. hele feltet. 2,0× = dobbelt så hyppigt hos top-seeds.
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] text-[#8888a0]">Ikke nok Tier 1-data i feltet.</p>
                )}
              </Card>
            </div>

            <Card
              title="Feltets rygrad"
              desc={`de ${s.coreArchetypes.length} arketyper der tilsammen udgør halvdelen af alle ${s.clusters.length} — kernen I skal kunne svare på`}
            >
              <DispLegend />
              <div className="flex items-center gap-2 text-[9px] text-[#8888a0] uppercase tracking-wide mb-1 pb-1 border-b border-white/[0.06]">
                <span className="w-5 shrink-0 text-right">#</span>
                <span className="w-48 shrink-0">Arketype</span>
                <span className="flex-1">Andel af feltet</span>
                <span className="w-6 shrink-0 text-right">Lst</span>
                <span className="w-11 shrink-0 text-right">Kumul.</span>
              </div>
              <div className="space-y-0.5">
                {s.coreArchetypes.map((a) => {
                  const color = a.disp ? DISP_STYLES[a.disp as Disposition].color : "#a855f7";
                  const isLast = a.rank === s.coreArchetypes.length;
                  return (
                    <div key={a.rank} className={`flex items-center gap-2 text-[11px] rounded px-1 ${isLast ? "bg-[#4ade80]/[0.08]" : ""}`}>
                      <span className="w-5 shrink-0 text-right tabular-nums text-[#8888a0]">{a.rank}</span>
                      <div className="w-48 shrink-0 truncate text-[#e8e8f0] flex items-center gap-1" title={a.disp ? `${a.label} · ${a.disp}` : a.label}>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                        <span className="truncate">{a.label}{a.disp && <span className="text-[#8888a0]"> · {a.disp}</span>}</span>
                      </div>
                      <div className="flex-1 h-3.5 rounded bg-white/[0.04] overflow-hidden">
                        <div className="h-full rounded" style={{ width: `${(100 * a.n) / (s.coreArchetypes[0]?.n || 1)}%`, background: color, opacity: 0.85 }} />
                      </div>
                      <span className="w-6 shrink-0 text-right tabular-nums text-[#e8e8f0] font-semibold">{a.n}</span>
                      <span className={`w-11 shrink-0 text-right tabular-nums font-semibold ${isLast ? "text-[#4ade80]" : "text-[#8888a0]"}`}>{a.cumPct}%</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-[#8888a0] mt-3 leading-relaxed">
                Disse {s.coreArchetypes.length} arketyper dækker ~{s.coreArchetypes[s.coreArchetypes.length - 1]?.cumPct}% af feltet.
                De øvrige {s.clusters.length - s.coreArchetypes.length} deles om den anden halvdel — mest engangs-tech I højst møder én gang.
              </p>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
