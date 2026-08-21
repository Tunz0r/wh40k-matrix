"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ensureRegistry,
  subscribeToRegistry,
  addTournament,
  type TournamentMeta,
  type TournamentStatus,
} from "@/lib/tournaments-registry";
import {
  addEvent,
  subscribeToEvents,
  subscribeToMyEvents,
  convertCampToEvent,
  slugifyId,
  type EventMeta,
} from "@/lib/events";
import { subscribeToTournament, type TournamentDoc } from "@/lib/tournament-db";
import { recomputeMembership } from "@/lib/membership";
import { computeStandings } from "@/lib/standings";
import { useActiveTournament } from "@/lib/active-tournament";
import { useActivePlayer } from "@/lib/active-player";
import { useAuth } from "@/lib/auth";
import { subscribeToMyTournaments } from "@/lib/membership";

const STATUS: Record<TournamentStatus, { label: string; cls: string }> = {
  upcoming: { label: "Kommende", cls: "bg-[#22222e] text-[#8888a0]" },
  active: { label: "I gang", cls: "bg-[rgba(34,197,94,0.12)] text-[#4ade80]" },
  completed: { label: "Afsluttet", cls: "bg-[rgba(168,85,247,0.14)] text-[#c084fc]" },
};

export default function TournamentIndexPage() {
  const [list, setList] = useState<TournamentMeta[]>([]);
  const [events, setEvents] = useState<EventMeta[]>([]);
  const [docs, setDocs] = useState<Record<string, TournamentDoc | null>>({});
  const { setActive } = useActiveTournament();
  const { isAdmin } = useActivePlayer();
  const { user } = useAuth();
  const [origin, setOrigin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  // Admins read everything; a normal member sees only their own camps + events.
  useEffect(() => {
    if (isAdmin) {
      ensureRegistry().catch(() => {});
      const a = subscribeToRegistry(setList);
      const b = subscribeToEvents(setEvents);
      return () => { a(); b(); };
    }
    if (user) {
      const a = subscribeToMyTournaments(user.uid, setList);
      const b = subscribeToMyEvents(user.uid, setEvents);
      return () => { a(); b(); };
    }
    setList([]);
    setEvents([]);
  }, [isAdmin, user]);

  useEffect(() => {
    const unsubs = list.map((t) =>
      subscribeToTournament(t.dataSlug, (d) => setDocs((prev) => ({ ...prev, [t.id]: d })))
    );
    return () => unsubs.forEach((u) => u());
  }, [list]);

  // Camps grouped by event; standalone camps have no eventId.
  const campsByEvent = useMemo(() => {
    const m: Record<string, TournamentMeta[]> = {};
    for (const t of list) if (t.eventId) (m[t.eventId] ||= []).push(t);
    return m;
  }, [list]);
  const standalone = useMemo(() => list.filter((t) => !t.eventId), [list]);

  // --- Create event ---------------------------------------------------------
  const [addingEvent, setAddingEvent] = useState(false);
  const [evName, setEvName] = useState("");
  const [evSize, setEvSize] = useState(8);
  const [evRounds, setEvRounds] = useState(7);
  const [evBusy, setEvBusy] = useState(false);
  const evId = useMemo(() => slugifyId(evName.trim()), [evName]);
  const evTaken = events.some((e) => e.id === evId);
  async function createEvent() {
    if (!evName.trim() || !evId || evTaken || evBusy) return;
    setEvBusy(true);
    try {
      await addEvent({ id: evId, name: evName.trim(), teamSize: evSize, rounds: evRounds, format: `${evSize} spillere · ${evRounds} runder`, status: "upcoming" });
      setEvName("");
      setAddingEvent(false);
      setMsg("Event oprettet — del linket, så holdene kan registrere sig.");
    } finally {
      setEvBusy(false);
    }
  }

  // --- Create standalone tournament ----------------------------------------
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

  // --- Admin: convert a standalone camp into an event ----------------------
  const [converting, setConverting] = useState<string | null>(null);
  async function convert(camp: TournamentMeta) {
    setConverting(camp.id);
    setMsg(null);
    try {
      await convertCampToEvent({ campSlug: camp.dataSlug, eventName: camp.name });
      await recomputeMembership().catch(() => {});
      setMsg(`"${camp.name}" er nu et event — del linket, så flere hold kan være med.`);
    } catch {
      setMsg("Kunne ikke konvertere. Er DB-reglerne for _fields publiceret?");
    }
    setConverting(null);
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
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => { setAddingEvent((v) => !v); setAdding(false); }} className="text-[12px] font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-3 py-1.5 rounded-lg transition-colors">
              {addingEvent ? "Annullér" : "+ Nyt event"}
            </button>
            <button onClick={() => { setAdding((v) => !v); setAddingEvent(false); }} className="text-[12px] font-semibold text-[#c8c8d8] border border-white/[0.14] hover:border-[#a855f7] px-3 py-1.5 rounded-lg transition-colors">
              {adding ? "Annullér" : "+ Enkelt hold"}
            </button>
          </div>
        </div>
      </header>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-3">
        {msg && <p className="text-[12px] text-[#4ade80]">{msg}</p>}

        {/* Create event */}
        {addingEvent && (
          <div className="rounded-xl border border-[rgba(168,85,247,0.25)] bg-[rgba(168,85,247,0.04)] p-4 space-y-2">
            <p className="text-[12px] text-[#c8c8d8]">Et event er selve turneringen. Flere hold registrerer sig og prep&apos;er mod det samme delte felt — hvert hold isoleret.</p>
            <div className="flex items-center gap-2">
              <input autoFocus value={evName} onChange={(e) => setEvName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createEvent(); }} placeholder="Eventets navn, f.eks. WTC 2027" className="flex-1 h-9 px-3 text-[13px] rounded-lg bg-[#1a1a22] border border-white/[0.12] text-[#e8e8f0] outline-none focus:border-[#a855f7]" />
              <button onClick={createEvent} disabled={!evId || evTaken || evBusy} className="text-[12px] font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-4 py-2 rounded-lg transition-colors disabled:opacity-40">Opret</button>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <label className="flex items-center gap-1.5 text-[#8888a0]">Holdstørrelse
                <select value={evSize} onChange={(e) => setEvSize(Number(e.target.value))} className="text-[12px] px-2 py-1 rounded-md bg-[#1a1a22] border border-white/[0.12] text-[#e8e8f0] outline-none focus:border-[#a855f7]">
                  <option value={8}>8</option>
                  <option value={5}>5</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-[#8888a0]">Runder
                <input type="number" min={1} max={12} value={evRounds} onChange={(e) => setEvRounds(Number(e.target.value))} className="w-14 text-[12px] px-2 py-1 rounded-md bg-[#1a1a22] border border-white/[0.12] text-[#e8e8f0] outline-none focus:border-[#a855f7]" />
              </label>
            </div>
            {evId && <p className={`text-[10px] ${evTaken ? "text-[#f87171]" : "text-[#8888a0]"}`}>{evTaken ? `"${evId}" findes allerede` : <>Link: <code className="text-[#c8c8d4]">/event/{evId}</code></>}</p>}
          </div>
        )}

        {/* Create standalone tournament */}
        {adding && (
          <div className="rounded-xl border border-white/[0.14] bg-white/[0.02] p-4 space-y-2">
            <p className="text-[12px] text-[#8888a0]">Ét hold, egen prep — ikke en del af et fælles event.</p>
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

        {/* Events */}
        {events.map((ev) => {
          const camps = campsByEvent[ev.id] || [];
          const link = `${origin}/event/${ev.id}`;
          return (
            <div key={ev.id} className="rounded-xl border border-[rgba(168,85,247,0.25)] bg-[rgba(168,85,247,0.03)] p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[9px] uppercase tracking-wider text-[#c084fc] font-bold bg-[rgba(168,85,247,0.12)] px-1.5 py-0.5 rounded">Event</span>
                <h2 className="text-sm font-semibold text-[#e8e8f0]">{ev.name}</h2>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${STATUS[ev.status].cls}`}>{STATUS[ev.status].label}</span>
                <span className="text-[10px] text-[#8888a0]">{ev.teamSize ?? 8} spillere{ev.rounds ? ` · ${ev.rounds} runder` : ""}</span>
              </div>

              {/* Camps under this event */}
              <div className="space-y-1.5">
                {camps.length === 0 ? (
                  <p className="text-[11px] text-[#8888a0]">Ingen hold registreret endnu.</p>
                ) : (
                  camps.map((t) => (
                    <Link key={t.id} href={`/tournament/${t.id}`} onClick={() => setActive(t.id)} className="block rounded-lg border border-white/[0.08] px-3 py-2 hover:border-white/[0.2] hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-[#e8e8f0]">{t.teamName}</span>
                        <span className="ml-auto text-[#8888a0]">→</span>
                      </div>
                      {record(t)}
                    </Link>
                  ))
                )}
              </div>

              {/* Share / register */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <Link href={`/event/${ev.id}`} className="text-[11px] font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-3 py-1.5 rounded-md transition-colors">Registrér et hold</Link>
                <button onClick={() => { navigator.clipboard?.writeText(link); setMsg("Event-link kopieret."); }} className="text-[11px] px-2.5 py-1.5 rounded-md border border-white/[0.14] text-[#c8c8d8] hover:border-[#a855f7] transition-colors">Kopiér invitationslink</button>
              </div>
            </div>
          );
        })}

        {/* Standalone camps */}
        {standalone.map((t) => (
          <div key={t.id} className="rounded-xl border border-white/[0.08] p-4 hover:border-white/[0.2] transition-colors">
            <Link href={`/tournament/${t.id}`} onClick={() => setActive(t.id)} className="block">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-[#e8e8f0]">{t.name}</h2>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${STATUS[t.status].cls}`}>{STATUS[t.status].label}</span>
                <span className="text-[10px] text-[#8888a0]">{t.teamSize ?? 8}v{t.teamSize ?? 8}</span>
                <span className="ml-auto text-[#8888a0]">→</span>
              </div>
              {record(t)}
            </Link>
            {isAdmin && (
              <button onClick={() => convert(t)} disabled={converting === t.id} className="mt-2 text-[10px] text-[#c084fc] hover:text-[#a855f7] transition-colors disabled:opacity-50">
                {converting === t.id ? "Konverterer…" : "Gør til event (flere hold kan være med)"}
              </button>
            )}
          </div>
        ))}

        {list.length === 0 && events.length === 0 && <p className="text-[12px] text-[#8888a0]">Ingen turneringer endnu.</p>}
      </div>
    </>
  );
}
