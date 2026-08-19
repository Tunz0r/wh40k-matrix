"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ensureRegistry,
  subscribeToRegistry,
  addTournament,
  type TournamentMeta,
  type TournamentStatus,
} from "@/lib/tournaments-registry";
import { subscribeToTournament, type TournamentDoc } from "@/lib/tournament-db";
import { computeStandings } from "@/lib/standings";
import { useActiveTournament } from "@/lib/active-tournament";
import { useActivePlayer } from "@/lib/active-player";
import { useAuth } from "@/lib/auth";
import { subscribeToMyTournaments } from "@/lib/membership";

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const STATUS: Record<TournamentStatus, { label: string; cls: string }> = {
  upcoming: { label: "Kommende", cls: "bg-[#22222e] text-[#8888a0]" },
  active: { label: "I gang", cls: "bg-[rgba(34,197,94,0.12)] text-[#4ade80]" },
  completed: { label: "Afsluttet", cls: "bg-[rgba(168,85,247,0.14)] text-[#c084fc]" },
};

export default function TournamentIndexPage() {
  const [list, setList] = useState<TournamentMeta[]>([]);
  const [docs, setDocs] = useState<Record<string, TournamentDoc | null>>({});
  const { setActive } = useActiveTournament();
  const { isAdmin } = useActivePlayer();
  const { user } = useAuth();

  // Admins can read the whole registry; a normal member sees only the
  // tournaments they were rostered in (hard isolation — see membership.ts).
  useEffect(() => {
    if (isAdmin) {
      ensureRegistry().catch(() => {});
      return subscribeToRegistry(setList);
    }
    if (user) return subscribeToMyTournaments(user.uid, setList);
    setList([]);
  }, [isAdmin, user]);

  // Subscribe to each tournament's data doc so we can show its record.
  useEffect(() => {
    const unsubs = list.map((t) =>
      subscribeToTournament(t.dataSlug, (d) =>
        setDocs((prev) => ({ ...prev, [t.id]: d }))
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [list]);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamSize, setTeamSize] = useState(8);
  const [busy, setBusy] = useState(false);
  const proposedId = useMemo(() => slugify(name.trim()), [name]);
  const idTaken = list.some((t) => t.id === proposedId);

  async function create() {
    const nm = name.trim();
    if (!nm || !proposedId || idTaken || !teamName.trim() || busy) return;
    setBusy(true);
    try {
      await addTournament({
        id: proposedId,
        name: nm,
        dataSlug: proposedId,
        teamName: teamName.trim(),
        teamSize,
        status: "upcoming",
      });
      setActive(proposedId);
      setName("");
      setTeamName("");
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="px-4 sm:px-6 py-4 border-b border-white/[0.08] sticky top-12 bg-[#0f0f13] z-20">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-[#e8e8f0] tracking-tight">Turneringer</h1>
          <span className="text-[11px] text-[#8888a0]">{list.length} i alt</span>
          <button
            onClick={() => setAdding((v) => !v)}
            className="ml-auto text-[12px] font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-3 py-1.5 rounded-lg transition-colors"
          >
            {adding ? "Annullér" : "+ Ny turnering"}
          </button>
        </div>
      </header>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-3">
        {adding && (
          <div className="rounded-xl border border-[rgba(168,85,247,0.25)] bg-[rgba(168,85,247,0.04)] p-4">
            <label className="text-[11px] text-[#8888a0] font-semibold">Navn</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") create(); }}
                placeholder="f.eks. WTC 2027"
                className="flex-1 h-9 px-3 text-[13px] rounded-lg bg-[#1a1a22] border border-white/[0.12] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
              />
              <button
                onClick={create}
                disabled={!proposedId || idTaken || !teamName.trim() || busy}
                className="text-[12px] font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
              >
                Opret
              </button>
            </div>
            <div className="mt-2">
              <label className="text-[11px] text-[#8888a0] font-semibold">Holdnavn</label>
              <input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") create(); }}
                placeholder="f.eks. Team Danmark"
                className="w-full h-9 mt-1 px-3 text-[13px] rounded-lg bg-[#1a1a22] border border-white/[0.12] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
              />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <label className="text-[11px] text-[#8888a0]">Holdstørrelse</label>
              <select
                value={teamSize}
                onChange={(e) => setTeamSize(Number(e.target.value))}
                className="text-[12px] px-2 py-1 rounded-md bg-[#1a1a22] border border-white/[0.12] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
              >
                <option value={8}>8 spillere · WTC (skirmish ×2 + main + champion, +12 BP)</option>
                <option value={5}>5 spillere (initial skirmish + main, +6 BP)</option>
              </select>
            </div>
            {proposedId && (
              <p className={`text-[10px] mt-1.5 ${idTaken ? "text-[#f87171]" : "text-[#8888a0]"}`}>
                {idTaken ? `"${proposedId}" findes allerede` : <>URL: <code className="text-[#c8c8d4]">/tournament/{proposedId}</code></>}
              </p>
            )}
            <p className="text-[10px] text-[#8888a0] mt-2 pt-2 border-t border-white/[0.06]">
              Arketype-biblioteket (og dine estimater mod arketyper) deles automatisk med den nye turnering — kun modstander-landene er turnerings-specifikke.
            </p>
          </div>
        )}

        {list.length === 0 ? (
          <p className="text-[12px] text-[#8888a0]">Ingen turneringer endnu.</p>
        ) : (
          list.map((t) => {
            const doc = docs[t.id];
            const st = doc?.rounds?.length
              ? computeStandings(doc.rounds, { teamSize: t.teamSize, totalRounds: t.rounds })
              : null;
            const played = st?.played ?? 0;
            return (
              <Link
                key={t.id}
                href={`/tournament/${t.id}`}
                onClick={() => setActive(t.id)}
                className="block rounded-xl border border-white/[0.08] p-4 hover:border-white/[0.2] hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-semibold text-[#e8e8f0]">{t.name}</h2>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${STATUS[t.status].cls}`}>
                    {STATUS[t.status].label}
                  </span>
                  <span className="text-[10px] text-[#8888a0]">{t.teamSize ?? 8}v{t.teamSize ?? 8}</span>
                  {t.format && <span className="text-[10px] text-[#8888a0]">{t.format}</span>}
                  <span className="ml-auto text-[#8888a0]">→</span>
                </div>
                {st && played > 0 ? (
                  <div className="mt-2 flex items-center gap-3 text-[12px]">
                    <span className="font-bold">
                      <span className="text-[#4ade80]">{st.wins}</span>
                      <span className="text-[#8888a0]">-</span>
                      <span className="text-[#facc15]">{st.draws}</span>
                      <span className="text-[#8888a0]">-</span>
                      <span className="text-[#f87171]">{st.losses}</span>
                    </span>
                    <span className="text-[#8888a0]">{st.teamPoints} TP</span>
                    <span className="text-[#8888a0]">{st.bpFor}-{st.bpAgainst} BP</span>
                    <span className="text-[#8888a0]">{played} {played === 1 ? "runde" : "runder"}</span>
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-[#8888a0]">Ingen spillede runder endnu</p>
                )}
              </Link>
            );
          })
        )}
      </div>
    </>
  );
}
