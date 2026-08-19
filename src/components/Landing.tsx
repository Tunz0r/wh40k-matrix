"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { addTournament } from "@/lib/tournaments-registry";
import { useActiveTournament } from "@/lib/active-tournament";

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Shown to a signed-in user who isn't a member of any tournament yet. In the
// multi-tenant model anyone can spin up their own tournament and becomes its
// owner (captain). Joining someone else's team via invite comes in Phase 2.
export default function Landing() {
  const { user, signOutUser } = useAuth();
  const { setActive } = useActiveTournament();
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamSize, setTeamSize] = useState(8);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const id = useMemo(() => slugify(name.trim()), [name]);

  async function create() {
    if (!name.trim() || !id || !teamName.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await addTournament({
        id,
        name: name.trim(),
        dataSlug: id,
        teamName: teamName.trim(),
        teamSize,
        status: "upcoming",
      });
      setActive(id);
      // Full navigation into the new tournament's dashboard.
      window.location.href = `/tournament/${id}`;
    } catch {
      setErr("Kunne ikke oprette turneringen. Er navnet allerede brugt?");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-white/[0.08] bg-[#131318] p-6 space-y-5">
        <div>
          <div className="text-[15px] font-semibold text-[#e8e8f0]">Velkommen{user?.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}</div>
          <div className="text-[12px] text-[#8888a0] mt-1 leading-relaxed">
            Du er ikke med på et hold endnu. Opret din egen turnering — så bliver du kaptajn og kan
            bygge roster og invitere holdet. (Er du inviteret til et hold, kommer den mulighed snart.)
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold block mb-1">Turneringens navn</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="f.eks. WTC 2027"
              className="w-full bg-[#1a1a22] border border-white/[0.14] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] outline-none focus:border-[#a855f7]"
            />
          </div>
          <div>
            <label className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold block mb-1">Dit holds navn</label>
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="f.eks. Team Danmark"
              className="w-full bg-[#1a1a22] border border-white/[0.14] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] outline-none focus:border-[#a855f7]"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-[#8888a0]">Holdstørrelse</label>
            <select
              value={teamSize}
              onChange={(e) => setTeamSize(Number(e.target.value))}
              className="text-[12px] px-2 py-1 rounded-md bg-[#1a1a22] border border-white/[0.14] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
            >
              <option value={8}>8 spillere (WTC)</option>
              <option value={5}>5 spillere</option>
            </select>
          </div>
          {id && <p className="text-[10px] text-[#8888a0]">URL: <code className="text-[#c8c8d4]">/tournament/{id}</code></p>}
        </div>

        {err && <p className="text-[11px] text-[#f87171]">{err}</p>}

        <button
          onClick={create}
          disabled={busy || !name.trim() || !teamName.trim()}
          className="w-full text-sm font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-4 py-2.5 rounded-lg transition-colors disabled:opacity-40"
        >
          {busy ? "Opretter..." : "Opret turnering"}
        </button>

        <button onClick={() => signOutUser()} className="text-[11px] text-[#8888a0] hover:text-[#e8e8f0] transition-colors">
          Log ud
        </button>
      </div>
    </div>
  );
}
