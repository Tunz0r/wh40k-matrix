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
  saveTeamSetup,
  type TournamentDoc,
} from "@/lib/tournament-db";
import type { RosterArmy } from "@/lib/roster";
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
  const [seatInput, setSeatInput] = useState("");

  useEffect(() => subscribeToTournament(activeSlug, setDoc), [activeSlug]);
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (user?.uid) fetchKnownPeople(user.uid, activeSlug).then(setKnown).catch(() => setKnown([]));
  }, [user?.uid, activeSlug]);
  // Auto-admit: whenever the captain opens this page, fold any new claims into
  // membership so claimants get access without a separate "finalize" click.
  useEffect(() => {
    if (canManage) recomputeMembership().catch(() => {});
  }, [canManage, activeSlug]);

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

  // Create/resize the team to N EMPTY seats — people can join and claim a seat
  // by name before anyone has decided their army; the faction is filled in later.
  // Existing seats (with claims / armies) are preserved.
  async function applySeatCount(n: number) {
    const existing = doc?.roster?.armies || [];
    const emptySeat = (): RosterArmy => ({ faction: "", detachments: [], disposition: null });
    const nextArmies: RosterArmy[] = Array.from({ length: n }, (_, i) => existing[i] || emptySeat());
    await saveTeamSetup(activeSlug, {
      roster: { v: 1, name: doc?.teamName || active?.teamName || "Hold", armies: nextArmies },
    });
  }

  const defaultSeats = active?.teamSize ?? 5;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-[#e8e8f0]">Administrér hold</h1>
        <p className="text-[12px] text-[#8888a0] mt-0.5">{active?.name}</p>
      </div>

      {msg && <p className="text-[12px] text-[#4ade80]">{msg}</p>}

      {/* Invite the team */}
      <section className="rounded-xl border border-[rgba(168,85,247,0.25)] bg-[rgba(168,85,247,0.04)] p-4 space-y-3">
        <h2 className="text-[13px] font-semibold text-[#e8e8f0]">Invitér holdet</h2>
        <ol className="text-[11px] text-[#c8c8d8] leading-relaxed list-decimal pl-4 space-y-0.5">
          <li>Aktivér tilmelding.</li>
          <li>Del linket herunder med holdet (fx på Discord).</li>
          <li>De logger ind, vælger deres plads — og får automatisk adgang.</li>
        </ol>

        <div className="flex items-center gap-2">
          <button
            onClick={() => run("join", () => setJoinOpen(activeSlug, !open), open ? "Tilmelding lukket." : "Tilmelding aktiv — del linket.")}
            disabled={busy === "join"}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-md transition-colors ${
              open ? "bg-[#4ade80]/15 text-[#4ade80] border border-[#4ade80]/40" : "bg-[#a855f7] hover:bg-[#9333ea] text-white"
            }`}
          >
            {open ? "● Tilmelding aktiv — klik for at lukke" : "Aktivér tilmelding"}
          </button>
        </div>

        <div className={`flex items-center gap-2 ${open ? "" : "opacity-40 pointer-events-none"}`}>
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
            Kopiér link
          </button>
        </div>
        {!open && <p className="text-[10px] text-[#8888a0]">Aktivér tilmelding for at linket virker. Luk det igen, når holdet er samlet.</p>}
      </section>

      {/* Slots + claims */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] uppercase tracking-wider text-[#8888a0] font-semibold">Pladser ({armies.length})</h2>
          <button
            onClick={() => run("recompute", recomputeMembership, "Adgang opdateret.")}
            disabled={busy === "recompute"}
            title="Kører automatisk når du åbner siden"
            className="text-[11px] px-2.5 py-1.5 rounded-md border border-white/[0.14] text-[#c8c8d8] hover:border-[#a855f7] transition-colors disabled:opacity-50"
          >
            {busy === "recompute" ? "…" : "Opdatér adgang"}
          </button>
        </div>
        {/* Seat count — create empty seats before armies are known. */}
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <span className="text-[#8888a0]">Antal pladser på holdet:</span>
          <input
            type="number"
            min={1}
            max={12}
            value={seatInput}
            onChange={(e) => setSeatInput(e.target.value)}
            placeholder={String(armies.length || defaultSeats)}
            className="w-16 px-2 py-1 rounded-md border border-white/[0.14] bg-[#1a1a22] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
          />
          <button
            onClick={() => {
              const n = Number(seatInput || armies.length || defaultSeats);
              if (n >= 1 && n <= 12) run("seats", () => applySeatCount(n).then(() => recomputeMembership()), `${n} pladser sat.`);
            }}
            disabled={busy === "seats"}
            className="px-2.5 py-1 rounded-md bg-[#a855f7] hover:bg-[#9333ea] text-white font-semibold transition-colors disabled:opacity-50"
          >
            {busy === "seats" ? "…" : "Sæt pladser"}
          </button>
          <span className="text-[#8888a0]">Hærene vælges senere.</span>
        </div>
        {armies.length === 0 && (
          <p className="text-[12px] text-[#8888a0]">Sæt antal pladser, så holdet kan tilmelde sig.</p>
        )}
        {armies.map((a, idx) => (
          <div key={idx} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-[#131318] px-3 py-2">
            <span className="text-[13px] text-[#e8e8f0] flex-1">
              {a.player?.trim() || `Plads ${idx + 1}`}
              {a.faction ? <span className="text-[10px] text-[#8888a0]"> · {a.faction}</span> : <span className="text-[10px] text-[#8888a0]"> · hær ikke valgt</span>}
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
