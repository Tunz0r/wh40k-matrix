"use client";

import { useState } from "react";
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
