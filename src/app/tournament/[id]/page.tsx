"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  ensureRegistry,
  getTournament,
  type TournamentMeta,
} from "@/lib/tournaments-registry";
import { useActiveTournament } from "@/lib/active-tournament";
import TournamentDashboard from "./dashboard";

export default function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { setActive } = useActiveTournament();
  // undefined = loading, null = not found.
  const [meta, setMeta] = useState<TournamentMeta | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    // Best-effort WTC seed — must NOT block loading this tournament. It reads
    // WTC 2026's registry entry, which a user who isn't on Team Denmark can't
    // read; if that's chained, every other team's own dashboard would 404.
    ensureRegistry().catch(() => {});
    getTournament(id)
      .then((m) => {
        if (cancelled) return;
        setMeta(m);
        if (m) setActive(m.id); // viewing a tournament makes it the active one
      })
      .catch(() => { if (!cancelled) setMeta(null); });
    return () => { cancelled = true; };
    // setActive is stable enough; re-run only on id change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Every tournament renders its own dashboard, scoped by dataSlug + team size.
  return (
    <>
      {crumb}
      <TournamentDashboard
        slug={meta.dataSlug}
        teamName={meta.teamName}
        teamSize={meta.teamSize ?? 8}
        fieldSlug={meta.fieldSlug}
      />
    </>
  );
}
