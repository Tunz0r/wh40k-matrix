"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { deserializeRoster, type RosterArmy } from "@/lib/roster";
import { subscribeToTournament, type TournamentDoc } from "@/lib/tournament-db";
import { TEAM_SLUG, TEAM_NAME } from "@/lib/team";
import { DISP_STYLES, FACTIONS } from "@/lib/data";
import ArmyEditor from "@/components/ArmyEditor";
import EstimateInput from "@/components/EstimateInput";
import PlayerEstimates from "@/components/PlayerEstimates";
import { parseArmyList, parseTeamLists, formatUnits, formatUnitsLines } from "@/lib/list-parser";
import {
  type OpponentMap,
  type OpponentTeam,
  type OpponentList,
  type EstimateCell,
  slugifyTeam,
  subscribeToOpponents,
  saveOpponentTeam,
  deleteOpponentTeam,
  updateOpponentList,
  saveTeamNote,
  saveListNote,
  restoreOpponents,
  writeEstimateCells,
  listSimilarity,
  SIMILARITY_THRESHOLD,
  estimateStyle,
} from "@/lib/estimates-db";

const OTHER_TIER = "Andre hold";

function shortFaction(name: string): string {
  return name.length > 14 ? name.slice(0, 13) + "…" : name;
}

// Inline scouting-note field: shows the saved note (or an "add" affordance),
// expands to a textarea on click, saves on blur.
function ScoutNote({
  note,
  editing,
  onEdit,
  onSave,
  placeholder,
  compact,
}: {
  note?: string;
  editing: { text: string } | null;
  onEdit: (text: string | null) => void;
  onSave: (text: string) => void;
  placeholder: string;
  compact?: boolean;
}) {
  if (editing) {
    return (
      <textarea
        autoFocus
        value={editing.text}
        onChange={(e) => onEdit(e.target.value)}
        onBlur={() => onSave(editing.text)}
        placeholder={placeholder}
        className={`w-full ${compact ? "h-12" : "h-16"} bg-[#1a1a22] border border-[rgba(250,204,21,0.35)] rounded-md p-2 text-[11px] text-[#e8e8f0] placeholder:text-[#8888a0] outline-none resize-none focus:border-[#facc15]`}
      />
    );
  }
  if (note) {
    return (
      <button
        onClick={() => onEdit(note)}
        className="w-full text-left text-[11px] text-[#facc15] bg-[rgba(250,204,21,0.06)] border border-[rgba(250,204,21,0.15)] rounded-md px-2 py-1 hover:border-[rgba(250,204,21,0.35)] transition-colors whitespace-pre-wrap"
        title="Klik for at redigere scouting-note"
      >
        🔍 {note}
      </button>
    );
  }
  return (
    <button
      onClick={() => onEdit("")}
      className="text-[10px] text-[#8888a0] hover:text-[#facc15] transition-colors"
    >
      + Scouting-note
    </button>
  );
}


