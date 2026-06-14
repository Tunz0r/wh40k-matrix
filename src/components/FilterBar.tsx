"use client";

import { type Disposition, DISPOSITIONS } from "@/lib/data";

interface Props {
  disposition: Disposition | "";
  group: string;
  search: string;
  onDispositionChange: (d: Disposition | "") => void;
  onGroupChange: (g: string) => void;
  onSearchChange: (q: string) => void;
}

export function FilterBar({
  disposition,
  group,
  search,
  onDispositionChange,
  onGroupChange,
  onSearchChange,
}: Props) {
  return (
    <div className="px-4 sm:px-6 py-3 flex flex-wrap gap-2.5 items-center border-b border-white/[0.08]">
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Søg detachment eller faction..."
        className="bg-[#1a1a22] text-[#e8e8f0] border border-white/[0.14] rounded-md px-3 py-1.5 text-[13px] font-[inherit] outline-none placeholder:text-[#8888a0] hover:border-white/25 focus:border-[#a855f7] w-full sm:w-64 transition-colors"
      />
      <select
        value={disposition}
        onChange={(e) =>
          onDispositionChange(e.target.value as Disposition | "")
        }
        className="bg-[#1a1a22] text-[#e8e8f0] border border-white/[0.14] rounded-md px-2.5 py-1.5 text-[13px] font-[inherit] cursor-pointer outline-none hover:border-white/25 focus:border-[#a855f7]"
      >
        <option value="">Alle dispositioner</option>
        {DISPOSITIONS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select
        value={group}
        onChange={(e) => onGroupChange(e.target.value)}
        className="bg-[#1a1a22] text-[#e8e8f0] border border-white/[0.14] rounded-md px-2.5 py-1.5 text-[13px] font-[inherit] cursor-pointer outline-none hover:border-white/25 focus:border-[#a855f7]"
      >
        <option value="">Alle grupper</option>
        <option value="Space Marines">Space Marines</option>
        <option value="Imperial">Imperium</option>
        <option value="Chaos">Chaos</option>
        <option value="Xenos">Xenos</option>
      </select>
    </div>
  );
}
