"use client";

import { useState } from "react";
import Link from "next/link";
import { type Disposition } from "@/lib/data";
import { FilterBar } from "@/components/FilterBar";
import { Legend } from "@/components/Legend";
import { DetachmentTable } from "@/components/DetachmentTable";

export default function Home() {
  const [disposition, setDisposition] = useState<Disposition | "">("");
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");

  return (
    <>
      <header className="px-4 sm:px-6 py-6 pb-4 border-b border-white/[0.08] flex items-baseline gap-3 flex-wrap">
        <h1 className="text-base font-semibold text-[#e8e8f0] tracking-tight">
          WH40K — Detachment & Disposition Matrix
        </h1>
        <p className="text-xs text-[#8888a0]">11th edition</p>
        <Link
          href="/roster"
          className="ml-auto text-[12px] font-medium text-[#a855f7] hover:text-[#c084fc] transition-colors bg-[rgba(168,85,247,0.1)] px-3 py-1 rounded-md border border-[rgba(168,85,247,0.2)]"
        >
          Roster Builder
        </Link>
      </header>

      <FilterBar
        disposition={disposition}
        group={group}
        search={search}
        onDispositionChange={setDisposition}
        onGroupChange={setGroup}
        onSearchChange={setSearch}
      />

      <Legend />

      <DetachmentTable
        filterDisposition={disposition}
        filterGroup={group}
        searchQuery={search}
      />
    </>
  );
}
