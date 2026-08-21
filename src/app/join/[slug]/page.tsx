"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { subscribeToRoster, claimSlot, setSlotName } from "@/lib/tournament-db";
import { upsertSelfUser } from "@/lib/membership";
import type { RosterExport } from "@/lib/roster";

// Invite landing: a signed-in user opens /join/{dataSlug} (shared by the owner
// while the join window is open) and claims an unclaimed roster slot. The roster
// is readable here only while the window is open (rules); everything else stays
// walled. After claiming, they wait for the captain to finalize (recompute).
export default function JoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { user, signOutUser } = useAuth();
  const [roster, setRoster] = useState<RosterExport | null | undefined>(undefined);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Google logins carry a display name; email-link logins don't — so we ask.
  // The email is NEVER used as a fallback (it must stay out of the RTDB).
  // Prefill from the Google name; once the user types, their edit wins.
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const name = nameEdit ?? user?.displayName ?? "";

  useEffect(() => subscribeToRoster(slug, (r) => setRoster(r)), [slug]);

  const myIdx = roster?.armies.findIndex((a) => a.claimedByUid === user?.uid) ?? -1;
  const claimedMine = myIdx >= 0;

  async function claim(idx: number) {
    if (!user) return;
    const chosen = name.trim();
    if (!chosen) {
      setErr("Skriv dit navn, før du vælger en plads.");
      return;
    }
    setBusy(idx);
    setErr(null);
    try {
      await claimSlot(slug, idx, user.uid);
      // Label the seat with the chosen name and persist it as this login's
      // display name so it shows up everywhere (never the email).
      await setSlotName(slug, idx, chosen).catch(() => {});
      await upsertSelfUser(user.uid, chosen).catch(() => {});
      // Straight into the team — no extra "gå ind" click needed.
      window.location.assign("/");
    } catch {
      setErr("Kunne ikke vælge pladsen. Måske er den lige blevet taget, eller holdet er lukket.");
      setBusy(null);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-xl border border-white/[0.08] bg-[#131318] p-6 space-y-4">
        <div>
          <div className="text-[15px] font-semibold text-[#e8e8f0]">{roster?.name || "Tilmeld hold"}</div>
          <div className="text-[11px] text-[#8888a0] mt-0.5">Logget ind som {user?.displayName || user?.email}</div>
        </div>

        {roster === undefined ? (
          <p className="text-[12px] text-[#8888a0]">Indlæser…</p>
        ) : roster === null ? (
          <p className="text-[12px] text-[#8888a0] leading-relaxed">
            Holdet er ikke klar til tilmelding endnu. Kaptajnen skal både <b>åbne tilmelding</b> og
            <b> bygge rosteret</b> (så der er pladser at vælge). Bed kaptajnen gøre det og prøv linket
            igen.
          </p>
        ) : roster.armies.length === 0 ? (
          <p className="text-[12px] text-[#8888a0] leading-relaxed">
            Kaptajnen har åbnet tilmelding, men der er ingen pladser på rosteret endnu.
          </p>
        ) : claimedMine ? (
          <div className="space-y-3">
            <p className="text-[12px] text-[#4ade80] leading-relaxed">
              Du er med på holdet — plads{" "}
              <span className="font-semibold">{roster.armies[myIdx].player?.trim() || `${myIdx + 1}`}</span>. Du
              har adgang med det samme; din hær vælger du senere.
            </p>
            <button
              onClick={() => (window.location.href = "/")}
              className="text-[12px] font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-4 py-2 rounded-lg transition-colors"
            >
              Gå ind på holdet
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold block">Dit navn</label>
              <input
                value={name}
                onChange={(e) => setNameEdit(e.target.value)}
                placeholder="f.eks. Michael Bræmer"
                className="w-full bg-[#1a1a22] border border-white/[0.14] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] outline-none focus:border-[#a855f7]"
              />
            </div>
            <p className="text-[12px] text-[#c8c8d8]">Vælg din plads på holdet:</p>
            <div className="space-y-1.5">
              {roster.armies.map((a, idx) => {
                const taken = !!a.claimedByUid;
                return (
                  <button
                    key={idx}
                    onClick={() => !taken && claim(idx)}
                    disabled={taken || busy !== null || !name.trim()}
                    className={`w-full flex items-center gap-2 text-left rounded-lg border px-3 py-2 transition-colors ${
                      taken
                        ? "border-white/[0.06] opacity-50 cursor-not-allowed"
                        : !name.trim()
                        ? "border-white/[0.08] opacity-50 cursor-not-allowed"
                        : "border-white/[0.12] hover:border-[#a855f7]"
                    }`}
                  >
                    <span className="text-[12px] text-[#e8e8f0] flex-1">
                      {a.player?.trim() || `Plads ${idx + 1}`}
                      {a.faction && <span className="text-[#8888a0]"> · {a.faction}</span>}
                    </span>
                    <span className="text-[10px] text-[#8888a0]">{taken ? "optaget" : busy === idx ? "…" : "vælg"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {err && <p className="text-[11px] text-[#f87171]">{err}</p>}

        <button onClick={() => signOutUser()} className="text-[11px] text-[#8888a0] hover:text-[#e8e8f0] transition-colors">
          Log ud
        </button>
      </div>
    </div>
  );
}
