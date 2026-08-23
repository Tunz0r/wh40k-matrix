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
  setSlotName,
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
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

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
  const claimedCount = armies.filter((a) => a.claimedByUid).length;
  const inviteLink = `${origin}/join/${activeSlug}`;

  // People you can put on a seat: everyone already on THIS team (current
  // claimants) + known people from your other tournaments. Deduped by uid, with
  // the known/correct name winning over a possibly-mislabelled roster name.
  const teamPeople = (() => {
    const m = new Map<string, string>();
    for (const a of armies) if (a.claimedByUid) m.set(a.claimedByUid, a.player?.trim() || a.claimedByUid.slice(0, 6));
    for (const k of known) m.set(k.uid, k.name); // known name wins
    return [...m].map(([uid, name]) => ({ uid, name }));
  })();

  // Assign a person to a seat via the dropdown. If they already hold another seat,
  // free that one first so nobody ends up on two seats (the duplicate bug).
  async function assignPerson(idx: number, uid: string, name: string) {
    const other = armies.findIndex((a, j) => j !== idx && a.claimedByUid === uid);
    await run(
      `asg${idx}`,
      async () => {
        if (other >= 0) await releaseSlot(activeSlug, other);
        await assignSlot(activeSlug, idx, uid, name);
        await recomputeMembership();
      },
      `${name} sat på plads ${idx + 1}.`
    );
  }

  function copyLink() {
    navigator.clipboard?.writeText(inviteLink);
  }

  // One click: open the join window AND copy the link, ready to paste on Discord.
  async function openAndCopy() {
    await run("join", () => setJoinOpen(activeSlug, true), "Tilmelding åben — link kopieret. Del det med holdet.");
    copyLink();
  }

  async function saveName(idx: number) {
    const n = editName.trim();
    if (!n) return;
    await run(`name${idx}`, () => setSlotName(activeSlug, idx, n), "Navn opdateret.");
    setEditIdx(null);
  }

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
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-[#e8e8f0]">Invitér holdet</h2>
          {open && <span className="text-[10px] text-[#4ade80] font-semibold shrink-0">● Tilmelding åben</span>}
        </div>

        {armies.length === 0 ? (
          <p className="text-[11px] text-[#8888a0]">Sæt antal pladser herunder først — så kan holdet vælge en plads.</p>
        ) : !open ? (
          <>
            <p className="text-[11px] text-[#c8c8d8] leading-relaxed">
              Del linket med holdet (fx på Discord). De logger ind, skriver deres navn, vælger en plads — og er med med det samme.
            </p>
            <button
              onClick={openAndCopy}
              disabled={busy === "join"}
              className="text-[12px] font-semibold px-3 py-2 rounded-md bg-[#a855f7] hover:bg-[#9333ea] text-white transition-colors disabled:opacity-50"
            >
              {busy === "join" ? "…" : "Åbn tilmelding & kopiér link"}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={inviteLink}
                onFocus={(e) => e.target.select()}
                className="flex-1 text-[11px] px-3 py-1.5 rounded-md border border-white/[0.14] bg-[#1a1a22] text-[#c8c8d8] outline-none"
              />
              <button
                onClick={() => { copyLink(); setMsg("Link kopieret."); }}
                className="text-[11px] px-2.5 py-1.5 rounded-md border border-white/[0.14] text-[#c8c8d8] hover:border-[#a855f7]"
              >
                Kopiér
              </button>
            </div>
            <button
              onClick={() => run("join", () => setJoinOpen(activeSlug, false), "Tilmelding lukket.")}
              disabled={busy === "join"}
              className="text-[11px] text-[#8888a0] hover:text-[#f87171] transition-colors"
            >
              Luk tilmelding, når holdet er samlet
            </button>
          </>
        )}
      </section>

      {/* The team */}
      <section className="space-y-2">
        <h2 className="text-[11px] uppercase tracking-wider text-[#8888a0] font-semibold">
          Holdet ({claimedCount}/{armies.length})
        </h2>
        <p className="text-[11px] text-[#8888a0] leading-relaxed">
          Spillerne tilmelder sig selv via linket ovenfor og vælger deres egen hær — du behøver ikke sætte nogen i pladser.
          Sæt bare holdstørrelsen herunder.
        </p>

        {/* Team size */}
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <span className="text-[#8888a0]">Holdstørrelse:</span>
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
              if (n >= 1 && n <= 12) run("seats", () => applySeatCount(n).then(() => recomputeMembership()), `Holdstørrelse sat til ${n}.`);
            }}
            disabled={busy === "seats"}
            className="px-2.5 py-1 rounded-md bg-[#a855f7] hover:bg-[#9333ea] text-white font-semibold transition-colors disabled:opacity-50"
          >
            {busy === "seats" ? "…" : "Sæt"}
          </button>
        </div>

        {armies.length === 0 && (
          <p className="text-[12px] text-[#8888a0]">Sæt holdstørrelsen, så holdet kan tilmelde sig.</p>
        )}

        {armies.map((a, idx) => {
          const claimed = !!a.claimedByUid;
          return (
            <div key={idx} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-[#131318] px-3 py-2">
              {claimed && editIdx === idx ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveName(idx); if (e.key === "Escape") setEditIdx(null); }}
                    className="flex-1 text-[12px] px-2 py-1 rounded-md border border-white/[0.14] bg-[#1a1a22] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
                  />
                  <button
                    onClick={() => saveName(idx)}
                    disabled={busy === `name${idx}` || !editName.trim()}
                    className="text-[11px] px-2 py-1 rounded-md bg-[#a855f7] hover:bg-[#9333ea] text-white font-semibold transition-colors disabled:opacity-50"
                  >
                    Gem
                  </button>
                  <button onClick={() => setEditIdx(null)} className="text-[11px] text-[#8888a0] hover:text-[#e8e8f0]">Annullér</button>
                </div>
              ) : claimed ? (
                <>
                  <span className="text-[13px] text-[#e8e8f0] flex-1 flex items-center gap-2 min-w-0">
                    <span className="truncate">{a.player?.trim() || "Spiller"}</span>
                    <span className="text-[10px] text-[#8888a0] shrink-0">{a.faction ? `· ${a.faction}` : "· hær ikke valgt"}</span>
                    <button
                      onClick={() => { setEditIdx(idx); setEditName(a.player?.trim() || ""); }}
                      title="Ret navnet"
                      className="text-[10px] text-[#8888a0] hover:text-[#c084fc] transition-colors shrink-0"
                    >
                      ✎
                    </button>
                  </span>
                  <button
                    onClick={() => run(`rel${idx}`, () => releaseSlot(activeSlug, idx).then(() => recomputeMembership()), "Spiller fjernet.")}
                    disabled={busy === `rel${idx}`}
                    title="Fjern spilleren fra holdet"
                    className="text-[11px] text-[#8888a0] hover:text-[#f87171] transition-colors shrink-0"
                  >
                    Fjern
                  </button>
                </>
              ) : (
                <>
                  <span className="text-[12px] text-[#8888a0] flex-1">Ledig plads</span>
                  {(() => {
                    const taken = new Set(armies.map((x) => x.claimedByUid).filter(Boolean) as string[]);
                    const avail = teamPeople.filter((p) => !taken.has(p.uid));
                    return avail.length > 0 ? (
                      <select
                        value=""
                        onChange={(e) => {
                          const p = avail.find((x) => x.uid === e.target.value);
                          if (p) assignPerson(idx, p.uid, p.name);
                        }}
                        disabled={busy === `asg${idx}`}
                        className="text-[11px] px-2 py-1 rounded-md border border-white/[0.14] bg-[#1a1a22] text-[#8888a0] outline-none focus:border-[#a855f7] max-w-[180px] shrink-0"
                      >
                        <option value="">+ Tilføj spiller manuelt…</option>
                        {avail.map((p) => (
                          <option key={p.uid} value={p.uid}>{p.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[10px] text-[#8888a0] shrink-0">venter på tilmelding</span>
                    );
                  })()}
                </>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
