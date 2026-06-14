import { DISPOSITIONS, DISP_STYLES } from "@/lib/data";

export function Legend() {
  return (
    <div className="flex flex-wrap gap-3 px-4 sm:px-6 py-2 border-b border-white/[0.08]">
      {DISPOSITIONS.map((d) => (
        <div
          key={d}
          className="flex items-center gap-1.5 text-xs text-[#8888a0]"
        >
          <div
            className="w-2 h-2 rounded-sm"
            style={{ background: DISP_STYLES[d].color }}
          />
          {d}
        </div>
      ))}
    </div>
  );
}
