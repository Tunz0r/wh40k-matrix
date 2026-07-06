"use client";

import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError(true);
        setBusy(false);
        return;
      }
      const from = new URLSearchParams(window.location.search).get("from");
      // Full navigation so the proxy sees the fresh cookie
      window.location.href = from && from.startsWith("/") ? from : "/tournament";
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-xs rounded-xl border border-white/[0.08] bg-[#131318] p-6 space-y-4"
      >
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-md bg-gradient-to-br from-[#a855f7] to-[#6d28d9] flex items-center justify-center text-[13px] font-black text-white">
            W
          </span>
          <div>
            <div className="text-[14px] font-semibold text-[#e8e8f0]">WTC — Team Denmark</div>
            <div className="text-[10px] text-[#8888a0]">Log ind for at fortsætte</div>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold block mb-1">
            Brugernavn
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            className="w-full bg-[#1a1a22] border border-white/[0.14] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] outline-none focus:border-[#a855f7]"
          />
        </div>

        <div>
          <label className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold block mb-1">
            Kodeord
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full bg-[#1a1a22] border border-white/[0.14] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] outline-none focus:border-[#a855f7]"
          />
        </div>

        {error && (
          <p className="text-[11px] text-[#f87171]">Forkert brugernavn eller kodeord.</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full text-sm font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {busy ? "Logger ind..." : "Log ind"}
        </button>
      </form>
    </div>
  );
}
