"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { TEAM_SLUG } from "@/lib/team";
import {
  ensureRegistry,
  getTournament,
  type TournamentMeta,
} from "@/lib/tournaments-registry";
import TournamentDashboard from "./dashboard";

export default function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  // undefined = loading, null = not found.
  const [meta, setMeta] = useState<TournamentMeta | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    ensureRegistry()
      .then(() => getTournament(id))
      .then((m) => { if (!cancelled) setMeta(m); })
      .catch(() => { if (!cancelled) setMeta(null); });
    return () => { cancelled = true; };
  }, [id]);

  if (meta === undefined) {
    return <div className="p-6 text-[12px] text-[#8888a0]">Indlæser…</div>;
  }
  if (meta === null) {
    return (
      <div className="p-6">
        <Link href="/tournament" className="text-[11px] text-[#a855f7] hover:text-[#c084fc]">← Turneringer</Link>
        <p className="mt-3 text-[13px] text-[#e8e8f0]">Turneringen &quot;{id}&quot; findes ikke.</p>
      </div>
    );
  }

  const crumb = (
    <div className="px-4 sm:px-6 pt-4">
      <Link href="/tournament" className="text-[11px] text-[#a855f7] hover:text-[#c084fc] transition-colors">
        ← Turneringer
      </Link>
      <span className="text-[11px] text-[#8888a0]"> / {meta.name}</span>
    </div>
  );

  // WTC 2026 wraps the legacy single-tournament data (dataSlug === TEAM_SLUG),
  // so it renders the full dashboard unchanged. Newly-added tournaments have a
  // registry entry but their live data layer (rounds/pairing/estimates keyed to
  // their own dataSlug) is the next phase.
  if (meta.dataSlug === TEAM_SLUG) {
    return (
      <>
        {crumb}
        <TournamentDashboard />
      </>
    );
  }

  return (
    <>
      {crumb}
      <div className="p-4 sm:p-6 max-w-2xl">
        <h1 className="text-lg font-semibold text-[#e8e8f0]">{meta.name}</h1>
        <p className="text-[11px] text-[#8888a0] mt-1">
          {[meta.format, meta.startDate ? new Date(meta.startDate).toLocaleDateString("da-DK") : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-4 rounded-xl border border-[rgba(250,204,21,0.25)] bg-[rgba(250,204,21,0.05)] p-4">
          <p className="text-[12px] text-[#facc15] font-semibold">Data-lag ikke koblet til endnu</p>
          <p className="text-[11px] text-[#8888a0] mt-1">
            Turneringen er oprettet i registret (data-slug <code className="text-[#c8c8d4]">{meta.dataSlug}</code>), men
            runder, parring og estimater kører stadig kun for WTC 2026. Isolering af estimat-databasen pr. turnering er næste skridt.
          </p>
        </div>
      </div>
    </>
  );
}
