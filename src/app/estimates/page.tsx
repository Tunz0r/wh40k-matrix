"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { deserializeRoster, type RosterArmy } from "@/lib/roster";
import { subscribeToTournament, type TournamentDoc } from "@/lib/tournament-db";
import { TEAM_SLUG, TEAM_NAME } from "@/lib/team";
import {
  type OpponentMap,
  type OpponentTeam,
  type EstimateCell,
  slugifyTeam,
  subscribeToOpponents,
  saveOpponentTeam,
  deleteOpponentTeam,
  writeEstimateCells,
  listSimilarity,
  SIMILARITY_THRESHOLD,
  estimateStyle,
} from "@/lib/estimates-db";

const OTHER_TIER = "Andre hold";

function shortFaction(name: string): string {
  return name.length > 14 ? name.slice(0, 13) + "…" : name;
}

function EstimateInput({
  cell,
  onChange,
  locked,
}: {
  cell: EstimateCell | undefined;
  onChange: (v: number | null) => void;
  locked?: boolean;
}) {
  const style = cell ? estimateStyle(cell.v) : null;
  return (
    <div className="relative">
      <input
        type="number"
        min={0}
        max={20}
        value={cell?.v ?? ""}
        disabled={locked}
        onChange={(e) => {
          if (e.target.value === "") { onChange(null); return; }
          onChange(Math.max(0, Math.min(20, Number(e.target.value) || 0)));
        }}
        className={`w-11 h-9 text-center text-[13px] font-bold rounded border outline-none focus:border-[#a855f7] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${cell?.auto ? "opacity-70" : ""} ${locked ? "cursor-not-allowed opacity-60" : ""}`}
        style={
          style
            ? { background: style.bg, color: style.fg, borderColor: style.border }
            : { background: "#1a1a22", color: "#e8e8f0", borderColor: "rgba(255,255,255,0.14)" }
        }
        title={locked ? "Låst — holdet er allerede spillet" : cell?.auto ? "Auto-udfyldt fra lignende liste — skriv for at overstyre" : undefined}
      />
      {cell?.auto && (
        <span className="absolute top-0.5 right-1 text-[8px] text-[#8888a0] pointer-events-none">a</span>
      )}
    </div>
  );
}

