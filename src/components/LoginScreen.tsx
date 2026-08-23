"use client";

import { useState } from "react";
import { useAuth, TEST_LOGIN_ENABLED } from "@/lib/auth";

// The sign-in screen: Google (primary) + passwordless email link (fallback).
// No passwords. Rendered by AuthGate whenever no user is signed in.
export default function LoginScreen() {
  const { signInWithGoogle, sendEmailLink, signInAsTestUser } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function google() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch {
      setError("Google-login mislykkedes. Prøv igen.");
      setBusy(false);
    }
  }

  async function emailLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sendEmailLink(email.trim());
      setSent(true);
    } catch {
      setError("Kunne ikke sende link. Tjek e-mailen og prøv igen.");
    }
    setBusy(false);
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-xs rounded-xl border border-white/[0.08] bg-[#131318] p-6 space-y-5">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-md bg-gradient-to-br from-[#a855f7] to-[#6d28d9] flex items-center justify-center text-[13px] font-black text-white">
            W
          </span>
          <div>
            <div className="text-[14px] font-semibold text-[#e8e8f0]">WTC — Team Room</div>
            <div className="text-[10px] text-[#8888a0]">Log ind for at fortsætte</div>
          </div>
        </div>

        <button
          onClick={google}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-[#e8e8f0] bg-[#1a1a22] border border-white/[0.14] hover:border-[#a855f7] px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
        >
          <span className="w-4 h-4 rounded-sm bg-white text-[#4285F4] flex items-center justify-center text-[11px] font-black">
            G
          </span>
          Fortsæt med Google
        </button>

        <div className="flex items-center gap-2 text-[10px] text-[#8888a0] uppercase tracking-wider">
          <span className="flex-1 h-px bg-white/[0.08]" />
          eller
          <span className="flex-1 h-px bg-white/[0.08]" />
        </div>

        {sent ? (
          <p className="text-[12px] text-[#4ade80] leading-relaxed">
            Vi har sendt et login-link til <span className="font-semibold">{email}</span>. Åbn
            linket på denne enhed for at logge ind.
          </p>
        ) : (
          <form onSubmit={emailLink} className="space-y-2">
            <label className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold block">
              Login-link på e-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="dig@eksempel.dk"
              className="w-full bg-[#1a1a22] border border-white/[0.14] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] outline-none focus:border-[#a855f7]"
            />
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="w-full text-sm font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {busy ? "Sender..." : "Send login-link"}
            </button>
          </form>
        )}

        {error && <p className="text-[11px] text-[#f87171]">{error}</p>}

        {TEST_LOGIN_ENABLED && (
          <div className="pt-3 border-t border-dashed border-[rgba(240,180,41,0.3)]">
            <button
              onClick={async () => { setBusy(true); setError(null); try { await signInAsTestUser(); } catch { setError("Test-login fejlede — er Anonymous-provideren slået til i Firebase?"); setBusy(false); } }}
              disabled={busy}
              className="w-full text-[12px] font-semibold text-[#f0b429] border border-[rgba(240,180,41,0.4)] hover:bg-[rgba(240,180,41,0.08)] px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              🧪 Test-bruger (kun til test)
            </button>
            <p className="text-[10px] text-[#8888a0] mt-1 text-center">Anonym engangs-bruger til at teste flows.</p>
          </div>
        )}
      </div>
    </div>
  );
}
