"use client";

import { useState } from "react";
import { FACTIONS, DISPOSITIONS, DISP_STYLES, type Disposition } from "@/lib/data";
import type { RosterArmy } from "@/lib/roster";

// Inline editor for a single army/list: faction, detachments, disposition.
// Used for editing one list without rebuilding a full 8-army roster.
export default function ArmyEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: RosterArmy;
  onSave: (army: RosterArmy) => void;
  onCancel: () => void;
}) {
  const [faction, setFaction] = useState(initial.faction);
  const [detachments, setDetachments] = useState<string[]>(initial.detachments || []);
  const [disposition, setDisposition] = useState<Disposition | null>(initial.disposition ?? null);

  const factionDets = FACTIONS[faction] || [];

  function changeFaction(f: string) {
    setFaction(f);
    setDetachments([]);
  }

  function toggleDet(name: string, d: Disposition) {
    setDetachments((prev) => {
      const next = prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name];
      if (!prev.includes(name) && !disposition) setDisposition(d);
      return next;
    });
  }

  return (
    <div className="rounded-lg border border-[rgba(168,85,247,0.35)] bg-[rgba(168,85,247,0.05)] p-3 space-y-2.5">
      <div>
        <label className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold block mb-1">
          Faction
        </label>
        <select
          value={faction}
          onChange={(e) => changeFaction(e.target.value)}
          className="w-full bg-[#1a1a22] border border-white/[0.14] rounded-md px-2 py-1.5 text-[12px] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
        >
          {Object.keys(FACTIONS).sort().map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold block mb-1">
          Detachments ({detachments.length} valgt)
        </label>
        <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
          {factionDets.map((det) => {
            const checked = detachments.includes(det.n);
            const s = DISP_STYLES[det.d];
            return (
              <button
                key={det.n}
                onClick={() => toggleDet(det.n, det.d)}
                className={`w-full flex items-center gap-2 text-left rounded-md border px-2 py-1 transition-colors ${
                  checked
                    ? "border-[#a855f7]/60 bg-[#a855f7]/10"
                    : "border-white/[0.08] hover:border-white/[0.18]"
                }`}
              >
                <span className={`w-3 h-3 rounded-sm border flex items-center justify-center text-[8px] shrink-0 ${checked ? "bg-[#a855f7] border-[#a855f7] text-white" : "border-white/[0.25]"}`}>
                  {checked ? "✓" : ""}
                </span>
                <span className="text-[11px] text-[#e8e8f0] flex-1 truncate">{det.n}</span>
                <span
                  className="text-[8px] font-semibold px-1 py-0.5 rounded whitespace-nowrap shrink-0"
                  style={{ background: s.bg, color: s.color }}
                >
                  {det.d}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold block mb-1">
          Disposition
        </label>
        <select
          value={disposition ?? ""}
          onChange={(e) => setDisposition((e.target.value || null) as Disposition | null)}
          className="w-full bg-[#1a1a22] border border-white/[0.14] rounded-md px-2 py-1.5 text-[12px] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
        >
          <option value="">— Ingen —</option>
          {DISPOSITIONS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSave({ faction, detachments, disposition })}
          disabled={detachments.length === 0}
          className="text-[11px] font-medium text-white bg-[#a855f7] hover:bg-[#9333ea] px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Gem
        </button>
        <button
          onClick={onCancel}
          className="text-[11px] text-[#8888a0] hover:text-[#e8e8f0] px-3 py-1.5 transition-colors"
        >
          Annullér
        </button>
      </div>
    </div>
  );
}
