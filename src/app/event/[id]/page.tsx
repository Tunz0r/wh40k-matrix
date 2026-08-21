"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useActiveTournament } from "@/lib/active-tournament";
import { getEvent, registerTeamForEvent, slugifyId, type EventMeta } from "@/lib/events";

// The shareable event page. A captain opens /event/{id} (shared by the organizer)
// and registers THEIR team — creating their own isolated prep camp under the
// event, prepping the same shared field. Event metadata is readable by any signed-in
// user so registration works without the organizer doing anything.
export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { setActive } = useActiveTournament();
  const [ev, setEv] = useState<EventMeta | null | undefined>(undefined);
  const [teamName, setTeamName] = useState("");
  const [teamSize, setTeamSize] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getEvent(id).then((e) => { if (live) { setEv(e); setTeamSize(e?.teamSize ?? 8); } }).catch(() => { if (live) setEv(null); });
    return () => { live = false; };
  }, [id]);

  const campId = teamName.trim() ? slugifyId(`${id}-${teamName}`) : "";

  async function register() {
    if (!user || !ev || !teamName.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await registerTeamForEvent({ eventId: id, campId, teamName: teamName.trim(), teamSize: teamSize ?? undefined });
      setActive(campId);
      window.location.assign(`/manage`); // straight to inviting your players
    } catch {
      setErr("Kunne ikke registrere holdet. Er navnet allerede brugt?");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-xl border border-white/[0.08] bg-[#131318] p-6 space-y-4">
        {ev === undefined ? (
          <p className="text-[12px] text-[#8888a0]">Indlæser…</p>
        ) : ev === null ? (
          <p className="text-[12px] text-[#8888a0]">Dette event findes ikke.</p>
        ) : (
          <>
            <div>
              <div className="text-[11px] text-[#8888a0] uppercase tracking-wider font-semibold">Event</div>
              <div className="text-[16px] font-semibold text-[#e8e8f0]">{ev.name}</div>
              <div className="text-[11px] text-[#8888a0] mt-0.5">
                {ev.format || `${ev.teamSize ?? 8} spillere`}{ev.rounds ? ` · ${ev.rounds} runder` : ""}
              </div>
            </div>

            <p className="text-[12px] text-[#c8c8d8] leading-relaxed">
              Registrér dit hold for at prep&apos;e mod det samme felt. Dit holds roster og estimater er
              helt private — I deler kun modstander-listerne.
            </p>

            <div className="space-y-1">
              <label className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold block">Dit holds navn</label>
              <input
                autoFocus
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") register(); }}
                placeholder="f.eks. Team Sverige"
                className="w-full bg-[#1a1a22] border border-white/[0.14] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] outline-none focus:border-[#a855f7]"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-[#8888a0]">Holdstørrelse</label>
              <select
                value={teamSize ?? 8}
                onChange={(e) => setTeamSize(Number(e.target.value))}
                className="text-[12px] px-2 py-1 rounded-md bg-[#1a1a22] border border-white/[0.14] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
              >
                <option value={8}>8 spillere (WTC)</option>
                <option value={5}>5 spillere</option>
              </select>
            </div>
            {campId && <p className="text-[10px] text-[#8888a0]">URL: <code className="text-[#c8c8d4]">/tournament/{campId}</code></p>}

            {err && <p className="text-[11px] text-[#f87171]">{err}</p>}

            <button
              onClick={register}
              disabled={busy || !teamName.trim() || !user}
              className="w-full text-sm font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-4 py-2.5 rounded-lg transition-colors disabled:opacity-40"
            >
              {busy ? "Registrerer…" : "Registrér mit hold"}
            </button>

            <Link href="/tournament" className="block text-[11px] text-[#8888a0] hover:text-[#e8e8f0] transition-colors">
              ← Mine turneringer
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