export default function EstimatesPage() {
  const [opponents, setOpponents] = useState<OpponentMap>({});
  const [fbDoc, setFbDoc] = useState<TournamentDoc | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [importFor, setImportFor] = useState<{ name: string; tier: string } | null>(null);
  const [importText, setImportText] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [editingList, setEditingList] = useState<{ slug: string; idx: number } | null>(null);
  const [pasteFor, setPasteFor] = useState<{ slug: string; idx: number } | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [unitsShown, setUnitsShown] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ key: string; text: string } | null>(null);
  const [mode, setMode] = useState<"country" | "player">("country");

  useEffect(() => {
    const saved = localStorage.getItem("wtc-est-mode");
    if (saved === "player" || saved === "country") setMode(saved);
  }, []);

  function switchMode(m: "country" | "player") {
    setMode(m);
    localStorage.setItem("wtc-est-mode", m);
  }

  const fileRef = useRef<HTMLInputElement>(null);

  // Download a JSON backup of the estimates + team seeding/roster.
  function exportBackup() {
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      team: TEAM_NAME,
      opponents,
      seedingTiers: fbDoc?.seedingTiers || [],
      roster: fbDoc?.roster || null,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    a.download = `wtc-estimater-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(file: File) {
    try {
      const data = JSON.parse(await file.text());
      const map = data?.opponents as OpponentMap | undefined;
      if (!map || typeof map !== "object") { alert("Filen ser ikke ud som en gyldig estimat-backup."); return; }
      const teamCount = Object.keys(map).length;
      const cellCount = Object.values(map).reduce(
        (n, t) => n + Object.keys(t.estimates || {}).length, 0);
      if (!confirm(
        `Gendan ${teamCount} hold (${cellCount} estimat-celler) fra ${data.exportedAt || "backup"}?\n\n` +
        `Hold i backuppen overskrives. Hold der IKKE er i backuppen røres ikke.`)) return;
      const n = await restoreOpponents(map);
      alert(`${n} hold gendannet.`);
    } catch {
      alert("Kunne ikke læse filen — er det en JSON-backup?");
    }
  }

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
    // Teams not in seeding are grouped by their own tier label (e.g. the ATC
    // "Meta" reference teams get their own section); tier-less ones fall back
    // to "Andre hold".
    const extraSections = new Map<string, string[]>();
    for (const [slug, team] of Object.entries(opponents)) {
      if (seededSlugs.has(slug)) continue;
      const section = team.tier && !/^tier/i.test(team.tier) ? team.tier : OTHER_TIER;
      if (!extraSections.has(section)) extraSections.set(section, []);
      extraSections.get(section)!.push(team.name);
    }
    const extras = [...extraSections.entries()].map(([name, teams]) => ({ name, teams }));
    return [...seedingTiers, ...extras].filter((t) => t.teams.length > 0);
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

  function dispositionForDet(faction: string | null, det: string | null) {
    if (!faction || !det || !FACTIONS[faction]) return null;
    return FACTIONS[faction].find((d) => d.n === det)?.d ?? null;
  }

  function confirmImport() {
    if (!importFor) return;
    const slug = slugifyTeam(importFor.name);
    if (playedRounds.has(slug)) { alert("Holdet er allerede spillet — lists og estimater er låst."); return; }
    const text = importText.trim();

    // Auto-detect: a raw team-list paste (with unit content) vs a base64 roster-code.
    const parsed = parseTeamLists(text);
    const looksRaw = parsed.some((p) => p.units.length >= 3);
    let armies: OpponentList[] | null = null;

    if (looksRaw) {
      armies = parsed.map((p) => ({
        faction: p.faction || "",
        detachments: p.detachment ? [p.detachment] : [],
        disposition: dispositionForDet(p.faction, p.detachment),
        units: p.units,
      }));
      const unresolved = armies.filter((a) => !a.faction || !a.detachments.length).length;
      if (unresolved > 0 &&
        !confirm(`${unresolved} af ${armies.length} lists mangler faction/detachment (ret dem bagefter med Redigér). Gem alligevel?`)) {
        return;
      }
    } else {
      const roster = deserializeRoster(text);
      if (!roster) { alert("Kunne ikke læse — indsæt enten fulde liste-exports eller en roster-kode."); return; }
      armies = roster.armies;
    }

    if (!armies.length) { alert("Ingen lists fundet i teksten."); return; }
    if (armies.length !== 8 &&
      !confirm(`Fandt ${armies.length} lists (forventede 8). Gem alligevel?`)) {
      return;
    }

    const team: OpponentTeam = {
      name: importFor.name,
      tier: importFor.tier,
      armies,
      estimates: buildAutoEstimates(armies),
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

  // Persist a changed list and re-derive the auto estimates in its column
  // against the new content. Manual estimates are kept (captain's judgment).
  function persistListChange(slug: string, idx: number, list: OpponentList) {
    updateOpponentList(slug, idx, list)
      .then(() => {
        const updates: Record<string, EstimateCell | null> = {};
        for (let i = 0; i < ourArmies.length; i++) {
          const key = `${i}_${idx}`;
          const existing = opponents[slug]?.estimates?.[key];
          if (existing && !existing.auto) continue;
          let best: { sim: number; v: number } | null = null;
          for (const [oslug, team] of Object.entries(opponents)) {
            (team.armies || []).forEach((other, k) => {
              if (oslug === slug && k === idx) return;
              const cell = team.estimates?.[`${i}_${k}`];
              if (!cell || cell.auto) return;
              const sim = listSimilarity(list, other);
              if (sim < SIMILARITY_THRESHOLD) return;
              if (!best || sim > best.sim) best = { sim, v: cell.v };
            });
          }
          const next = best ? { v: (best as { v: number }).v, auto: true } : null;
          if (JSON.stringify(next) !== JSON.stringify(existing ?? null)) updates[`${slug}/${key}`] = next;
        }
        if (Object.keys(updates).length) writeEstimateCells(updates).catch(() => {});
      })
      .catch(() => alert("Kunne ikke gemme listen — tjek Firebase"));
  }

  // Edit a single list's metadata in place.
  function saveListEdit(slug: string, idx: number, army: RosterArmy) {
    const old = opponents[slug]?.armies?.[idx];
    const list: OpponentList = {
      faction: army.faction,
      detachments: army.detachments,
      disposition: army.disposition ?? null,
      ...(army.player ? { player: army.player } : {}),
    };
    if (old?.units && old.faction === army.faction) list.units = old.units;
    persistListChange(slug, idx, list);
    setEditingList(null);
  }

  // Paste a raw army list export → parsed to a compact unit summary and stored
  // on the list; content-based similarity kicks in for this column.
  function saveUnits(slug: string, idx: number, rawText: string) {
    const old = opponents[slug]?.armies?.[idx];
    if (!old) return;
    const units = parseArmyList(rawText);
    if (units.length === 0) {
      alert("Kunne ikke finde enheder i teksten — indsæt et komplet liste-export (GW-app, WTC eller NewRecruit format).");
      return;
    }
    const list: OpponentList = {
      faction: old.faction,
      detachments: old.detachments || [],
      disposition: old.disposition ?? null,
      ...(old.player ? { player: old.player } : {}),
      units,
    };
    persistListChange(slug, idx, list);
    setPasteFor(null);
    setPasteText("");
  }

  function removeTeam(slug: string, name: string) {
    if (!confirm(`Slet ${name} og alle estimater?`)) return;
    deleteOpponentTeam(slug).catch(() => {});
    if (expanded === slug) setExpanded(null);
  }

  return (
    <>
      <header className="px-4 sm:px-6 py-4 border-b border-white/[0.08] sticky top-12 bg-[#0f0f13] z-20">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-[#e8e8f0] tracking-tight">
            Estimater
            <span className="text-[#4ade80] ml-2 text-sm font-normal">— {TEAM_NAME}</span>
          </h1>
          <div className="flex gap-1 ml-auto">
            <button
              onClick={() => switchMode("country")}
              className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                mode === "country"
                  ? "bg-[#a855f7] text-white"
                  : "bg-[#22222e] text-[#8888a0] hover:text-[#e8e8f0]"
              }`}
            >
              Pr. land
            </button>
            <button
              onClick={() => switchMode("player")}
              className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                mode === "player"
                  ? "bg-[#a855f7] text-white"
                  : "bg-[#22222e] text-[#8888a0] hover:text-[#e8e8f0]"
              }`}
            >
              Min hær
            </button>
          </div>
          <span className="text-[11px] text-[#8888a0] hidden sm:inline">
            {totals.teams} hold · {totals.manual} manuelle · {totals.auto} auto
          </span>
          <div className="flex items-center gap-1 w-full sm:w-auto">
            <button
              onClick={exportBackup}
              title="Download en JSON-backup af alle estimater og lists"
              className="text-[11px] text-[#8888a0] hover:text-[#4ade80] border border-white/[0.1] hover:border-[rgba(74,222,128,0.3)] px-2.5 py-1 rounded-md transition-colors"
            >
              ↓ Backup
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              title="Gendan estimater fra en tidligere backup-fil"
              className="text-[11px] text-[#8888a0] hover:text-[#e8e8f0] border border-white/[0.1] px-2.5 py-1 rounded-md transition-colors"
            >
              ↑ Gendan
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importBackup(f);
                e.target.value = "";
              }}
            />
          </div>
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

        {mode === "player" && ourArmies.length > 0 && (
          <PlayerEstimates
            opponents={opponents}
            ourArmies={ourArmies}
            playedRounds={playedRounds}
            onSet={setEstimate}
          />
        )}

        {mode === "country" && tiers.map((tier) => (
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
                          placeholder={`Indsæt hele holdets 8 liste-exports for ${teamName} (WTC eller GW-app format) — eller en roster-kode. Faction, detachment og enheder findes automatisk.`}
                          className="w-full h-28 bg-[#1a1a22] border border-white/[0.14] rounded-lg p-2.5 text-xs text-[#e8e8f0] placeholder:text-[#8888a0] outline-none resize-none font-mono focus:border-[#a855f7]"
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
                      <div className="px-3 pb-3">
                        {/* Team-level scouting note */}
                        <div className="mb-2">
                          <ScoutNote
                            note={team.notes}
                            editing={noteDraft?.key === `team:${slug}` ? { text: noteDraft.text } : null}
                            onEdit={(t) => setNoteDraft(t === null ? null : { key: `team:${slug}`, text: t })}
                            onSave={(t) => { saveTeamNote(slug, t.trim()).catch(() => {}); setNoteDraft(null); }}
                            placeholder={`Intel om ${teamName} — kaptajnens vaner, pairing-tendenser...`}
                          />
                        </div>
                        <div className="overflow-x-auto">
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

                        {/* Per-list editing */}
                        <div className="mt-3 space-y-1.5">
                          <div className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold">
                            Lists
                          </div>
                          {team.armies.map((list, j) => {
                            if (editingList?.slug === slug && editingList.idx === j) {
                              return (
                                <ArmyEditor
                                  key={j}
                                  initial={list}
                                  onSave={(a) => saveListEdit(slug, j, a)}
                                  onCancel={() => setEditingList(null)}
                                />
                              );
                            }
                            const rowKey = `${slug}_${j}`;
                            const hasUnits = !!list.units?.length;
                            const showingUnits = unitsShown === rowKey;
                            const pasting = pasteFor?.slug === slug && pasteFor.idx === j;
                            return (
                              <div key={j} className="rounded-md border border-white/[0.06]">
                                <div className="flex items-center gap-2 text-[11px] px-2 py-1.5">
                                  <span className="text-[#8888a0] w-4 shrink-0">{j + 1}.</span>
                                  <span className="text-[#e8e8f0] font-medium shrink-0">{list.faction}</span>
                                  <span className="text-[#8888a0] truncate flex-1">
                                    {(list.detachments || []).join(", ")}
                                  </span>
                                  {list.disposition && (
                                    <span
                                      className="text-[8px] font-semibold px-1 py-0.5 rounded whitespace-nowrap shrink-0"
                                      style={{
                                        background: DISP_STYLES[list.disposition].bg,
                                        color: DISP_STYLES[list.disposition].color,
                                      }}
                                    >
                                      {list.disposition}
                                    </span>
                                  )}
                                  {hasUnits && (
                                    <button
                                      onClick={() => setUnitsShown(showingUnits ? null : rowKey)}
                                      className="text-[10px] text-[#a855f7] hover:text-[#c084fc] transition-colors shrink-0"
                                    >
                                      Liste {showingUnits ? "▴" : "▾"}
                                    </button>
                                  )}
                                  {!locked && (
                                    <>
                                      <button
                                        onClick={() => {
                                          setPasteFor(pasting ? null : { slug, idx: j });
                                          setPasteText("");
                                        }}
                                        className="text-[10px] text-[#8888a0] hover:text-[#e8e8f0] transition-colors shrink-0"
                                      >
                                        {hasUnits ? "Ny liste" : "+ Liste"}
                                      </button>
                                      <button
                                        onClick={() => setEditingList({ slug, idx: j })}
                                        className="text-[10px] text-[#a855f7] hover:text-[#c084fc] transition-colors shrink-0"
                                      >
                                        Redigér
                                      </button>
                                    </>
                                  )}
                                </div>
                                {showingUnits && hasUnits && (
                                  <p
                                    title={formatUnitsLines(list.units!)}
                                    className="px-2 pb-1.5 text-[10px] leading-[1.6] text-[#8888a0] break-words"
                                  >
                                    {formatUnits(list.units!)}
                                  </p>
                                )}
                                <div className="px-2 pb-1.5">
                                  <ScoutNote
                                    compact
                                    note={list.notes}
                                    editing={noteDraft?.key === `list:${rowKey}` ? { text: noteDraft.text } : null}
                                    onEdit={(t) => setNoteDraft(t === null ? null : { key: `list:${rowKey}`, text: t })}
                                    onSave={(t) => { saveListNote(slug, j, t.trim()).catch(() => {}); setNoteDraft(null); }}
                                    placeholder={`Intel om denne ${list.faction}-liste...`}
                                  />
                                </div>
                                {pasting && (
                                  <div className="px-2 pb-2 space-y-1.5">
                                    <textarea
                                      value={pasteText}
                                      onChange={(e) => setPasteText(e.target.value)}
                                      placeholder="Indsæt hele liste-exporten her (GW-app, WTC eller NewRecruit) — spillernavne, våben og punkter fjernes automatisk..."
                                      className="w-full h-24 bg-[#1a1a22] border border-white/[0.14] rounded-lg p-2 text-[10px] text-[#e8e8f0] placeholder:text-[#8888a0] outline-none resize-none font-mono focus:border-[#a855f7]"
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => saveUnits(slug, j, pasteText)}
                                        className="text-[10px] font-medium text-white bg-[#a855f7] hover:bg-[#9333ea] px-2.5 py-1 rounded-md transition-colors"
                                      >
                                        Gem liste
                                      </button>
                                      <button
                                        onClick={() => { setPasteFor(null); setPasteText(""); }}
                                        className="text-[10px] text-[#8888a0] hover:text-[#e8e8f0] px-2 py-1 transition-colors"
                                      >
                                        Annullér
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
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
        {mode === "country" && (
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
                placeholder={`Indsæt hele holdets 8 liste-exports for ${importFor.name} — eller en roster-kode.`}
                className="w-full h-28 bg-[#1a1a22] border border-white/[0.14] rounded-lg p-2.5 text-xs text-[#e8e8f0] placeholder:text-[#8888a0] outline-none resize-none font-mono focus:border-[#a855f7]"
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
        )}
      </div>
    </>
  );
}
