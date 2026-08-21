"use client";

import { use, useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { DISP_STYLES } from "@/lib/data";
import { formatUnitsLines } from "@/lib/list-parser";
import {
  subscribeToOpponents,
  fetchRawLists,
  type OpponentMap,
  type OpponentList,
} from "@/lib/estimates-db";
import { useActiveTournament } from "@/lib/active-tournament";

// Render one verbatim WTC list (from the document) with light styling: datasheet
// headers stand out, enhancements are highlighted amber, model/wargear detail is
// dimmed. Shown faithfully — this is the actual submitted list, not a summary.
function RawList({ text }: { text: string }) {
  return (
    <div className="text-[12px] leading-[1.55]">
      {text.split("\n").map((raw, i) => {
        const line = raw.trimEnd();
        const bulleted = /^[•*‣·-]/.test(line);
        let cls = "text-[#c8c8d4]";
        if (/enhancement/i.test(line)) cls = "text-[#facc15]";
        else if (/^attached unit/i.test(line)) cls = "text-[#5a5a6a] text-[10px] uppercase tracking-wide mt-1";
        else if (/\(\d+\s*points?\)/i.test(line) && !bulleted) cls = "text-[#e8e8f0] font-semibold mt-2";
        else if (bulleted) cls = "text-[#8888a0]";
        return (
          <div key={i} className={cls}>
            {line || " "}
          </div>
        );
      })}
    </div>
  );
}

// Read-only reader for one opponent country's 8 lists — a grid of armies that
// each open a full-size, projector-friendly single-list view. Built for the
// pairing table: click the country on /tournament, skim its armies, open the
// one you're weighing up. Arrow keys flip between armies in the detail view.
export default function CountryListsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { activeSlug, activeFieldSlug } = useActiveTournament();
  const [opponents, setOpponents] = useState<OpponentMap>({});
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [raw, setRaw] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      return subscribeToOpponents((m) => { setOpponents(m); setLoaded(true); }, activeSlug, true, activeFieldSlug);
    } catch {}
  }, [activeSlug, activeFieldSlug]);

  // Verbatim lists live in the field/sibling node — fetched on demand.
  useEffect(() => {
    let live = true;
    fetchRawLists(slug, activeSlug, activeFieldSlug).then((r) => { if (live) setRaw(r); }).catch(() => {});
    return () => { live = false; };
  }, [slug, activeSlug, activeFieldSlug]);

  const team = opponents[slug];
  const armies = useMemo(() => team?.armies || [], [team]);

  const step = useCallback(
    (dir: number) =>
      setSelected((s) => (s === null ? s : (s + dir + armies.length) % armies.length)),
    [armies.length]
  );

  // Arrow-key navigation while reading a single list.
  useEffect(() => {
    if (selected === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, step]);

  const dispChip = (disp: OpponentList["disposition"], big?: boolean) =>
    disp ? (
      <span
        className={`font-semibold rounded whitespace-nowrap ${big ? "text-[12px] px-2 py-0.5" : "text-[9px] px-1.5 py-0.5"}`}
        style={{ background: DISP_STYLES[disp].bg, color: DISP_STYLES[disp].color }}
      >
        {disp}
      </span>
    ) : null;

  const header = (
    <header className="px-4 sm:px-6 py-4 border-b border-white/[0.08] sticky top-12 bg-[#0f0f13] z-20">
      <div className="flex items-center gap-2 text-[11px] text-[#8888a0] mb-1">
        <Link href="/tournament" className="hover:text-[#e8e8f0] transition-colors">Turnering</Link>
        <span>/</span>
        <span className="text-[#e8e8f0]">Lister</span>
      </div>
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-[#e8e8f0] tracking-tight">
          {team?.name || slug}
        </h1>
        {team?.tier && <span className="text-[11px] text-[#8888a0]">{team.tier}</span>}
        {armies.length > 0 && <span className="text-[11px] text-[#8888a0]">{armies.length} lister</span>}
      </div>
    </header>
  );

  if (!team || !armies.length) {
    return (
      <>
        {header}
        <div className="p-4 sm:p-6 max-w-3xl mx-auto">
          <p className="text-[12px] text-[#8888a0]">
            {!loaded
              ? "Indlæser lister…"
              : "Ingen lister indlæst for dette land endnu — tilføj dem under Estimater → Pr. land."}
          </p>
        </div>
      </>
    );
  }

  // --- Full-size single list ---
  if (selected !== null && armies[selected]) {
    const a = armies[selected];
    const lines = a.units?.length ? formatUnitsLines(a.units).split("\n") : [];
    return (
      <>
        {header}
        <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSelected(null)}
              className="text-[11px] text-[#a855f7] hover:text-[#c084fc] transition-colors"
            >
              ← Alle lister
            </button>
            <span className="text-[10px] text-[#8888a0]">Liste {selected + 1}/{armies.length}</span>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => step(-1)} title="Forrige (←)" className="text-[13px] text-[#8888a0] hover:text-[#e8e8f0] px-2 py-0.5 rounded border border-white/[0.1] transition-colors">‹</button>
              <button onClick={() => step(1)} title="Næste (→)" className="text-[13px] text-[#8888a0] hover:text-[#e8e8f0] px-2 py-0.5 rounded border border-white/[0.1] transition-colors">›</button>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.08] p-5">
            <div className="flex items-baseline gap-3 flex-wrap mb-1">
              <h2 className="text-2xl font-bold text-[#e8e8f0] tracking-tight">{a.faction}</h2>
              {dispChip(a.disposition, true)}
            </div>
            <p className="text-[13px] text-[#c8c8d4] mb-1">{(a.detachments || []).join(", ") || "—"}</p>
            {a.player && <p className="text-[11px] text-[#8888a0]">Spiller: {a.player}</p>}
            {a.notes && (
              <p className="mt-3 text-[12px] text-[#facc15] bg-[rgba(250,204,21,0.06)] border border-[rgba(250,204,21,0.15)] rounded-md px-3 py-2 whitespace-pre-wrap">
                🔍 {a.notes}
              </p>
            )}

            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              {raw[selected] ? (
                <RawList text={raw[selected]} />
              ) : lines.length ? (
                <>
                  <p className="text-[10px] text-[#8888a0] mb-2">Fuld liste ikke tilgængelig — viser enheds-oversigt.</p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
                    {lines.map((u, k) => (
                      <li key={k} className="flex items-baseline gap-2 text-[14px] text-[#e8e8f0] leading-snug">
                        <span className="text-[#4b4b5a] shrink-0">▪</span>
                        <span>{u}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-[12px] text-[#8888a0]">Ingen liste indsat for denne hær endnu.</p>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // --- Grid of the country's armies ---
  return (
    <>
      {header}
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <p className="text-[11px] text-[#8888a0] mb-3">Vælg en hær for at læse hele listen — praktisk under pairings.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {armies.map((a, j) => (
            <button
              key={j}
              onClick={() => setSelected(j)}
              className="text-left rounded-xl border border-white/[0.08] p-3 hover:border-[#a855f7]/50 hover:bg-[#a855f7]/[0.04] transition-colors"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-bold text-[#8888a0] tabular-nums">{j + 1}.</span>
                <span className="text-[13px] font-semibold text-[#e8e8f0] flex-1 min-w-0 truncate">{a.faction}</span>
                {dispChip(a.disposition)}
              </div>
              <p className="text-[11px] text-[#8888a0] mt-0.5 truncate">{(a.detachments || []).join(", ") || "—"}</p>
              <p className="text-[10px] text-[#8888a0] mt-1">
                {a.units?.length ? `${a.units.length} enheder · læs liste →` : "ingen liste indsat"}
              </p>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
