"use client";

import { useEffect, useState } from "react";
import { useActiveTournament } from "@/lib/active-tournament";
import { useActivePlayer } from "@/lib/active-player";
import { useAuth } from "@/lib/auth";
import {
  subscribeToTournament,
  setJoinOpen,
  releaseSlot,
  assignSlot,
  type TournamentDoc,
} from "@/lib/tournament-db";
import { recomputeMembership, fetchKnownPeople } from "@/lib/membership";

// Owner/captain (or super-admin) management of the ACTIVE tournament: open the
// join window, share the invite link, see who has claimed which slot, kick, and
// finalize (recompute membership) to admit new claimants.
export default function ManagePage() {
  const { active, activeSlug } = useActiveTournament();
  const { canManage } = useActivePlayer();
  const { user } = useAuth();
  const [doc, setDoc] = useState<TournamentDoc | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [known, setKnown] = useState<{ uid: string; name: string }[]>([]);

  useEffect(() => subscribeToTournament(activeSlug, setDoc), [activeSlug]);
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (user?.uid) fetchKnownPeople(user.uid, activeSlug).then(setKnown).catch(() => setKnown([]));
  }, [user?.uid, activeSlug]);

  if (!canManage) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-[#8888a0]">
        Ingen adgang. Kun kaptajnen for denne turnering.
      </div>
    );
  }

  const open = !!doc?._join?.open;
  const armies = doc?.roster?.armies || [];
  const inviteLink = `${origin}/join/${activeSlug}`;

  async function run(key: string, fn: () => Promise<void>, ok?: string) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg(ok);
    } catch {
      setMsg("Handlingen fejlede.");
    }
    setBusy(null);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-[#e8e8f0]">Administrér hold</h1>
        <p className="text-[12px] text-[#8888a0] mt-0.5">{active?.name}</p>
      </div>

      {msg && <p className="text-[12px] text-[#4ade80]">{msg}</p>}

      {/* Join window */}
      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-wider text-[#8888a0] font-semibold">Tilmelding</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => run("join", () => setJoinOpen(activeSlug, !open), open ? "Tilmelding lukket." : "Tilmelding åben.")}
            disabled={busy === "join"}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-md transition-colors ${
              open ? "bg-[#4ade80]/15 text-[#4ade80] border border-[#4ade80]/40" : "bg-[#1a1a22] text-[#c8c8d8] border border-white/[0.14] hover:border-[#a855f7]"
            }`}
          >
            {open ? "● Åben — luk tilmelding" : "○ Lukket — åbn tilmelding"}
          </button>
          <span className="text-[11px] text-[#8888a0]">
            Mens den er åben kan holdkammerater vælge deres plads via linket.
          </span>
        </div>
        {open && (
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={inviteLink}
              onFocus={(e) => e.target.select()}
              className="flex-1 text-[11px] px-3 py-1.5 rounded-md border border-white/[0.14] bg-[#1a1a22] text-[#c8c8d8] outline-none"
            />
            <button
              onClick={() => { navigator.clipboard?.writeText(inviteLink); setMsg("Link kopieret."); }}
              className="text-[11px] px-2.5 py-1.5 rounded-md border border-white/[0.14] text-[#c8c8d8] hover:border-[#a855f7]"
            >
              Kopiér
            </button>
          </div>
        )}
      </section>

      {/* Slots + claims */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] uppercase tracking-wider text-[#8888a0] font-semibold">Pladser ({armies.length})</h2>
          <button
            onClick={() => run("recompute", recomputeMembership, "Færdiggjort — nye spillere har adgang.")}
            disabled={busy === "recompute"}
            className="text-[12px] px-3 py-1.5 rounded-md bg-[#a855f7] hover:bg-[#9333ea] text-white font-semibold transition-colors disabled:opacity-50"
          >
            {busy === "recompute" ? "…" : "Færdiggør (giv adgang)"}
          </button>
        </div>
        {armies.length === 0 && (
          <p className="text-[12px] text-[#8888a0]">
            Ingen pladser endnu — byg rosteret under <span className="text-[#c084fc]">Roster</span> først.
          </p>
        )}
        {armies.map((a, idx) => (
          <div key={idx} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-[#131318] px-3 py-2">
            <span className="text-[13px] text-[#e8e8f0] flex-1">
              {a.player?.trim() || `Plads ${idx + 1}`}
              <span className="text-[10px] text-[#8888a0]"> · {a.faction}</span>
            </span>
            {a.claimedByUid ? (
              <>
                <span className="text-[10px] text-[#4ade80]">valgt</span>
                <button
                  onClick={() => run(`rel${idx}`, () => releaseSlot(activeSlug, idx).then(() => recomputeMembership()), "Plads frigivet.")}
                  disabled={busy === `rel${idx}`}
                  className="text-[11px] text-[#8888a0] hover:text-[#f87171] transition-colors"
                >
                  Frigiv
                </button>
              </>
            ) : (
              <>
                <span className="text-[10px] text-[#8888a0]">ledig</span>
                {(() => {
                  const taken = new Set(armies.map((x) => x.claimedByUid).filter(Boolean) as string[]);
                  const avail = known.filter((k) => !taken.has(k.uid));
                  return avail.length > 0 ? (
                    <select
                      value=""
                      onChange={(e) => {
                        const p = avail.find((k) => k.uid === e.target.value);
                        if (p) run(`asg${idx}`, () => assignSlot(activeSlug, idx, p.uid, p.name).then(() => recomputeMembership()), `${p.name} tilføjet.`);
                      }}
                      disabled={busy === `asg${idx}`}
                      className="text-[11px] px-2 py-1 rounded-md border border-white/[0.14] bg-[#1a1a22] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
                    >
                      <option value="">+ Tilføj kendt spiller…</option>
                      {avail.map((k) => (
                        <option key={k.uid} value={k.uid}>{k.name}</option>
                      ))}
                    </select>
                  ) : null;
                })()}
              </>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
