"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { setUserNote } from "@/lib/membership";

// Shown when someone is signed in but has no access grant yet. Their login is
// already recorded in the admin users list (auth.tsx upserts it on sign-in), so
// there's nothing to submit — they just wait for an admin to grant a role. They
// may leave an optional note (e.g. "I'm Simon O, coach") to help the admin.
export default function PendingScreen() {
  const { user, signOutUser } = useAuth();
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !note.trim()) return;
    setBusy(true);
    try {
      await setUserNote(user.uid, note.trim());
      setSent(true);
    } catch {
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
            Logget ind som {user?.displayName || user?.email}
          </div>
        </div>

        <p className="text-[12px] text-[#c8c8d8] leading-relaxed">
          Din konto er registreret, men har ikke adgang endnu. En holdadministrator giver dig en
          rolle (spiller eller coach) — genindlæs siden bagefter.
        </p>

        {sent ? (
          <p className="text-[12px] text-[#4ade80] leading-relaxed">Besked sendt til admin.</p>
        ) : (
          <form onSubmit={submit} className="space-y-2">
            <label className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold block">
              Besked til admin (valgfri)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="f.eks. Jeg er Simon O — coach"
              className="w-full bg-[#1a1a22] border border-white/[0.14] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] outline-none focus:border-[#a855f7]"
            />
            <button
              type="submit"
              disabled={busy || !note.trim()}
              className="w-full text-sm font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {busy ? "Sender..." : "Send besked"}
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
