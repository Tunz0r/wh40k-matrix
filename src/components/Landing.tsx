"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { addTournament } from "@/lib/tournaments-registry";
import { useActiveTournament } from "@/lib/active-tournament";
import { slugifyId } from "@/lib/events";
import EventBrowser from "@/components/EventBrowser";

// Shown to a signed-in user who isn't on a team yet. They can browse the public
// events directory and sign their team up, create an event, join a team roster
// via an invite link, or spin up a standalone tournament.
export default function Landing() {
  const { user, signOutUser } = useAuth();
  const { setActive } = useActiveTournament();
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamSize, setTeamSize] = useState(8);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const id = useMemo(() => slugifyId(name.trim()), [name]);
  const [invite, setInvite] = useState("");

  function enter(campId: string) {
    setActive(campId);
    window.location.assign(`/tournament/${campId}`);
  }

  // Accept a full invite link (…/join/{slug}) or a bare slug/code.
  function goJoin() {
    const v = invite.trim();
    if (!v) return;
    const m = v.match(/\/join\/([^/?#]+)/);
    const slug = m ? m[1] : slugifyId(v);
    if (slug) window.location.assign(`/join/${slug}`);
  }

  async function create() {
    if (!name.trim() || !id || !teamName.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await addTournament({ id, name: name.trim(), dataSlug: id, teamName: teamName.trim(), teamSize, status: "upcoming" });
      enter(id);
    } catch {
      setErr("Kunne ikke oprette. Er navnet allerede brugt?");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[80vh] px-4 py-8">
      <div className="w-full max-w-md mx-auto space-y-5">
        <div>
          <div className="text-[15px] font-semibold text-[#e8e8f0]">Velkommen{user?.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}</div>
          <div className="text-[12px] text-[#8888a0] mt-1 leading-relaxed">
            Tilmeld dit hold til et event herunder — eller opret et nyt event.
          </div>
        </div>

        {/* The public events directory: see, create, sign up. */}
        <EventBrowser myCamps={[]} onEnter={enter} />

        {/* Secondary options */}
        <div className="pt-2 border-t border-white/[0.08]">
          <button onClick={() => setMore((v) => !v)} className="text-[11px] text-[#8888a0] hover:text-[#e8e8f0] transition-colors">
            {more ? "Skjul andre muligheder" : "Andre muligheder (invitationslink, enkelt-hold)…"}
          </button>
        </div>

        {more && (
          <div className="space-y-5">
            {/* Join a team roster via an invite link (player-level) */}
            <div className="space-y-2">
              <label className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold block">Har du et invitationslink til et holds roster?</label>
              <div className="flex items-center gap-2">
                <input value={invite} onChange={(e) => setInvite(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") goJoin(); }} placeholder="Indsæt link, fx …/join/team-danmark" className="flex-1 bg-[#1a1a22] border border-white/[0.14] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] outline-none focus:border-[#a855f7]" />
                <button onClick={goJoin} disabled={!invite.trim()} className="text-[12px] font-semibold px-4 py-2 rounded-md bg-[#1a1a22] border border-white/[0.14] text-[#c8c8d8] hover:border-[#a855f7] transition-colors disabled:opacity-40">Tilslut</button>
              </div>
            </div>

            {/* Standalone tournament (one team, not part of an event) */}
            <div className="space-y-2">
              <label className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold block">Eller opret et enkelt-hold (ikke et event)</label>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Navn, f.eks. Lokal turnering" className="w-full bg-[#1a1a22] border border-white/[0.14] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] outline-none focus:border-[#a855f7]" />
              <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Dit holds navn, f.eks. Team Danmark" className="w-full bg-[#1a1a22] border border-white/[0.14] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] outline-none focus:border-[#a855f7]" />
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-[#8888a0]">Holdstørrelse</label>
                <select value={teamSize} onChange={(e) => setTeamSize(Number(e.target.value))} className="text-[12px] px-2 py-1 rounded-md bg-[#1a1a22] border border-white/[0.14] text-[#e8e8f0] outline-none focus:border-[#a855f7]">
                  <option value={8}>8 spillere (WTC)</option>
                  <option value={5}>5 spillere</option>
                </select>
              </div>
              {err && <p className="text-[11px] text-[#f87171]">{err}</p>}
              <button onClick={create} disabled={busy || !name.trim() || !teamName.trim()} className="w-full text-sm font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-4 py-2.5 rounded-lg transition-colors disabled:opacity-40">
                {busy ? "Opretter..." : "Opret enkelt-hold"}
              </button>
            </div>
          </div>
        )}

        <button onClick={() => signOutUser()} className="text-[11px] text-[#8888a0] hover:text-[#e8e8f0] transition-colors">
          Log ud
        </button>
      </div>
    </div>
  );
}
