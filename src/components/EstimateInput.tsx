"use client";

import { type EstimateCell, estimateStyle } from "@/lib/estimates-db";

export default function EstimateInput({
  cell,
  onChange,
  locked,
}: {
  cell: EstimateCell | undefined;
  onChange: (v: number | null) => void;
  locked?: boolean;
}) {
  const style = cell ? estimateStyle(cell.v) : null;
  return (
    <div className="relative">
      <input
        type="number"
        min={0}
        max={20}
        value={cell?.v ?? ""}
        disabled={locked}
        onChange={(e) => {
          if (e.target.value === "") { onChange(null); return; }
          onChange(Math.max(0, Math.min(20, Number(e.target.value) || 0)));
        }}
        className={`w-11 h-9 text-center text-[13px] font-bold rounded border outline-none focus:border-[#a855f7] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${cell?.auto ? "opacity-70" : ""} ${locked ? "cursor-not-allowed opacity-60" : ""}`}
        style={
          style
            ? { background: style.bg, color: style.fg, borderColor: style.border }
            : { background: "#1a1a22", color: "#e8e8f0", borderColor: "rgba(255,255,255,0.14)" }
        }
        title={locked ? "Låst — holdet er allerede spillet" : cell?.auto ? "Auto-udfyldt fra lignende liste — skriv for at overstyre" : undefined}
      />
      {cell?.auto && (
        <span className="absolute top-0.5 right-1 text-[8px] text-[#8888a0] pointer-events-none">a</span>
      )}
    </div>
  );
}
