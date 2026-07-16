"use client";

import Link from "next/link";
import {
  type Detachment,
  type Disposition,
  FACTIONS,
  GROUPS,
  DISPOSITIONS,
  slugify,
} from "@/lib/data";
import { DispositionBadge } from "./DispositionBadge";

interface Props {
  filterDisposition?: Disposition | "";
  filterGroup?: string;
  searchQuery?: string;
  singleFaction?: string;
}

export function DetachmentTable({
  filterDisposition = "",
  filterGroup = "",
  searchQuery = "",
  singleFaction,
}: Props) {
  const query = searchQuery.toLowerCase().trim();

  let factionNames: string[];
  if (singleFaction) {
    factionNames = [singleFaction];
  } else {
    factionNames = Object.keys(FACTIONS);
    if (filterGroup) {
      factionNames = GROUPS[filterGroup] || factionNames;
    }
  }

  const sectionMap: Record<string, string[]> = {};
  if (singleFaction) {
    sectionMap[""] = [singleFaction];
  } else if (filterGroup) {
    sectionMap[filterGroup] = factionNames;
  } else {
    for (const [g, fs] of Object.entries(GROUPS)) {
      sectionMap[g] = fs.filter((f) => factionNames.includes(f));
    }
  }

  let total = 0;
  const sections: {
    section: string;
    factions: { faction: string; rows: Detachment[] }[];
  }[] = [];

  for (const [section, fs] of Object.entries(sectionMap)) {
    const factionEntries: { faction: string; rows: Detachment[] }[] = [];
    for (const fac of fs) {
      let rows = FACTIONS[fac] || [];
      if (filterDisposition) rows = rows.filter((r) => r.d === filterDisposition);
      if (query) {
        rows = rows.filter(
          (r) =>
            r.n.toLowerCase().includes(query) ||
            (r.d ?? "").toLowerCase().includes(query) ||
            fac.toLowerCase().includes(query)
        );
      }
      if (rows.length === 0) continue;
      factionEntries.push({ faction: fac, rows });
      total += rows.length;
    }
    if (factionEntries.length > 0) {
      sections.push({ section, factions: factionEntries });
    }
  }

  return (
    <>
      <div className="px-4 sm:px-6 py-2 border-b border-white/[0.08]">
        <span className="text-[11px] text-[#8888a0] bg-[#22222e] px-2 py-0.5 rounded-full border border-white/[0.08]">
          {total} detachment{total !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left text-[11px] font-medium text-[#8888a0] bg-[#1a1a22] border-b border-white/[0.08] sticky top-0 z-10 whitespace-nowrap w-[220px]">
                Detachment
              </th>
              <th className="px-4 py-2 text-center text-[11px] font-medium text-[#8888a0] bg-[#1a1a22] border-b border-white/[0.08] sticky top-0 z-10 whitespace-nowrap w-[40px]">
                DP
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-medium text-[#8888a0] bg-[#1a1a22] border-b border-white/[0.08] sticky top-0 z-10 whitespace-nowrap">
                Force Disposition
              </th>
            </tr>
          </thead>
          <tbody>
            {sections.map(({ section, factions }) => (
              <SectionBlock key={section} section={section} factions={factions} singleFaction={!!singleFaction} />
            ))}
            {total === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-8 text-center text-[#8888a0]"
                >
                  Ingen detachments matcher filteret
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SectionBlock({
  section,
  factions,
  singleFaction,
}: {
  section: string;
  factions: { faction: string; rows: Detachment[] }[];
  singleFaction: boolean;
}) {
  return (
    <>
      {section && (
        <tr>
          <td
            colSpan={3}
            className="bg-[#22222e] text-[11px] font-semibold text-[#8888a0] px-4 py-1.5 tracking-wider uppercase border-t border-white/[0.14]"
          >
            {section}
          </td>
        </tr>
      )}
      {factions.map(({ faction, rows }) => (
        <FactionBlock key={faction} faction={faction} rows={rows} showHeader={!singleFaction} />
      ))}
    </>
  );
}

function FactionBlock({
  faction,
  rows,
  showHeader,
}: {
  faction: string;
  rows: Detachment[];
  showHeader: boolean;
}) {
  return (
    <>
      {showHeader && (
        <tr>
          <td
            colSpan={3}
            className="bg-white/[0.02] text-[11px] text-[#8888a0] px-4 py-1 pl-7 italic border-t border-white/[0.08]"
          >
            <Link
              href={`/faction/${slugify(faction)}`}
              className="hover:text-[#e8e8f0] transition-colors"
            >
              {faction}
            </Link>
          </td>
        </tr>
      )}
      {rows.map((r) => (
        <tr key={r.n} className="group">
          <td className="px-4 py-[7px] border-b border-white/[0.08] text-[13px] text-[#e8e8f0] group-hover:bg-[#1a1a22]">
            {r.n}
            {r.new && (
              <span className="ml-1.5 text-[9px] font-semibold px-1.5 py-px rounded bg-[rgba(34,197,94,0.15)] text-[#4ade80] tracking-wider align-middle">
                NEW
              </span>
            )}
          </td>
          <td className="px-4 py-[7px] border-b border-white/[0.08] text-xs text-[#8888a0] text-center group-hover:bg-[#1a1a22]">
            {r.dp}
          </td>
          <td className="px-4 py-[7px] border-b border-white/[0.08] group-hover:bg-[#1a1a22]">
            <DispositionBadge disposition={r.d} />
          </td>
        </tr>
      ))}
    </>
  );
}
