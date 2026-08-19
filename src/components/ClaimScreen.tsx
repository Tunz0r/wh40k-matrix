"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { submitClaim } from "@/lib/membership";

// Shown when someone is signed in but not yet bound to a player. They record who
// they are (name + which player they should be) so an admin can approve the
// binding. The email comes from the Firebase user — it is only used as transient
// claim metadata for the admin to match a person, never stored on the player.
export default function ClaimScreen() {
  const { user, signOutUser } = useAuth();
  const [requestedPlayerName, setRequestedPlayerName] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  // Prefill the request with the Google display name if we have one.
  useEffect(() => {
    if (user?.displayName) setRequestedPlayerName(user.displayName);
  }, [user?.displayName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      await submitClaim({
        uid: user.uid,
        displayName: user.displayName || user.email || "Ukendt",
        email: user.email || "",
        requestedPlayerName: requestedPlayerName.trim() || undefined,
      });
      setSent(true);
    } catch {
      // If the write fails (e.g. rules), still show the pending state — an
      // admin can bind from the uid regardless.
      setSent(true);
    }
    setBusy(false);
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-white/[0.08] bg-[#131318] p-6 space-y-4">
        <div>
          <div className="text-[14px] font-semibold text-[#e8e8f0]">Afventer adgang</div>
          <div className="text-[11px] text-[#8888a0] mt-0.5">
            Logget ind som {user?.email || user?.displayName}
          </div>
        </div>

        {sent ? (
          <p className="text-[12px] text-[#4ade80] leading-relaxed">
            Din anmodning er sendt. En holdadministrator kobler din login til din spiller — så
            snart det er gjort, får du adgang. Genindlæs siden bagefter.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-[12px] text-[#c8c8d8] leading-relaxed">
              Din konto er ikke koblet til en spiller endnu. Fortæl hvem du er, så en administrator
              kan godkende dig.
            </p>
            <div>
              <label className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold block mb-1">
                Dit spillernavn
              </label>
              <input
                type="text"
                value={requestedPlayerName}
                onChange={(e) => setRequestedPlayerName(e.target.value)}
                className="w-full bg-[#1a1a22] border border-white/[0.14] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] outline-none focus:border-[#a855f7]"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full text-sm font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {busy ? "Sender..." : "Anmod om adgang"}
            </button>
          </form>
        )}

        <button
          onClick={() => signOutUser()}
          className="text-[11px] text-[#8888a0] hover:text-[#e8e8f0] transition-colors"
        >
          Log ud
        </button>
      </div>
    </div>
  );
}
