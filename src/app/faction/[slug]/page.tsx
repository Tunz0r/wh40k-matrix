"use client";

import { use, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  type Disposition,
  FACTIONS,
  DISPOSITIONS,
  getFactionBySlug,
  getGroupForFaction,
} from "@/lib/data";
import { Legend } from "@/components/Legend";
import { DetachmentTable } from "@/components/DetachmentTable";

export default function FactionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const factionName = getFactionBySlug(slug);
  if (!factionName) notFound();

  const group = getGroupForFaction(factionName);
  const detachments = FACTIONS[factionName];
  const [filterDisposition, setFilterDisposition] = useState<Disposition | "">(
    ""
  );

  const dispCounts: Record<string, number> = {};
  for (const d of detachments) {
    if (d.d) dispCounts[d.d] = (dispCounts[d.d] || 0) + 1;
  }

  return (
    <>
      <header className="px-4 sm:px-6 py-6 pb-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-2 text-xs text-[#8888a0] mb-2">
          <Link href="/" className="hover:text-[#e8e8f0] transition-colors">
            Matrix
          </Link>
          <span>/</span>
          {group && (
            <>
              <span>{group}</span>
              <span>/</span>
            </>
          )}
          <span className="text-[#e8e8f0]">{factionName}</span>
        </div>
        <h1 className="text-lg font-semibold text-[#e8e8f0] tracking-tight">
          {factionName}
        </h1>
        <p className="text-xs text-[#8888a0] mt-1">
          {detachments.length} detachments ·{" "}
          {detachments.filter((d) => d.new).length} nye
        </p>
      </header>

      <div className="px-4 sm:px-6 py-3 flex flex-wrap gap-2.5 items-center border-b border-white/[0.08]">
        <select
          value={filterDisposition}
          onChange={(e) =>
            setFilterDisposition(e.target.value as Disposition | "")
          }
          className="bg-[#1a1a22] text-[#e8e8f0] border border-white/[0.14] rounded-md px-2.5 py-1.5 text-[13px] font-[inherit] cursor-pointer outline-none hover:border-white/25 focus:border-[#a855f7]"
        >
          <option value="">Alle dispositioner</option>
          {DISPOSITIONS.map((d) => (
            <option key={d} value={d}>
              {d} ({dispCounts[d] || 0})
            </option>
          ))}
        </select>
      </div>

      <Legend />

      <DetachmentTable
        filterDisposition={filterDisposition}
        singleFaction={factionName}
      />
    </>
  );
}
