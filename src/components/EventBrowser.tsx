"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addEvent,
  registerTeamForEvent,
  subscribeToEvents,
  slugifyId,
  type EventMeta,
} from "@/lib/events";
import type { TournamentMeta } from "@/lib/tournaments-registry";

// A public directory of events. Every signed-in user sees all events, can create
// one, and can sign their team up with one click — no invite links. `myCamps`
// lets it show "your team" for events you've already joined; `onEnter` navigates
// into a camp (dashboard/manage) after signup or when clicking your team.
export default function EventBrowser({
  myCamps,
  onEnter,
}: {
  myCamps: TournamentMeta[];
  onEnter: (campId: string) => void;
}) {
  const [events, setEvents] = useState<EventMeta[]>([]);
  useEffect(() => subscribeToEvents(setEvents), []);

  const myCampByEvent = useMemo(() => {
    const m: Record<string, TournamentMeta> = {};
    for (const c of myCamps) if (c.eventId) m[c.eventId] = c;
    return m;
  }, [myCamps]);

  // Create event
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [size, setSize] = useState(8);
  const [rounds, setRounds] = useState(7);
  const [busy, setBusy] = useState(false);
  const id = useMemo(() => slugifyId(name.trim()), [name]);
  const taken = events.some((e) => e.id === id);
  async function create() {
    if (!name.trim() || !id || taken || busy) return;
    setBusy(true);
    try {
      await addEvent({ id, name: name.trim(), teamSize: size, rounds, format: `${size} spillere · ${rounds} runder`, status: "upcoming" });
      setName("");
      setCreating(false);
    } finally {
      setBusy(false);
    }
  }

  // Sign up (register a team)
  const [signupFor, setSignupFor] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [signupBusy, setSignupBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function signup(ev: EventMeta) {
    const nm = teamName.trim();
    if (!nm || signupBusy) return;
    setSignupBusy(true);
    setErr(null);
    try {
      const campId = slugifyId(`${ev.id}-${nm}`);
      await registerTeamForEvent({ eventId: ev.id, campId, teamName: nm, teamSize: ev.teamSize });
      onEnter(campId);
    } catch {
      setErr("Kunne ikke tilmelde. Er holdnavnet allerede brugt i eventet?");
      setSignupBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-[12px] uppercase tracking-wider text-[#8888a0] font-semibold">Events</h2>
        <button onClick={() => setCreating((v) => !v)} className="ml-auto text-[11px] font-semibold text-[#c084fc] hover:text-[#a855f7] transition-colors">
          {creating ? "Annullér" : "+ Nyt event"}
        </button>
      </div>

      {creating && (
        <div className="rounded-xl border border-[rgba(168,85,247,0.25)] bg-[rgba(168,85,247,0.04)] p-4 space-y-2">
          <p className="text-[11px] text-[#c8c8d8]">Et event er selve turneringen. Alle kan se det og tilmelde deres hold — hvert hold prep&apos;er isoleret mod det samme felt.</p>
          <div className="flex items-center gap-2">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") create(); }} placeholder="Eventets navn, f.eks. WTC 2027" className="flex-1 h-9 px-3 text-[13px] rounded-lg bg-[#1a1a22] border border-white/[0.12] text-[#e8e8f0] outline-none focus:border-[#a855f7]" />
            <button onClick={create} disabled={!id || taken || busy} className="text-[12px] font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-4 py-2 rounded-lg transition-colors disabled:opacity-40">Opret</button>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <label className="flex items-center gap-1.5 text-[#8888a0]">Holdstørrelse
              <select value={size} onChange={(e) => setSize(Number(e.target.value))} className="text-[12px] px-2 py-1 rounded-md bg-[#1a1a22] border border-white/[0.12] text-[#e8e8f0] outline-none focus:border-[#a855f7]">
                <option value={8}>8</option>
                <option value={5}>5</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[#8888a0]">Runder
              <input type="number" min={1} max={12} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} className="w-14 text-[12px] px-2 py-1 rounded-md bg-[#1a1a22] border border-white/[0.12] text-[#e8e8f0] outline-none focus:border-[#a855f7]" />
            </label>
          </div>
          {taken && <p className="text-[10px] text-[#f87171]">&quot;{id}&quot; findes allerede</p>}
        </div>
      )}

      {events.length === 0 ? (
        <p className="text-[11px] text-[#8888a0]">Ingen events endnu. Opret et, så kan andre tilmelde deres hold.</p>
      ) : (
        events.map((ev) => {
          const mine = myCampByEvent[ev.id];
          return (
            <div key={ev.id} className="rounded-xl border border-white/[0.08] p-4 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[9px] uppercase tracking-wider text-[#c084fc] font-bold bg-[rgba(168,85,247,0.12)] px-1.5 py-0.5 rounded">Event</span>
                <h3 className="text-sm font-semibold text-[#e8e8f0]">{ev.name}</h3>
                <span className="text-[10px] text-[#8888a0]">{ev.teamSize ?? 8} spillere{ev.rounds ? ` · ${ev.rounds} runder` : ""}</span>
              </div>

              {mine ? (
                <button onClick={() => onEnter(mine.id)} className="w-full flex items-center gap-2 text-left rounded-lg border border-[#4ade80]/30 bg-[#4ade80]/[0.06] px-3 py-2 hover:border-[#4ade80]/60 transition-colors">
                  <span className="text-[10px] text-[#4ade80] font-semibold">Dit hold</span>
                  <span className="text-[12px] text-[#e8e8f0]">{mine.teamName}</span>
                  <span className="ml-auto text-[#8888a0]">→</span>
                </button>
              ) : signupFor === ev.id ? (
                <div className="space-y-2">
                  <input autoFocus value={teamName} onChange={(e) => setTeamName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") signup(ev); }} placeholder="Dit holds navn, f.eks. Team Sverige" className="w-full h-9 px-3 text-[13px] rounded-lg bg-[#1a1a22] border border-white/[0.14] text-[#e8e8f0] outline-none focus:border-[#a855f7]" />
                  <div className="flex items-center gap-2">
                    <button onClick={() => signup(ev)} disabled={!teamName.trim() || signupBusy} className="text-[12px] font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-4 py-2 rounded-lg transition-colors disabled:opacity-40">{signupBusy ? "Tilmelder…" : "Tilmeld"}</button>
                    <button onClick={() => { setSignupFor(null); setErr(null); }} className="text-[11px] text-[#8888a0] hover:text-[#e8e8f0]">Annullér</button>
                  </div>
                  {err && <p className="text-[11px] text-[#f87171]">{err}</p>}
                </div>
              ) : (
                <button onClick={() => { setSignupFor(ev.id); setTeamName(""); setErr(null); }} className="text-[12px] font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-3 py-1.5 rounded-md transition-colors">
                  Tilmeld dit hold
                </button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