export default function EstimatesPage() {
  const [opponents, setOpponents] = useState<OpponentMap>({});
  const [fbDoc, setFbDoc] = useState<TournamentDoc | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [importFor, setImportFor] = useState<{ name: string; tier: string } | null>(null);
  const [importText, setImportText] = useState("");
  const [newTeamName, setNewTeamName] = useState("");

  useEffect(() => {
    try {
      const unsub1 = subscribeToOpponents(setOpponents);
      const unsub2 = subscribeToTournament(TEAM_SLUG, setFbDoc);
      return () => { unsub1(); unsub2(); };
    } catch {}
  }, []);

  const ourArmies: RosterArmy[] = useMemo(
    () => fbDoc?.roster?.armies || [],
    [fbDoc]
  );

  // Opponents we've already played (round live or completed) are locked:
  // their estimates are the historical record and can't be changed.
  const playedRounds = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of fbDoc?.rounds || []) {
      if ((r.status === "live" || r.status === "completed") && r.opponentName) {
        const slug = slugifyTeam(r.opponentName);
        if (!map.has(slug)) map.set(slug, r.number);
      }
    }
    return map;
  }, [fbDoc]);

  // Seeding tiers drive the grouping; stored teams not in seeding go under "Andre hold".
  const tiers = useMemo(() => {
    const seedingTiers = (fbDoc?.seedingTiers || []).map((t) => ({
      name: t.name,
      teams: (t.teams || []).filter(
        (team) => !TEAM_NAME.toLowerCase().includes(team.toLowerCase())
      ),
    }));
    const seededSlugs = new Set(
      seedingTiers.flatMap((t) => t.teams.map((team) => slugifyTeam(team)))
    );
    const others = Object.entries(opponents)
      .filter(([slug]) => !seededSlugs.has(slug))
      .map(([, team]) => team.name);
    return [...seedingTiers, { name: OTHER_TIER, teams: others }].filter(
      (t) => t.teams.length > 0 || t.name !== OTHER_TIER
    );
  }, [fbDoc, opponents]);

  const totals = useMemo(() => {
    let teams = 0, cells = 0, manual = 0, auto = 0;
    for (const team of Object.values(opponents)) {
      if (!team.armies?.length) continue;
      teams++;
      cells += ourArmies.length * team.armies.length;
      for (const cell of Object.values(team.estimates || {})) {
        if (cell.auto) auto++;
        else manual++;
      }
    }
    return { teams, cells, manual, auto };
  }, [opponents, ourArmies]);

  // Prefill a new team's estimates from manual cells on similar lists across the field.
  function buildAutoEstimates(armies: RosterArmy[]): Record<string, EstimateCell> {
    const result: Record<string, EstimateCell> = {};
    for (let i = 0; i < ourArmies.length; i++) {
      armies.forEach((list, j) => {
        let best: { sim: number; v: number } | null = null;
        for (const team of Object.values(opponents)) {
          (team.armies || []).forEach((other, k) => {
            const cell = team.estimates?.[`${i}_${k}`];
            if (!cell || cell.auto) return;
            const sim = listSimilarity(list, other);
            if (sim < SIMILARITY_THRESHOLD) return;
            if (!best || sim > best.sim) best = { sim, v: cell.v };
          });
        }
        if (best) result[`${i}_${j}`] = { v: (best as { v: number }).v, auto: true };
      });
    }
    return result;
  }

  function confirmImport() {
    if (!importFor) return;
    const slug = slugifyTeam(importFor.name);
    if (playedRounds.has(slug)) { alert("Holdet er allerede spillet — lists og estimater er låst."); return; }
    const roster = deserializeRoster(importText.trim());
    if (!roster) { alert("Ugyldigt roster format"); return; }
    if (roster.armies.length !== 8) { alert(`Roster skal have 8 hære (fandt ${roster.armies.length})`); return; }
    const team: OpponentTeam = {
      name: importFor.name,
      tier: importFor.tier,
      armies: roster.armies,
      estimates: buildAutoEstimates(roster.armies),
    };
    saveOpponentTeam(slug, team).catch(() => alert("Kunne ikke gemme — tjek Firebase"));
    setImportFor(null);
    setImportText("");
    setExpanded(slug);
  }

  // Manual estimate + propagation: every list ≥80% similar (whole field) gets the
  // same value for the same one of our armies, unless it was set manually.
  // Played opponents are never written to — their estimates are locked history.
  function setEstimate(teamSlug: string, ourIdx: number, theirIdx: number, value: number | null) {
    if (playedRounds.has(teamSlug)) return;
    const updates: Record<string, EstimateCell | null> = {};
    updates[`${teamSlug}/${ourIdx}_${theirIdx}`] = value === null ? null : { v: value };
    if (value !== null) {
      const srcList = opponents[teamSlug]?.armies?.[theirIdx];
      if (srcList) {
        for (const [slug, team] of Object.entries(opponents)) {
          if (playedRounds.has(slug)) continue;
          (team.armies || []).forEach((list, j) => {
            if (slug === teamSlug && j === theirIdx) return;
            if (listSimilarity(srcList, list) < SIMILARITY_THRESHOLD) return;
            const existing = team.estimates?.[`${ourIdx}_${j}`];
            if (existing && !existing.auto) return;
            updates[`${slug}/${ourIdx}_${j}`] = { v: value, auto: true };
          });
        }
      }
    }
    writeEstimateCells(updates).catch(() => {});
  }

  function removeTeam(slug: string, name: string) {
    if (!confirm(`Slet ${name} og alle estimater?`)) return;
    deleteOpponentTeam(slug).catch(() => {});
    if (expanded === slug) setExpanded(null);
  }

  return (
    <>
      <header className="px-4 sm:px-6 py-4 border-b border-white/[0.08] sticky top-0 bg-[#0f0f13] z-20">
        <div className="flex items-center gap-2 text-xs text-[#8888a0] mb-1">
          <Link href="/" className="hover:text-[#e8e8f0] transition-colors">Matrix</Link>
          <span>/</span>
          <Link href="/tournament" className="hover:text-[#e8e8f0] transition-colors">Turnering</Link>
          <span>/</span>
          <span className="text-[#e8e8f0]">Estimater</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-[#e8e8f0] tracking-tight">
            Estimater
            <span className="text-[#4ade80] ml-2 text-sm font-normal">— {TEAM_NAME}</span>
          </h1>
          <span className="ml-auto text-[11px] text-[#8888a0]">
            {totals.teams} hold · {totals.manual} manuelle · {totals.auto} auto
          </span>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap text-[10px]">
          {[
            { v: 2, label: "0-4 Meget dårlig" },
            { v: 6, label: "5-8 Dårlig" },
            { v: 10, label: "9-11 Lige" },
            { v: 13, label: "12-15 God" },
            { v: 18, label: "16-20 Meget god" },
          ].map(({ v, label }) => {
            const s = estimateStyle(v);
            return (
              <span
                key={label}
                className="px-2 py-0.5 rounded border"
                style={{ background: s.bg, color: s.fg, borderColor: s.border }}
              >
                {label}
              </span>
            );
          })}
          <span className="text-[#8888a0]">
            · Celler markeret <span className="italic">a</span> er auto-udfyldt fra lister med ≥{SIMILARITY_THRESHOLD}% lighed
          </span>
        </div>
      </header>

      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
        {ourArmies.length === 0 && (
          <div className="rounded-xl border border-dashed border-[rgba(239,68,68,0.3)] p-4 text-[11px] text-[#f87171]">
            Intet roster fundet — gå til <Link href="/tournament" className="underline">turneringen</Link> og opdater roster først.
          </div>
        )}

        {tiers.map((tier) => (
          <div key={tier.name} className="rounded-xl border border-white/[0.08] p-4">
            <h2 className="text-xs font-semibold text-[#8888a0] uppercase tracking-wider mb-3">
              {tier.name}
            </h2>
            <div className="space-y-2">
              {tier.teams.map((teamName) => {
                const slug = slugifyTeam(teamName);
                const team = opponents[slug];
                const hasLists = !!team?.armies?.length;
                const cellCount = Object.keys(team?.estimates || {}).length;
                const totalCells = hasLists ? ourArmies.length * team.armies.length : 0;
                const isOpen = expanded === slug;
                const playedRound = playedRounds.get(slug);
                const locked = playedRound !== undefined;
                return (
                  <div key={slug} className="rounded-lg border border-white/[0.08]">
                    <div className="flex items-center gap-3 p-3">
                      <span className="text-[12px] font-semibold text-[#e8e8f0]">{teamName}</span>
                      {locked && (
                        <span className="text-[9px] font-semibold text-[#8888a0] bg-[#22222e] px-1.5 py-0.5 rounded" title="Estimater er låst — holdet er allerede spillet">
                          🔒 Spillet · Runde {playedRound}
                        </span>
                      )}
                      {hasLists ? (
                        <>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${cellCount >= totalCells ? "bg-[rgba(34,197,94,0.12)] text-[#4ade80]" : "bg-[#22222e] text-[#8888a0]"}`}>
                            {cellCount}/{totalCells}
                          </span>
                          <button
                            onClick={() => setExpanded(isOpen ? null : slug)}
                            className="ml-auto text-[11px] text-[#a855f7] hover:text-[#c084fc] transition-colors"
                          >
                            {isOpen ? "Luk matrix" : "Åbn matrix"}
                          </button>
                          {!locked && (
                            <>
                              <button
                                onClick={() => setImportFor({ name: teamName, tier: tier.name })}
                                className="text-[10px] text-[#8888a0] hover:text-[#e8e8f0] transition-colors"
                              >
                                Opdater lists
                              </button>
                              <button
                                onClick={() => removeTeam(slug, teamName)}
                                className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                              >
                                Slet
                              </button>
                            </>
                          )}
                        </>
                      ) : (
                        <button
                          onClick={() => setImportFor({ name: teamName, tier: tier.name })}
                          className="ml-auto text-[11px] text-[#a855f7] hover:text-[#c084fc] transition-colors"
                        >
                          + Tilføj lists
                        </button>
                      )}
                    </div>

                    {importFor?.name === teamName && (
                      <div className="px-3 pb-3 space-y-2">
                        <textarea
                          value={importText}
                          onChange={(e) => setImportText(e.target.value)}
                          placeholder={`Indsæt roster-kode for ${teamName} (8 lister fra Roster Builder)...`}
                          className="w-full h-16 bg-[#1a1a22] border border-white/[0.14] rounded-lg p-2.5 text-xs text-[#e8e8f0] placeholder:text-[#8888a0] outline-none resize-none font-mono focus:border-[#a855f7]"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={confirmImport}
                            className="text-[11px] font-medium text-white bg-[#a855f7] hover:bg-[#9333ea] px-3 py-1.5 rounded-md transition-colors"
                          >
                            Gem lists
                          </button>
                          <button
                            onClick={() => { setImportFor(null); setImportText(""); }}
                            className="text-[11px] text-[#8888a0] hover:text-[#e8e8f0] px-3 py-1.5 transition-colors"
                          >
                            Annullér
                          </button>
                        </div>
                      </div>
                    )}

                    {isOpen && hasLists && ourArmies.length > 0 && (
                      <div className="px-3 pb-3 overflow-x-auto">
                        <table className="border-separate border-spacing-1">
                          <thead>
                            <tr>
                              <th className="text-left text-[9px] text-[#8888a0] font-semibold pr-2">
                                Vores \ Deres
                              </th>
                              {team.armies.map((list, j) => (
                                <th
                                  key={j}
                                  className="text-[9px] text-[#8888a0] font-semibold w-11 max-w-11 truncate px-0.5"
                                  title={`${list.faction} — ${(list.detachments || []).join(", ")}${list.disposition ? ` — ${list.disposition}` : ""}`}
                                >
                                  {j + 1}. {shortFaction(list.faction)}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {ourArmies.map((army, i) => (
                              <tr key={i}>
                                <th
                                  className="text-left text-[10px] text-[#e8e8f0] font-medium pr-2 whitespace-nowrap"
                                  title={`${army.faction} — ${(army.detachments || []).join(", ")}`}
                                >
                                  {i + 1}. {shortFaction(army.faction)}
                                </th>
                                {team.armies.map((_, j) => (
                                  <td key={j}>
                                    <EstimateInput
                                      cell={team.estimates?.[`${i}_${j}`]}
                                      onChange={(v) => setEstimate(slug, i, j, v)}
                                      locked={locked}
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
              {tier.teams.length === 0 && (
                <p className="text-[11px] text-[#8888a0]">
                  Ingen hold i denne tier — tilføj dem under Seeding på turneringssiden.
                </p>
              )}
            </div>
          </div>
        ))}

        {/* Add team outside seeding */}
        <div className="rounded-xl border border-dashed border-white/[0.08] p-4">
          <h2 className="text-xs font-semibold text-[#8888a0] uppercase tracking-wider mb-2">
            Tilføj hold uden for seeding
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Holdnavn, f.eks. Wales"
              className="flex-1 max-w-xs bg-[#1a1a22] border border-white/[0.14] rounded-lg px-3 py-1.5 text-xs text-[#e8e8f0] placeholder:text-[#8888a0] outline-none focus:border-[#a855f7]"
            />
            <button
              onClick={() => {
                const name = newTeamName.trim();
                if (!name) return;
                setImportFor({ name, tier: OTHER_TIER });
                setNewTeamName("");
              }}
              className="text-[11px] font-medium text-white bg-[#a855f7] hover:bg-[#9333ea] px-3 py-1.5 rounded-md transition-colors"
            >
              Tilføj
            </button>
          </div>
          {importFor && importFor.tier === OTHER_TIER && !Object.values(opponents).some((t) => t.name === importFor.name) && !tiers.some((t) => t.teams.includes(importFor.name)) && (
            <div className="mt-3 space-y-2">
              <div className="text-[11px] text-[#e8e8f0] font-semibold">{importFor.name}</div>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={`Indsæt roster-kode for ${importFor.name}...`}
                className="w-full h-16 bg-[#1a1a22] border border-white/[0.14] rounded-lg p-2.5 text-xs text-[#e8e8f0] placeholder:text-[#8888a0] outline-none resize-none font-mono focus:border-[#a855f7]"
              />
              <div className="flex gap-2">
                <button
                  onClick={confirmImport}
                  className="text-[11px] font-medium text-white bg-[#a855f7] hover:bg-[#9333ea] px-3 py-1.5 rounded-md transition-colors"
                >
                  Gem lists
                </button>
                <button
                  onClick={() => { setImportFor(null); setImportText(""); }}
                  className="text-[11px] text-[#8888a0] hover:text-[#e8e8f0] px-3 py-1.5 transition-colors"
                >
                  Annullér
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
