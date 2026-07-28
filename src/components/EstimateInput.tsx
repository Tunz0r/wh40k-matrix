"use client";

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
  // corner chip; folded into the value when `adjusted` is on.
  dispBP?: number;
  adjusted?: boolean;
}) {
  const base = cell?.v;
  const effective = base != null ? Math.max(0, Math.min(20, base + dispBP)) : undefined;
  const showAdj = !!adjusted && dispBP !== 0 && effective != null;
  const shown = showAdj ? effective : base;
  const style = shown != null ? estimateStyle(shown) : null;
  const editable = !locked && !showAdj;
  return (
    <div className="relative">
      <input
        type="number"
        min={0}
        max={20}
        value={shown ?? ""}
        disabled={!editable}
        onChange={(e) => {
          if (!editable) return;
          if (e.target.value === "") { onChange(null); return; }
          onChange(Math.max(0, Math.min(20, Number(e.target.value) || 0)));
        }}
        className={`w-11 h-9 text-center text-[13px] font-bold rounded border outline-none focus:border-[#a855f7] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${cell?.auto ? "opacity-70" : ""} ${locked ? "cursor-not-allowed opacity-60" : ""} ${showAdj ? "cursor-default" : ""}`}
        style={
          style
            ? { background: style.bg, color: style.fg, borderColor: style.border }
            : { background: "#1a1a22", color: "#e8e8f0", borderColor: "rgba(255,255,255,0.14)" }
        }
        title={
          showAdj
            ? `Disp-justeret: ${base} ${dispBP > 0 ? "+" : ""}${dispBP} → ${effective}`
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
      {dispBP !== 0 && (
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
