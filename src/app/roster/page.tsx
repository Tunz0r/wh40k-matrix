"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  type Disposition,
  type Detachment,
  DISPOSITIONS,
  DISP_STYLES,
  FACTIONS,
  GROUPS,
} from "@/lib/data";
import { DispositionBadge } from "@/components/DispositionBadge";
import { serializeRoster, deserializeRoster, rosterToArmies } from "@/lib/roster";

interface DetachmentPick {
  detachment: Detachment;
  faction: string;
}

interface Army {
  detachments: DetachmentPick[];
  chosenDisposition: Disposition | null;
}

const MAX_ARMIES = 8;
const MAX_DP_PER_ARMY = 3;
const MAX_PER_DISPOSITION = 2;

function emptyArmy(): Army {
  return { detachments: [], chosenDisposition: null };
}

function armyDp(army: Army): number {
  return army.detachments.reduce((s, d) => s + d.detachment.dp, 0);
}

function armyDispositions(army: Army): Disposition[] {
  const unique = new Set(army.detachments.map((d) => d.detachment.d));
  return [...unique];
}

function getChosenDispositionCounts(armies: Army[]): Record<Disposition, number> {
  const counts: Record<string, number> = {};
  for (const d of DISPOSITIONS) counts[d] = 0;
  for (const army of armies) {
    if (army.chosenDisposition) counts[army.chosenDisposition]++;
  }
  return counts as Record<Disposition, number>;
}

function getAvailableDispositionsForTeam(armies: Army[]): Disposition[] {
  const counts = getChosenDispositionCounts(armies);
  const armiesWithChoice = armies.filter((a) => a.chosenDisposition).length;
  const remaining = MAX_ARMIES - armiesWithChoice;
  if (remaining <= 0) return [];

  const missingRequired = DISPOSITIONS.filter((d) => counts[d] === 0);
  const slotsForExtras = remaining - missingRequired.length;

  if (slotsForExtras <= 0 && missingRequired.length > 0) {
    return missingRequired;
  }

  return DISPOSITIONS.filter((d) => counts[d] < MAX_PER_DISPOSITION);
}

function getAllDetachments(): DetachmentPick[] {
  const all: DetachmentPick[] = [];
  for (const [faction, dets] of Object.entries(FACTIONS)) {
    for (const det of dets) {
      all.push({ detachment: det, faction });
    }
  }
  return all;
}

