"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ensureRegistry,
  subscribeToRegistry,
  addTournament,
  deleteTournament,
  type TournamentMeta,
  type TournamentStatus,
} from "@/lib/tournaments-registry";
import { convertCampToEvent, slugifyId } from "@/lib/events";
import { subscribeToTournament, type TournamentDoc } from "@/lib/tournament-db";
import { recomputeMembership, subscribeToMyTournaments } from "@/lib/membership";
import { computeStandings } from "@/lib/standings";
import { useActiveTournament } from "@/lib/active-tournament";
import { useActivePlayer } from "@/lib/active-player";
import { useAuth } from "@/lib/auth";
import EventBrowser from "@/components/EventBrowser";

const STATUS: Record<TournamentStatus, { label: string; cls: string }> = {
  upcoming: { label: "Kommende", cls: "bg-[#22222e] text-[#8888a0]" },
  active: { label: "I gang", cls: "bg-[rgba(34,197,94,0.12)] text-[#4ade80]" },
  completed: { label: "Afsluttet", cls: "bg-[rgba(168,85,247,0.14)] text-[#c084fc]" },
};

export default function TournamentIndexPage() {
  const [list, setList] = useState<TournamentMeta[]>([]);
  const [docs, setDocs] = useState<Record<string, TournamentDoc | null>>({});
  const { setActive } = useActiveTournament();
  const { isAdmin } = useActivePlayer();
  const { user } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);

  // Admins read the whole registry; a member sees only their own camps.
  useEffect(() => {
    if (isAdmin) {
      ensureRegistry().catch(() => {});
      return subscribeToRegistry(setList);
    }
    if (user) return subscribeToMyTournaments(user.uid, setList);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setList([]);
  }, [isAdmin, user]);

  useEffect(() => {
    const unsubs = list.map((t) =>
      subscribeToTournament(t.dataSlug, (d) => setDocs((prev) => ({ ...prev, [t.id]: d })))
    );
    return () => unsubs.forEach((u) => u());
  }, [list]);

  const standalone = useMemo(() => list.filter((t) => !t.eventId), [list]);

  function enter(campId: string) {
    setActive(campId);
    window.location.assign(`/tournament/${campId}`);
  }

  // Create a standalone (non-event) tournament — one team, own prep.
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamSize, setTeamSize] = useState(8);
  const [busy, setBusy] = useState(false);
  const proposedId = useMemo(() => slugifyId(name.trim()), [name]);
  const idTaken = list.some((t) => t.id === proposedId);
  async function create() {
    const nm = name.trim();
    if (!nm || !proposedId || idTaken || !teamName.trim() || busy) return;
    setBusy(true);
    try {
      await addTournament({ id: proposedId, name: nm, dataSlug: proposedId, teamName: teamName.trim(), teamSize, status: "upcoming" });
      setActive(proposedId);
      setName("");
      setTeamName("");
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }

  // Admin: convert a standalone camp into an event.
  const [converting, setConverting] = useState<string | null>(null);
  async function convert(camp: TournamentMeta) {
    setConverting(camp.id);
    setMsg(null);
    try {
      await convertCampToEvent({ camp, eventName: camp.name });
      await recomputeMembership().catch(() => {});
      setMsg(`"${camp.name}" er nu et event — andre hold kan tilmelde sig herunder.`);
    } catch (e) {
      console.error("convertCampToEvent failed:", e);
      setMsg("Kunne ikke konvertere: " + (e instanceof Error ? e.message : String(e)));
    }
    setConverting(null);
  }

  const [deleting, setDeleting] = useState<string | null>(null);
  async function del(camp: TournamentMeta) {
    if (!confirm(`Slet holdet "${camp.teamName}" permanent? Roster, estimater, runder og coaching slettes. Kan ikke fortrydes.`)) return;
    setDeleting(camp.id);
    setMsg(null);
    try {
      await deleteTournament(camp);
      setMsg(`"${camp.teamName}" slettet.`);
    } catch (e) {
      setMsg("Kunne ikke slette: " + (e instanceof Error ? e.message : String(e)));
    }
    setDeleting(null);
  }

  function record(t: TournamentMeta) {
    const doc = docs[t.id];
    const st = doc?.rounds?.length ? computeStandings(doc.rounds, { teamSize: t.teamSize, totalRounds: t.rounds }) : null;
    const played = st?.played ?? 0;
    return st && played > 0 ? (
      <div className="mt-1 flex items-center gap-3 text-[12px]">
        <span className="font-bold">
          <span className="text-[#4ade80]">{st.wins}</span>
          <span className="text-[#8888a0]">-</span>
          <span className="text-[#facc15]">{st.draws}</span>
          <span className="text-[#8888a0]">-</span>
          <span className="text-[#f87171]">{st.losses}</span>
        </span>
        <span className="text-[#8888a0]">{st.teamPoints} TP</span>
        <span className="text-[#8888a0]">{played} {played === 1 ? "runde" : "runder"}</span>
      </div>
    ) : (
      <p className="mt-1 text-[11px] text-[#8888a0]">Ingen spillede runder endnu</p>
    );
  }

  return (
    <>
      <header className="px-4 sm:px-6 py-4 border-b border-white/[0.08] sticky top-12 bg-[#0f0f13] z-20">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-[#e8e8f0] tracking-tight">Turneringer</h1>
        </div>
      </header>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
        {msg && <p className="text-[12px] text-[#4ade80]">{msg}</p>}

        {/* Public events directory — see, create, and sign up */}
        <EventBrowser myCamps={list} onEnter={enter} userUid={user?.uid} isAdmin={isAdmin} allCamps={list} />

        {/* Standalone tournaments (not part of an event) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-[12px] uppercase tracking-wider text-[#8888a0] font-semibold">Enkelt-hold</h2>
            <button onClick={() => setAdding((v) => !v)} className="ml-auto text-[11px] font-semibold text-[#c084fc] hover:text-[#a855f7] transition-colors">
              {adding ? "Annullér" : "+ Nyt enkelt-hold"}
            </button>
          </div>

          {adding && (
            <div className="rounded-xl border border-white/[0.14] bg-white/[0.02] p-4 space-y-2">
              <p className="text-[11px] text-[#8888a0]">Ét hold, egen prep — ikke en del af et event.</p>
              <div className="flex items-center gap-2">
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Navn, f.eks. Lokal turnering" className="flex-1 h-9 px-3 text-[13px] rounded-lg bg-[#1a1a22] border border-white/[0.12] text-[#e8e8f0] outline-none focus:border-[#a855f7]" />
                <button onClick={create} disabled={!proposedId || idTaken || !teamName.trim() || busy} className="text-[12px] font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-4 py-2 rounded-lg transition-colors disabled:opacity-40">Opret</button>
              </div>
              <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Holdnavn, f.eks. Team Danmark" className="w-full h-9 px-3 text-[13px] rounded-lg bg-[#1a1a22] border border-white/[0.12] text-[#e8e8f0] outline-none focus:border-[#a855f7]" />
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-[#8888a0]">Holdstørrelse</label>
                <select value={teamSize} onChange={(e) => setTeamSize(Number(e.target.value))} className="text-[12px] px-2 py-1 rounded-md bg-[#1a1a22] border border-white/[0.12] text-[#e8e8f0] outline-none focus:border-[#a855f7]">
                  <option value={8}>8 spillere (WTC)</option>
                  <option value={5}>5 spillere</option>
                </select>
              </div>
              {idTaken && <p className="text-[10px] text-[#f87171]">&quot;{proposedId}&quot; findes allerede</p>}
            </div>
          )}

          {standalone.length === 0 ? (
            <p className="text-[11px] text-[#8888a0]">Ingen enkelt-hold.</p>
          ) : (
            standalone.map((t) => (
              <div key={t.id} className="rounded-xl border border-white/[0.08] p-4 hover:border-white/[0.2] transition-colors">
                <Link href={`/tournament/${t.id}`} onClick={() => setActive(t.id)} className="block">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-[#e8e8f0]">{t.name}</h3>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${STATUS[t.status].cls}`}>{STATUS[t.status].label}</span>
                    <span className="text-[10px] text-[#8888a0]">{t.teamSize ?? 8}v{t.teamSize ?? 8}</span>
                    <span className="ml-auto text-[#8888a0]">→</span>
                  </div>
                  {record(t)}
                </Link>
                {isAdmin && (
                  <div className="mt-2 flex items-center gap-3">
                    <button onClick={() => convert(t)} disabled={converting === t.id} className="text-[10px] text-[#c084fc] hover:text-[#a855f7] transition-colors disabled:opacity-50">
                      {converting === t.id ? "Konverterer…" : "Gør til event (så andre hold kan tilmelde sig)"}
                    </button>
                    <button onClick={() => del(t)} disabled={deleting === t.id} className="text-[10px] text-[#8888a0] hover:text-[#f87171] transition-colors disabled:opacity-50">
                      {deleting === t.id ? "Sletter…" : "Slet hold"}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Admin: every camp registered under an event — delete stray/test teams. */}
        {isAdmin && list.some((t) => t.eventId) && (
          <div className="space-y-2">
            <h2 className="text-[12px] uppercase tracking-wider text-[#8888a0] font-semibold">Event-hold (admin)</h2>
            {list.filter((t) => t.eventId).map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border border-white/[0.06] px-3 py-2">
                <Link href={`/tournament/${t.id}`} onClick={() => setActive(t.id)} className="text-[12px] text-[#e8e8f0] hover:text-[#c084fc] flex-1 min-w-0 truncate">
                  {t.teamName} <span className="text-[10px] text-[#8888a0]">· {t.name}</span>
                </Link>
                <button onClick={() => del(t)} disabled={deleting === t.id} className="text-[11px] text-[#8888a0] hover:text-[#f87171] transition-colors disabled:opacity-50 shrink-0">
                  {deleting === t.id ? "Sletter…" : "Slet"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
