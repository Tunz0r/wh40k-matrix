"use client";

import { useState, useRef, useEffect } from "react";
import { type Disposition, DISP_STYLES, MISSIONS } from "@/lib/data";

export function DispositionBadge({ disposition }: { disposition: Disposition }) {
  const [open, setOpen] = useState(false);
  const [flipRight, setFlipRight] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const style = DISP_STYLES[disposition];
  const mission = MISSIONS[disposition];

  useEffect(() => {
    if (open && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      setFlipRight(rect.left + 290 > window.innerWidth);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setTimeout(() => setOpen(false), 150)}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded border border-transparent hover:border-white/20 transition-colors cursor-default whitespace-nowrap"
        style={{ background: style.bg, color: style.color }}
      >
        <span
          className="w-[5px] h-[5px] rounded-full shrink-0 opacity-50"
          style={{ background: "currentColor" }}
        />
        {disposition}
      </button>

      {open && mission && (
        <div
          className={`absolute z-50 top-full mt-2 w-[280px] rounded-[10px] border border-white/[0.14] p-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)] ${
            flipRight ? "right-0" : "left-0"
          }`}
          style={{ background: "#22222e" }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <div
            className="text-xs font-semibold mb-0.5"
            style={{ color: style.color }}
          >
            {disposition}
          </div>
          <div className="text-[11px] text-[#8888a0] mb-2.5 leading-relaxed">
            {mission.desc}
          </div>
          <div className="text-[10px] font-semibold text-[#8888a0] uppercase tracking-wider mb-1.5">
            Primærmission vs modstander
          </div>
          {Object.entries(mission.vs).map(([opp, data]) => {
            const os = DISP_STYLES[opp as Disposition];
            return (
              <div key={opp} className="flex items-start gap-1.5 mb-1.5">
                <span
                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 mt-px whitespace-nowrap"
                  style={{ background: os?.bg, color: os?.color }}
                >
                  {opp}
                </span>
                <span className="text-xs font-medium text-[#e8e8f0] leading-snug">
                  {data.name}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