export default function RosterPage() {
  const [armies, setArmies] = useState<Army[]>(
    () => Array.from({ length: MAX_ARMIES }, emptyArmy)
  );
  const [activeArmy, setActiveArmy] = useState(0);
  const [filterGroup, setFilterGroup] = useState("");
  const [filterFaction, setFilterFaction] = useState("");
  const [search, setSearch] = useState("");
  const [rosterName, setRosterName] = useState("Mit hold");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [exportCopied, setExportCopied] = useState(false);

  const allDetachments = useMemo(getAllDetachments, []);
  const dispCounts = getChosenDispositionCounts(armies);
  const availableTeamDispositions = getAvailableDispositionsForTeam(armies);

  const currentArmy = armies[activeArmy];
  const currentDp = armyDp(currentArmy);
  const remainingDp = MAX_DP_PER_ARMY - currentDp;
  const currentDispositions = armyDispositions(currentArmy);
  const lockedFaction =
    currentArmy.detachments.length > 0
      ? currentArmy.detachments[0].faction
      : null;

  const takenFactions = useMemo(() => {
    const smSuperFaction = [
      "Space Marines",
      "Dark Angels",
      "Blood Angels",
      "Space Wolves",
      "Black Templars",
      "Deathwatch",
    ];
    const set = new Set<string>();
    armies.forEach((a, i) => {
      if (i !== activeArmy && a.detachments.length > 0) {
        const fac = a.detachments[0].faction;
        set.add(fac);
        if (smSuperFaction.includes(fac)) {
          smSuperFaction.forEach((f) => set.add(f));
        }
      }
    });
    return set;
  }, [armies, activeArmy]);

  const filteredDetachments = useMemo(() => {
    const query = search.toLowerCase().trim();
    let pool = allDetachments.filter((d) => d.detachment.dp <= remainingDp);

    pool = pool.filter((d) => !takenFactions.has(d.faction));

    if (lockedFaction) {
      pool = pool.filter((d) => d.faction === lockedFaction);
    } else if (filterFaction) {
      pool = pool.filter((d) => d.faction === filterFaction);
    }

    if (!lockedFaction && filterGroup) {
      const groupFactions = GROUPS[filterGroup] || [];
      pool = pool.filter((d) => groupFactions.includes(d.faction));
    }
    if (query) {
      pool = pool.filter(
        (d) =>
          d.detachment.n.toLowerCase().includes(query) ||
          d.faction.toLowerCase().includes(query)
      );
    }

    pool.sort((a, b) => {
      const fA = a.faction.localeCompare(b.faction);
      if (fA !== 0) return fA;
      return a.detachment.n.localeCompare(b.detachment.n);
    });

    return pool;
  }, [allDetachments, remainingDp, lockedFaction, takenFactions, filterGroup, filterFaction, search]);

  const factionOptions = useMemo(() => {
    let facs = Object.keys(FACTIONS);
    if (filterGroup) {
      facs = GROUPS[filterGroup] || facs;
    }
    return facs.sort();
  }, [filterGroup]);

  function updateArmy(index: number, updater: (a: Army) => Army) {
    setArmies((prev) => prev.map((a, i) => (i === index ? updater(a) : a)));
  }

  function addDetachment(det: Detachment, faction: string) {
    if (det.dp > remainingDp) return;
    updateArmy(activeArmy, (a) => {
      const newDets = [...a.detachments, { detachment: det, faction }];
      const disps = new Set(newDets.map((d) => d.detachment.d));
      const newChosen =
        disps.size === 1 ? [...disps][0] : a.chosenDisposition;
      return { detachments: newDets, chosenDisposition: newChosen };
    });
  }

  function removeDetachment(armyIdx: number, detIdx: number) {
    updateArmy(armyIdx, (a) => {
      const newDets = a.detachments.filter((_, i) => i !== detIdx);
      if (newDets.length === 0) return emptyArmy();
      const disps = new Set(newDets.map((d) => d.detachment.d));
      let newChosen = a.chosenDisposition;
      if (newChosen && !disps.has(newChosen)) {
        newChosen = disps.size === 1 ? [...disps][0] : null;
      }
      return { detachments: newDets, chosenDisposition: newChosen };
    });
  }

  function setDisposition(armyIdx: number, disp: Disposition) {
    updateArmy(armyIdx, (a) => ({ ...a, chosenDisposition: disp }));
  }

  function clearArmy(armyIdx: number) {
    updateArmy(armyIdx, () => emptyArmy());
  }

  function resetAll() {
    setArmies(Array.from({ length: MAX_ARMIES }, emptyArmy));
    setActiveArmy(0);
  }

  function exportRoster() {
    const code = serializeRoster(rosterName, armies);
    navigator.clipboard.writeText(code);
    setExportCopied(true);
    setTimeout(() => setExportCopied(false), 2000);
  }

  function handleImport() {
    const data = deserializeRoster(importText.trim());
    if (!data) {
      alert("Ugyldigt roster format.");
      return;
    }
    const imported = rosterToArmies(data);
    setArmies(imported);
    setRosterName(data.name);
    setShowImport(false);
    setImportText("");
    setActiveArmy(0);
  }

  const filledArmies = armies.filter((a) => a.detachments.length > 0).length;
  const completeArmies = armies.filter(
    (a) => a.detachments.length > 0 && a.chosenDisposition
  ).length;
  const totalDp = armies.reduce((s, a) => s + armyDp(a), 0);

  const isComplete =
    completeArmies === MAX_ARMIES &&
    DISPOSITIONS.every((d) => dispCounts[d] >= 1) &&
    DISPOSITIONS.every((d) => dispCounts[d] <= MAX_PER_DISPOSITION);

  const isDetachmentInAnyArmy = (det: Detachment, faction: string) =>
    armies.some((a) =>
      a.detachments.some(
        (d) => d.detachment.n === det.n && d.faction === faction
      )
    );

  return (
    <>
      <header className="px-4 sm:px-6 py-6 pb-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-2 text-xs text-[#8888a0] mb-2">
          <Link href="/" className="hover:text-[#e8e8f0] transition-colors">
            Matrix
          </Link>
          <span>/</span>
          <span className="text-[#e8e8f0]">Roster Builder</span>
        </div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-[#e8e8f0] tracking-tight">
            Hold Roster Builder
          </h1>
          <Link
            href="/pairings"
            className="ml-auto text-[12px] font-medium text-[#a855f7] hover:text-[#c084fc] transition-colors bg-[rgba(168,85,247,0.1)] px-3 py-1 rounded-md border border-[rgba(168,85,247,0.2)]"
          >
            Mock Pairings
          </Link>
        </div>
        <p className="text-xs text-[#8888a0] mt-1">
          8 hære · Max 3 DP per hær · Hver disposition mindst 1× · Max 2× per
          disposition · Vælg aktiv disposition per hær
        </p>
      </header>

      <div className="flex flex-col lg:flex-row">
        {/* Roster panel */}
        <div className="lg:w-[420px] shrink-0 border-b lg:border-b-0 lg:border-r border-white/[0.08] p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#e8e8f0]">
              Dit hold ({completeArmies}/{MAX_ARMIES} klar)
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#8888a0]">{totalDp} DP</span>
              {filledArmies > 0 && (
                <button
                  onClick={resetAll}
                  className="text-[11px] text-red-400 hover:text-red-300 transition-colors"
                >
                  Reset alt
                </button>
              )}
            </div>
          </div>

          {/* Disposition status */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {DISPOSITIONS.map((d) => {
              const s = DISP_STYLES[d];
              const count = dispCounts[d];
              const full = count >= MAX_PER_DISPOSITION;
              const missing = count === 0;
              return (
                <span
                  key={d}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded ${full ? "opacity-40" : ""} ${missing ? "ring-1 ring-current" : ""}`}
                  style={{ background: s.bg, color: s.color }}
                >
                  {d} {count}/{MAX_PER_DISPOSITION}
                </span>
              );
            })}
          </div>

          {/* Army slots */}
          <div className="space-y-2">
            {armies.map((army, i) => {
              const dp = armyDp(army);
              const disps = armyDispositions(army);
              const isActive = i === activeArmy;
              const chosenStyle = army.chosenDisposition
                ? DISP_STYLES[army.chosenDisposition]
                : null;
              const needsChoice = disps.length > 1 && !army.chosenDisposition;
              const validChoices = disps.filter((d) =>
                availableTeamDispositions.includes(d)
              );

              return (
                <div
                  key={i}
                  onClick={() => setActiveArmy(i)}
                  className={`rounded-lg border transition-colors cursor-pointer ${
                    isActive
                      ? "border-[#a855f7]/50 bg-[#1a1a22]"
                      : "border-white/[0.08] hover:border-white/[0.14]"
                  } ${needsChoice ? "ring-1 ring-amber-500/40" : ""}`}
                >
                  <div className="flex items-center gap-2 px-3 py-2">
                    <span className="text-xs font-semibold text-[#8888a0] w-5 shrink-0">
                      {i + 1}.
                    </span>
                    {army.detachments.length > 0 ? (
                      <>
                        <div
                          className="w-1.5 self-stretch rounded-full shrink-0"
                          style={{
                            background: chosenStyle?.color || "#8888a0",
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          {army.detachments.map((d, di) => (
                            <div
                              key={di}
                              className="flex items-center gap-1.5 group/det"
                            >
                              <span className="text-[12px] text-[#e8e8f0] truncate">
                                {d.detachment.n}
                              </span>
                              <span className="text-[10px] text-[#8888a0]">
                                {d.detachment.dp}DP
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeDetachment(i, di);
                                }}
                                className="text-[#8888a0] hover:text-red-400 transition-colors text-xs opacity-0 group-hover/det:opacity-100"
                                title="Fjern"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-[#8888a0]">
                              {dp}/{MAX_DP_PER_ARMY} DP ·{" "}
                              <span className="italic">
                                {army.detachments
                                  .map((d) => d.faction)
                                  .filter(
                                    (v, idx, a) => a.indexOf(v) === idx
                                  )
                                  .join(", ")}
                              </span>
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {disps.length === 1 ? (
                            <span
                              className="text-[9px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
                              style={{
                                background: DISP_STYLES[disps[0]].bg,
                                color: DISP_STYLES[disps[0]].color,
                              }}
                            >
                              {disps[0]}
                            </span>
                          ) : (
                            <select
                              value={army.chosenDisposition || ""}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                e.stopPropagation();
                                setDisposition(
                                  i,
                                  e.target.value as Disposition
                                );
                              }}
                              className="bg-[#22222e] text-[10px] border border-white/[0.14] rounded px-1.5 py-0.5 outline-none cursor-pointer"
                              style={{
                                color: chosenStyle?.color || "#e8e8f0",
                              }}
                            >
                              <option value="">Vælg disposition...</option>
                              {disps.map((d) => {
                                const canPick =
                                  availableTeamDispositions.includes(d) ||
                                  army.chosenDisposition === d;
                                return (
                                  <option
                                    key={d}
                                    value={d}
                                    disabled={!canPick}
                                  >
                                    {d}
                                    {!canPick ? " (max)" : ""}
                                  </option>
                                );
                              })}
                            </select>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              clearArmy(i);
                            }}
                            className="text-[10px] text-[#8888a0] hover:text-red-400 transition-colors"
                          >
                            Ryd hær
                          </button>
                        </div>
                      </>
                    ) : (
                      <span
                        className={`text-[11px] ${isActive ? "text-[#a855f7]" : "text-[#8888a0]/40"}`}
                      >
                        {isActive
                          ? "← Tilføj detachments fra listen"
                          : "Tom — klik for at vælge"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Export/Import */}
          <div className="flex flex-wrap gap-2 mt-3">
            {isComplete && (
              <button
                onClick={exportRoster}
                className="text-[11px] font-medium text-[#4ade80] hover:text-[#86efac] bg-[rgba(34,197,94,0.08)] px-2.5 py-1 rounded-md border border-[rgba(34,197,94,0.2)] transition-colors"
              >
                {exportCopied ? "Kopieret!" : "Eksportér roster"}
              </button>
            )}
            <button
              onClick={() => setShowImport(!showImport)}
              className="text-[11px] font-medium text-[#8888a0] hover:text-[#e8e8f0] bg-[#22222e] px-2.5 py-1 rounded-md border border-white/[0.08] transition-colors"
            >
              Importér roster
            </button>
          </div>
          {showImport && (
            <div className="mt-2 p-3 bg-[#22222e] rounded-lg border border-white/[0.08]">
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Indsæt roster-kode her..."
                className="w-full h-16 bg-[#1a1a22] border border-white/[0.14] rounded p-2 text-xs text-[#e8e8f0] placeholder:text-[#8888a0] outline-none resize-none font-mono focus:border-[#a855f7]"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleImport}
                  className="text-[11px] font-medium text-[#a855f7] hover:text-[#c084fc] px-2.5 py-1 rounded-md bg-[rgba(168,85,247,0.1)] border border-[rgba(168,85,247,0.2)]"
                >
                  Importér
                </button>
                <button
                  onClick={() => { setShowImport(false); setImportText(""); }}
                  className="text-[11px] text-[#8888a0] hover:text-[#e8e8f0] px-2 py-1"
                >
                  Annullér
                </button>
              </div>
            </div>
          )}

          {isComplete && (
            <div className="mt-3 p-3 bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.2)] rounded-lg">
              <div className="text-[13px] font-semibold text-[#4ade80]">
                Hold komplet!
              </div>
              <div className="text-[11px] text-[#8888a0] mt-0.5">
                {MAX_ARMIES} hære · {totalDp} DP total
              </div>
            </div>
          )}
        </div>

        {/* Detachment picker */}
        <div className="flex-1 min-w-0">
          <div className="px-4 sm:px-6 py-2 bg-[#22222e] border-b border-white/[0.08]">
            <span className="text-[12px] text-[#a855f7] font-medium">
              Hær {activeArmy + 1}
            </span>
            <span className="text-[12px] text-[#8888a0] ml-2">
              {currentDp}/{MAX_DP_PER_ARMY} DP brugt
              {remainingDp > 0 && ` · ${remainingDp} DP ledig`}
              {remainingDp === 0 && " · Fuld"}
              {lockedFaction && ` · ${lockedFaction}`}
            </span>
          </div>
          <div className="px-4 sm:px-6 py-3 flex flex-wrap gap-2.5 items-center border-b border-white/[0.08]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Søg detachment eller faction..."
              className="bg-[#1a1a22] text-[#e8e8f0] border border-white/[0.14] rounded-md px-3 py-1.5 text-[13px] font-[inherit] outline-none placeholder:text-[#8888a0] hover:border-white/25 focus:border-[#a855f7] w-full sm:w-56 transition-colors"
            />
            <select
              value={filterGroup}
              onChange={(e) => {
                setFilterGroup(e.target.value);
                setFilterFaction("");
              }}
              className="bg-[#1a1a22] text-[#e8e8f0] border border-white/[0.14] rounded-md px-2.5 py-1.5 text-[13px] font-[inherit] cursor-pointer outline-none hover:border-white/25 focus:border-[#a855f7]"
            >
              <option value="">Alle grupper</option>
              <option value="Space Marines">Space Marines</option>
              <option value="Imperial">Imperium</option>
              <option value="Chaos">Chaos</option>
              <option value="Xenos">Xenos</option>
            </select>
            <select
              value={filterFaction}
              onChange={(e) => setFilterFaction(e.target.value)}
              className="bg-[#1a1a22] text-[#e8e8f0] border border-white/[0.14] rounded-md px-2.5 py-1.5 text-[13px] font-[inherit] cursor-pointer outline-none hover:border-white/25 focus:border-[#a855f7]"
            >
              <option value="">Alle factions</option>
              {factionOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-[#8888a0] bg-[#22222e] px-2 py-0.5 rounded-full border border-white/[0.08]">
              {filteredDetachments.length} tilgængelige
            </span>
          </div>

          {remainingDp === 0 ? (
            <div className="px-6 py-12 text-center text-[#8888a0]">
              Hær {activeArmy + 1} er fuld ({MAX_DP_PER_ARMY} DP) — vælg en
              anden hær eller fjern en detachment
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-[#8888a0] bg-[#1a1a22] border-b border-white/[0.08] sticky top-0 z-10">
                      Detachment
                    </th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-[#8888a0] bg-[#1a1a22] border-b border-white/[0.08] sticky top-0 z-10 hidden sm:table-cell">
                      Faction
                    </th>
                    <th className="px-4 py-2 text-center text-[11px] font-medium text-[#8888a0] bg-[#1a1a22] border-b border-white/[0.08] sticky top-0 z-10 w-[40px]">
                      DP
                    </th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-[#8888a0] bg-[#1a1a22] border-b border-white/[0.08] sticky top-0 z-10">
                      Disposition
                    </th>
                    <th className="px-4 py-2 bg-[#1a1a22] border-b border-white/[0.08] sticky top-0 z-10 w-[60px]" />
                  </tr>
                </thead>
                <tbody>
                  {filteredDetachments.map(({ detachment: det, faction }) => {
                    const taken = isDetachmentInAnyArmy(det, faction);
                    return (
                      <tr
                        key={`${faction}-${det.n}`}
                        className={`group ${taken ? "opacity-30" : ""}`}
                      >
                        <td className="px-4 py-[7px] border-b border-white/[0.08] group-hover:bg-[#1a1a22]">
                          <div className="text-[13px] text-[#e8e8f0]">
                            {det.n}
                            {det.new && (
                              <span className="ml-1.5 text-[9px] font-semibold px-1 py-px rounded bg-[rgba(34,197,94,0.15)] text-[#4ade80]">
                                NEW
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-[#8888a0] sm:hidden">
                            {faction}
                          </div>
                        </td>
                        <td className="px-4 py-[7px] border-b border-white/[0.08] text-[12px] text-[#8888a0] group-hover:bg-[#1a1a22] hidden sm:table-cell">
                          {faction}
                        </td>
                        <td className="px-4 py-[7px] border-b border-white/[0.08] text-xs text-[#8888a0] text-center group-hover:bg-[#1a1a22]">
                          {det.dp}
                        </td>
                        <td className="px-4 py-[7px] border-b border-white/[0.08] group-hover:bg-[#1a1a22]">
                          <DispositionBadge disposition={det.d} />
                        </td>
                        <td className="px-4 py-[7px] border-b border-white/[0.08] group-hover:bg-[#1a1a22]">
                          {!taken && (
                            <button
                              onClick={() => addDetachment(det, faction)}
                              className="text-[11px] font-medium text-[#a855f7] hover:text-[#c084fc] transition-colors"
                            >
                              + Tilføj
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredDetachments.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-[#8888a0]"
                      >
                        Ingen detachments matcher
                        {remainingDp < 3 &&
                          ` (max ${remainingDp} DP ledig i hær ${activeArmy + 1})`}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
