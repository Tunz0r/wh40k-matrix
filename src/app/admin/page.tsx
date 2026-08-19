"use client";

import { useEffect, useMemo, useState } from "react";
import { useActivePlayer } from "@/lib/active-player";
import { useAuth } from "@/lib/auth";
import { addPlayer, subscribeToPlayers, type Player } from "@/lib/players";
import {
  subscribeToUsers,
  subscribeToAdmins,
  subscribeToCoaches,
  bindPlayer,
  unbindPlayer,
  assignCoach,
  setAdmin,
  revokeAccess,
  recomputeMembership,
  type AppUser,
  type CoachMap,
} from "@/lib/membership";
import { subscribeToRegistry, type TournamentMeta } from "@/lib/tournaments-registry";

// Admin-only hub: grant/revoke access. Every login shows up here (recorded on
// sign-in); the admin gives each a role — bind to a player, assign as a coach of
// specific tournaments, or make admin. Roles are computed from the sources of
// truth, never stored, so they can't drift.
export default function AdminPage() {
  const { isAdmin } = useActivePlayer();
  const { user } = useAuth();
  const currentUid = user?.uid;
  // The legacy global player pool (super-admin tool). Per-tournament identity now
  // lives on roster slots (claimedByUid); this pool + binding stays for WTC 2026.
  const [players, setPlayers] = useState<Player[]>([]);
  useEffect(() => subscribeToPlayers(setPlayers), []);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [admins, setAdmins] = useState<Set<string>>(new Set());
  const [coaches, setCoaches] = useState<CoachMap>({});
  const [tournaments, setTournaments] = useState<TournamentMeta[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [newPlayer, setNewPlayer] = useState("");

  useEffect(() => subscribeToUsers(setUsers), []);
  useEffect(() => subscribeToAdmins(setAdmins), []);
  useEffect(() => subscribeToCoaches(setCoaches), []);
  useEffect(() => subscribeToRegistry(setTournaments), []);

  const playerByUid = useMemo(() => {
    const m = new Map<string, Player>();
    for (const p of players) if (p.authUid) m.set(p.authUid, p);
    return m;
  }, [players]);

  // Everyone worth showing: users who've signed in under the new code (in
  // _users) PLUS anyone already bound/coach/admin whose _users row doesn't exist
  // yet (they signed in before the registry existed). Keyed by uid.
  const rows = useMemo(() => {
    const byUid = new Map<string, AppUser>();
    for (const u of users) byUid.set(u.uid, u);
    for (const p of players) {
      if (p.authUid && !byUid.has(p.authUid)) byUid.set(p.authUid, { uid: p.authUid, displayName: p.name });
    }
    for (const uid of admins) if (!byUid.has(uid)) byUid.set(uid, { uid });
    for (const uid of Object.keys(coaches)) if (!byUid.has(uid)) byUid.set(uid, { uid });
    return [...byUid.values()].sort(
      (a, b) => (b.lastSeen || 0) - (a.lastSeen || 0) || (a.displayName || "").localeCompare(b.displayName || "", "da")
    );
  }, [users, players, admins, coaches]);

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-[#8888a0]">
        Ingen adgang. Kun holdadministratorer.
      </div>
    );
  }

  async function run(key: string, fn: () => Promise<void>, ok?: string) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg(ok);
    } catch {
      setMsg("Handlingen fejlede. Prøv igen.");
    }
    setBusy(null);
  }

  const nameFor = (u: AppUser) => u.displayName?.trim() || u.note?.trim() || "(uden navn)";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#e8e8f0]">Admin — adgang & roller</h1>
        <button
          onClick={() => run("recompute", recomputeMembership, "Medlemsindeks genberegnet.")}
          disabled={busy === "recompute"}
          className="text-[12px] px-3 py-1.5 rounded-md border border-white/[0.14] text-[#c8c8d8] hover:border-[#a855f7] transition-colors disabled:opacity-50"
        >
          {busy === "recompute" ? "..." : "Genberegn medlemskab"}
        </button>
      </div>

      {msg && <p className="text-[12px] text-[#4ade80]">{msg}</p>}

      {/* Registered users */}
      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-wider text-[#8888a0] font-semibold">
          Registrerede brugere ({rows.length})
        </h2>
        <p className="text-[11px] text-[#8888a0] leading-relaxed">
          Alle der har logget ind vises her. Giv hver person en eller flere roller — de er
          uafhængige og kan kombineres:
          <br />
          <span className="text-[#4ade80]">Spiller</span> = kobl til et navn i puljen (får adgang
          til de turneringer navnet står på roster i).{" "}
          <span className="text-[#60a5fa]">Coach</span> = sæt flueben ved de turneringer personen
          coacher (behøver ikke være spiller).{" "}
          <span className="text-[#f0b429]">Admin</span> = fuld kontrol.
          <br />
          En person kan fx være <span className="text-[#4ade80]">spiller</span> i WTC 2026 og{" "}
          <span className="text-[#60a5fa]">coach</span> i en anden turnering samtidig.
        </p>
        {rows.length === 0 && (
          <p className="text-[12px] text-[#8888a0]">Ingen har logget ind endnu.</p>
        )}
        {rows.map((u) => {
          const boundPlayer = playerByUid.get(u.uid);
          const isUserAdmin = admins.has(u.uid);
          const coachOf = Object.keys(coaches[u.uid] || {});
          const isMe = u.uid === currentUid;
          return (
            <div key={u.uid} className="rounded-lg border border-white/[0.08] bg-[#131318] p-3 space-y-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] text-[#e8e8f0] font-medium">{nameFor(u)}</span>
                {isMe && <span className="text-[10px] text-[#8888a0]">(dig)</span>}
                {isUserAdmin && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(240,180,41,0.15)] text-[#f0b429] font-semibold">Admin</span>
                )}
                {boundPlayer && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(34,197,94,0.14)] text-[#4ade80] font-semibold">Spiller: {boundPlayer.name}</span>
                )}
                {coachOf.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(96,165,250,0.16)] text-[#60a5fa] font-semibold">
                    Coach: {coachOf.map((id) => tournaments.find((t) => t.id === id)?.name || id).join(", ")}
                  </span>
                )}
                {!isUserAdmin && !boundPlayer && coachOf.length === 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#22222e] text-[#8888a0] font-semibold">Ingen rolle</span>
                )}
                {u.note && !boundPlayer && (
                  <span className="text-[10px] text-[#8888a0] italic">“{u.note}”</span>
                )}
              </div>

              <div className="flex items-start gap-x-5 gap-y-2 flex-wrap text-[11px]">
                {/* Player binding */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[#8888a0] uppercase tracking-wider text-[10px] font-semibold">Spiller</span>
                  {boundPlayer ? (
                    <span className="flex items-center gap-1.5">
                      <span className="text-[#4ade80]">{boundPlayer.name}</span>
                      <button
                        onClick={() => run(u.uid, () => unbindPlayer(boundPlayer.id))}
                        disabled={busy === u.uid}
                        className="text-[#8888a0] hover:text-[#f87171] transition-colors"
                      >
                        (fjern)
                      </button>
                    </span>
                  ) : (
                    <select
                      value=""
                      onChange={(e) => e.target.value && run(u.uid, () => bindPlayer(u.uid, e.target.value), "Koblet til spiller.")}
                      disabled={busy === u.uid}
                      className="px-2 py-1 rounded-md border border-white/[0.14] bg-[#1a1a22] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
                    >
                      <option value="">Kobl til navn…</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.authUid ? " (ombind)" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Coach assignments */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[#8888a0] uppercase tracking-wider text-[10px] font-semibold">Coach for</span>
                  {tournaments.length === 0 && <span className="text-[#8888a0]">ingen turneringer</span>}
                  {tournaments.map((t) => {
                    const on = !!coaches[u.uid]?.[t.id];
                    return (
                      <label key={t.id} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => run(u.uid, () => assignCoach(u.uid, t.id, e.target.checked))}
                          disabled={busy === u.uid}
                          className="accent-[#60a5fa]"
                        />
                        <span className="text-[#c8c8d8]">{t.name}</span>
                      </label>
                    );
                  })}
                </div>

                {/* Admin toggle */}
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isUserAdmin}
                    onChange={(e) => run(u.uid, () => setAdmin(u.uid, e.target.checked))}
                    disabled={busy === u.uid || isMe}
                    className="accent-[#f0b429]"
                  />
                  <span className="text-[#c8c8d8]">Admin</span>
                </label>

                {!isMe && (isUserAdmin || boundPlayer || coachOf.length > 0) && (
                  <button
                    onClick={() => {
                      if (confirm(`Fjern al adgang for ${nameFor(u)}?`)) run(u.uid, () => revokeAccess(u.uid), "Adgang fjernet.");
                    }}
                    disabled={busy === u.uid}
                    className="ml-auto text-[#8888a0] hover:text-[#f87171] transition-colors"
                  >
                    Fjern al adgang
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Player pool */}
      <section className="space-y-2">
        <h2 className="text-[11px] uppercase tracking-wider text-[#8888a0] font-semibold">
          Spiller-pulje ({players.length})
        </h2>
        <p className="text-[11px] text-[#8888a0]">
          Personer, som kan sættes på et roster. Opret nye her; gamle bliver stående på tværs af år.
        </p>
        <div className="flex items-center gap-2">
          <input
            value={newPlayer}
            onChange={(e) => setNewPlayer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newPlayer.trim()) {
                run("newplayer", async () => { await addPlayer(newPlayer.trim()); setNewPlayer(""); }, "Spiller oprettet.");
              }
            }}
            placeholder="Ny spiller (navn)"
            className="flex-1 max-w-xs text-[12px] px-3 py-1.5 rounded-md border border-white/[0.14] bg-[#1a1a22] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
          />
          <button
            onClick={() => newPlayer.trim() && run("newplayer", async () => { await addPlayer(newPlayer.trim()); setNewPlayer(""); }, "Spiller oprettet.")}
            disabled={busy === "newplayer" || !newPlayer.trim()}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-md bg-[#a855f7] hover:bg-[#9333ea] text-white transition-colors disabled:opacity-40"
          >
            Opret
          </button>
        </div>
        {players.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-[#131318] px-3 py-2">
            <span className="text-[13px] text-[#e8e8f0] flex-1">{p.name}</span>
            <span className={`text-[10px] ${p.authUid ? "text-[#4ade80]" : "text-[#8888a0]"}`}>
              {p.authUid ? "koblet" : "ikke koblet"}
            </span>
            {p.authUid && (
              <button
                onClick={() => run(p.id, () => unbindPlayer(p.id))}
                disabled={busy === p.id}
                className="text-[11px] text-[#8888a0] hover:text-[#f87171] transition-colors"
              >
                Fjern kobling
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
