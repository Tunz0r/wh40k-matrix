"use client";

import { useEffect, useState } from "react";
import { useActivePlayer } from "@/lib/active-player";
import {
  subscribeToClaims,
  bindPlayer,
  unbindPlayer,
  recomputeMembership,
  deleteClaim,
  type Claim,
} from "@/lib/membership";

// Admin-only: approve access requests by binding a sign-in (uid) to a player,
// and manage existing bindings. Membership recomputes automatically on bind.
export default function AdminPage() {
  const { players, isAdmin } = useActivePlayer();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({}); // uid -> playerId
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => subscribeToClaims(setClaims), []);

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-[#8888a0]">
        Ingen adgang. Kun holdadministratorer.
      </div>
    );
  }

  async function approve(claim: Claim) {
    const playerId = pick[claim.uid];
    if (!playerId) return;
    setBusy(claim.uid);
    setMsg(null);
    try {
      await bindPlayer(claim.uid, playerId);
      setMsg(`Koblet ${claim.displayName} → ${players.find((p) => p.id === playerId)?.name}`);
    } catch {
      setMsg("Kunne ikke koble. Prøv igen.");
    }
    setBusy(null);
  }

  const boundUidByPlayer = new Map(players.filter((p) => p.authUid).map((p) => [p.id, p.authUid!]));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#e8e8f0]">Admin — adgang</h1>
        <button
          onClick={async () => {
            setBusy("recompute");
            await recomputeMembership();
            setMsg("Medlemsindeks genberegnet.");
            setBusy(null);
          }}
          disabled={busy === "recompute"}
          className="text-[12px] px-3 py-1.5 rounded-md border border-white/[0.14] text-[#c8c8d8] hover:border-[#a855f7] transition-colors disabled:opacity-50"
        >
          {busy === "recompute" ? "..." : "Genberegn medlemskab"}
        </button>
      </div>

      {msg && <p className="text-[12px] text-[#4ade80]">{msg}</p>}

      {/* Pending claims */}
      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-wider text-[#8888a0] font-semibold">
          Afventende anmodninger ({claims.length})
        </h2>
        {claims.length === 0 && <p className="text-[12px] text-[#8888a0]">Ingen anmodninger.</p>}
        {claims.map((c) => (
          <div
            key={c.uid}
            className="rounded-lg border border-white/[0.08] bg-[#131318] p-3 flex flex-wrap items-center gap-3"
          >
            <div className="flex-1 min-w-[160px]">
              <div className="text-[13px] text-[#e8e8f0] font-medium">
                {c.requestedPlayerName || c.displayName}
              </div>
              <div className="text-[10px] text-[#8888a0]">{c.email}</div>
            </div>
            <select
              value={pick[c.uid] ?? ""}
              onChange={(e) => setPick((p) => ({ ...p, [c.uid]: e.target.value }))}
              className="text-[12px] px-2 py-1.5 rounded-md border border-white/[0.14] bg-[#1a1a22] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
            >
              <option value="">Vælg spiller…</option>
              {players.map((p) => (
                <option key={p.id} value={p.id} disabled={!!p.authUid}>
                  {p.name}
                  {p.authUid ? " (koblet)" : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => approve(c)}
              disabled={!pick[c.uid] || busy === c.uid}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-md bg-[#a855f7] hover:bg-[#9333ea] text-white transition-colors disabled:opacity-40"
            >
              {busy === c.uid ? "..." : "Godkend"}
            </button>
            <button
              onClick={() => deleteClaim(c.uid)}
              title="Afvis"
              className="text-[12px] text-[#8888a0] hover:text-[#f87171] transition-colors"
            >
              ✕
            </button>
          </div>
        ))}
      </section>

      {/* Existing bindings */}
      <section className="space-y-2">
        <h2 className="text-[11px] uppercase tracking-wider text-[#8888a0] font-semibold">
          Spillere ({players.length})
        </h2>
        {players.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-[#131318] px-3 py-2"
          >
            <span className="text-[13px] text-[#e8e8f0] flex-1">{p.name}</span>
            {boundUidByPlayer.has(p.id) ? (
              <>
                <span className="text-[10px] text-[#4ade80]">koblet</span>
                <button
                  onClick={() => unbindPlayer(p.id)}
                  className="text-[11px] text-[#8888a0] hover:text-[#f87171] transition-colors"
                >
                  Fjern
                </button>
              </>
            ) : (
              <span className="text-[10px] text-[#8888a0]">ikke koblet</span>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
