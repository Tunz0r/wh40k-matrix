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

interface RosterSlot {
  detachment: Detachment;
  faction: string;
}

const MAX_ARMIES = 8;
const MAX_PER_DISPOSITION = 2;
const MAX_DP_PER_ARMY = 3;

function getDispositionCounts(roster: RosterSlot[]): Record<Disposition, number> {
  const counts: Record<string, number> = {};
  for (const d of DISPOSITIONS) counts[d] = 0;
  for (const slot of roster) counts[slot.detachment.d]++;
  return counts as Record<Disposition, number>;
}

function getAvailableDispositions(roster: RosterSlot[]): Disposition[] {
  if (roster.length >= MAX_ARMIES) return [];
  const counts = getDispositionCounts(roster);
  const remaining = MAX_ARMIES - roster.length;

  const missingRequired = DISPOSITIONS.filter((d) => counts[d] === 0);
  const slotsForExtras = remaining - missingRequired.length;

  if (slotsForExtras <= 0 && missingRequired.length > 0) {
    return missingRequired;
  }

  return DISPOSITIONS.filter((d) => counts[d] < MAX_PER_DISPOSITION);
}

function getAllDetachments(): { detachment: Detachment; faction: string }[] {
  const all: { detachment: Detachment; faction: string }[] = [];
  for (const [faction, dets] of Object.entries(FACTIONS)) {
    for (const det of dets) {
      all.push({ detachment: det, faction });
    }
  }
  return all;
}

function getGroupForFaction(faction: string): string {
  for (const [group, facs] of Object.entries(GROUPS)) {
    if (facs.includes(faction)) return group;
  }
  return "";
}

export default function RosterPage() {
  const [roster, setRoster] = useState<RosterSlot[]>([]);
  const [filterGroup, setFilterGroup] = useState("");
  const [filterFaction, setFilterFaction] = useState("");
  const [search, setSearch] = useState("");

  const allDetachments = useMemo(getAllDetachments, []);
  const availableDispositions = getAvailableDispositions(roster);
  const dispCounts = getDispositionCounts(roster);

  const filteredDetachments = useMemo(() => {
    const query = search.toLowerCase().trim();
    let pool = allDetachments.filter((d) =>
      availableDispositions.includes(d.detachment.d)
    );

    if (filterGroup) {
      const groupFactions = GROUPS[filterGroup] || [];
      pool = pool.filter((d) => groupFactions.includes(d.faction));
    }
    if (filterFaction) {
      pool = pool.filter((d) => d.faction === filterFaction);
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
  }, [allDetachments, availableDispositions, filterGroup, filterFaction, search]);

  const factionOptions = useMemo(() => {
    let facs = Object.keys(FACTIONS);
    if (filterGroup) {
      facs = GROUPS[filterGroup] || facs;
    }
    return facs.sort();
  }, [filterGroup]);

  function addToRoster(det: Detachment, faction: string) {
    if (roster.length >= MAX_ARMIES) return;
    if (!availableDispositions.includes(det.d)) return;
    setRoster([...roster, { detachment: det, faction }]);
  }

  function removeFromRoster(index: number) {
    setRoster(roster.filter((_, i) => i !== index));
  }

  const isComplete = roster.length === MAX_ARMIES;
  const totalDp = roster.reduce((s, r) => s + r.detachment.dp, 0);

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
        <h1 className="text-lg font-semibold text-[#e8e8f0] tracking-tight">
          Hold Roster Builder
        </h1>
        <p className="text-xs text-[#8888a0] mt-1">
          8 hære · Hver disposition mindst 1× · Max 2× per disposition · Max 3
          DP per hær
        </p>
      </header>

      <div className="flex flex-col lg:flex-row">
        {/* Roster panel */}
        <div className="lg:w-[380px] shrink-0 border-b lg:border-b-0 lg:border-r border-white/[0.08] p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#e8e8f0]">
              Dit hold ({roster.length}/{MAX_ARMIES})
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#8888a0]">
                {totalDp} DP total
              </span>
              {roster.length > 0 && (
                <button
                  onClick={() => setRoster([])}
                  className="text-[11px] text-red-400 hover:text-red-300 transition-colors"
                >
                  Reset
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
              return (
                <span
                  key={d}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded ${full ? "opacity-40" : ""}`}
                  style={{ background: s.bg, color: s.color }}
                >
                  {d.split(" ")[0]} {count}/{MAX_PER_DISPOSITION}
                </span>
              );
            })}
          </div>

          {/* Roster slots */}
          <div className="space-y-2">
            {roster.map((slot, i) => {
              const s = DISP_STYLES[slot.detachment.d];
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-[#1a1a22] border border-white/[0.08] rounded-lg px-3 py-2"
                >
                  <span className="text-xs font-semibold text-[#8888a0] w-5">
                    {i + 1}.
                  </span>
                  <div
                    className="w-1.5 h-8 rounded-full shrink-0"
                    style={{ background: s.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-[#e8e8f0] truncate">
                      {slot.detachment.n}
                      {slot.detachment.new && (
                        <span className="ml-1.5 text-[9px] font-semibold px-1 py-px rounded bg-[rgba(34,197,94,0.15)] text-[#4ade80]">
                          NEW
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#8888a0]">
                      {slot.faction} · {slot.detachment.dp} DP
                    </div>
                  </div>
                  <span
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
                    style={{ background: s.bg, color: s.color }}
                  >
                    {slot.detachment.d}
                  </span>
                  <button
                    onClick={() => removeFromRoster(i)}
                    className="text-[#8888a0] hover:text-red-400 transition-colors ml-1 text-sm"
                    title="Fjern"
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {Array.from({ length: MAX_ARMIES - roster.length }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex items-center gap-2 border border-dashed border-white/[0.08] rounded-lg px-3 py-2.5"
              >
                <span className="text-xs font-semibold text-[#8888a0]/40 w-5">
                  {roster.length + i + 1}.
                </span>
                <span className="text-[11px] text-[#8888a0]/40">
                  Vælg detachment...
                </span>
              </div>
            ))}
          </div>

          {isComplete && (
            <div className="mt-4 p-3 bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.2)] rounded-lg">
              <div className="text-[13px] font-semibold text-[#4ade80]">
                Hold komplet!
              </div>
              <div className="text-[11px] text-[#8888a0] mt-0.5">
                {roster.length} hære · {totalDp} DP total
              </div>
            </div>
          )}
        </div>

        {/* Detachment picker */}
        <div className="flex-1 min-w-0">
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

          {isComplete ? (
            <div className="px-6 py-12 text-center text-[#8888a0]">
              Holdet er komplet — fjern en hær for at vælge en anden
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
                    const s = DISP_STYLES[det.d];
                    const alreadyPicked = roster.some(
                      (r) =>
                        r.detachment.n === det.n && r.faction === faction
                    );
                    return (
                      <tr
                        key={`${faction}-${det.n}`}
                        className={`group ${alreadyPicked ? "opacity-30" : ""}`}
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
                          <span
                            className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded whitespace-nowrap"
                            style={{ background: s.bg, color: s.color }}
                          >
                            <span
                              className="w-[5px] h-[5px] rounded-full shrink-0 opacity-50"
                              style={{ background: "currentColor" }}
                            />
                            {det.d}
                          </span>
                        </td>
                        <td className="px-4 py-[7px] border-b border-white/[0.08] group-hover:bg-[#1a1a22]">
                          {!alreadyPicked && (
                            <button
                              onClick={() => addToRoster(det, faction)}
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
