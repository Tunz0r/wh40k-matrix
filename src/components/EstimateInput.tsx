"use client";

import { useState } from "react";
import { type EstimateCell, estimateStyle } from "@/lib/estimates-db";

export default function EstimateInput({
  cell,
  onChange,
  locked,
  dispBP = 0,
  adjusted,
}: {
  cell: EstimateCell | undefined;
  onChange: (v: number | null) => void;
  locked?: boolean;
  // Disposition-matchup BP nudge for this cell (our disp vs theirs). Shown as a
  // corner chip; folded into the displayed value when `adjusted` is on.
  dispBP?: number;
  adjusted?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const base = cell?.v;
  const effective = base != null ? Math.max(0, Math.min(20, base + dispBP)) : undefined;
  // Show the disposition-adjusted total when the toggle is on — EXCEPT while the
  // cell is focused, where we drop back to the raw value so you always edit (and
  // see) the underlying estimate. Editing is never blocked; only played-locked
  // cells are read-only.
  const showAdj = !!adjusted && dispBP !== 0 && effective != null && !focused;
  const shown = showAdj ? effective : base;
  const style = shown != null ? estimateStyle(shown) : null;
  return (
    <div className="relative">
      <input
        type="number"
        min={0}
        max={20}
        value={shown ?? ""}
        disabled={locked}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          if (locked) return;
          if (e.target.value === "") { onChange(null); return; }
          onChange(Math.max(0, Math.min(20, Number(e.target.value) || 0)));
        }}
        className={`w-11 h-9 text-center text-[13px] font-bold rounded border outline-none focus:border-[#a855f7] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${cell?.auto ? "opacity-70" : ""} ${locked ? "cursor-not-allowed opacity-60" : ""}`}
        style={
          style
            ? { background: style.bg, color: style.fg, borderColor: style.border }
            : { background: "#1a1a22", color: "#e8e8f0", borderColor: "rgba(255,255,255,0.14)" }
        }
        title={
          showAdj
            ? `Disp-justeret: ${base} ${dispBP > 0 ? "+" : ""}${dispBP} → ${effective} · klik for at redigere det rå estimat`
            : locked
              ? "Låst — holdet er allerede spillet"
              : cell?.auto
                ? "Auto-udfyldt fra lignende liste — skriv for at overstyre"
                : undefined
        }
      />
      {cell?.auto && !showAdj && (
        <span className="absolute top-0.5 right-1 text-[8px] text-[#8888a0] pointer-events-none">a</span>
      )}
      {cell?.volatile && (
        <span
          className="absolute -top-1 -left-1 text-[9px] leading-none pointer-events-none"
          title="Svingende matchup — værdien er gennemsnittet, men resultatet er typisk polariseret (fx 2-18 / 18-2)"
        >
          ⚡
        </span>
      )}
      {cell?.tableDependent && (
        <span
          className="absolute -bottom-1 -left-1 text-[9px] leading-none pointer-events-none"
          title="Meget afhængig af bordvalg/terræn — sæt bord-justeringen omhyggeligt ved layout-valget"
        >
          🗺️
        </span>
      )}
      {dispBP !== 0 && !showAdj && (
        <span
          className="absolute -bottom-1 -right-1 text-[8px] font-bold leading-none px-0.5 rounded bg-[#0f0f13] pointer-events-none"
          style={{ color: dispBP > 0 ? "#4ade80" : "#f87171" }}
          title={`Disposition-fordel: ${dispBP > 0 ? "+" : ""}${dispBP} BP`}
        >
          {dispBP > 0 ? `+${dispBP}` : dispBP}
        </span>
      )}
    </div>
  );
}
