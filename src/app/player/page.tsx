"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { TEAM_SLUG, TEAM_NAME } from "@/lib/team";
import { DISP_STYLES } from "@/lib/data";
import {
  subscribeToTournament,
  type TournamentDoc,
  type TournamentRound,
} from "@/lib/tournament-db";
import {
  subscribeToOpponents,
  estimateStyle,
  type OpponentMap,
} from "@/lib/estimates-db";
import {
  fetchSession,
  subscribeToSession,
  type SessionData,
  type MatchupData,
} from "@/lib/session";
import { vpToBP } from "@/lib/scoring";
import { getLayoutImage } from "@/lib/layouts";

const MY_ARMY_KEY = "wtc-my-army";

function BPChip({ v, big }: { v: number; big?: boolean }) {
  const s = estimateStyle(v);
  return (
    <span
      className={`inline-flex items-center justify-center rounded border font-bold ${big ? "w-11 h-9 text-[15px]" : "w-8 h-6 text-[11px]"}`}
      style={{ background: s.bg, color: s.fg, borderColor: s.border }}
    >
      {v}
    </span>
  );
}

// Find the matchup in a session that belongs to our army (matched by faction).
function myMatchup(session: SessionData | null, faction: string): MatchupData | null {
  if (!session) return null;
  return (session.matchups || []).find((m) => m.aFaction === faction) || null;
}

export default function PlayerPage() {
  const [doc, setDoc] = useState<TournamentDoc | null>(null);
  const [opponents, setOpponents] = useState<OpponentMap>({});
  const [myIdx, setMyIdx] = useState<number | null>(null);
  const [activeSession, setActiveSession] = useState<SessionData | null>(null);
  const [pastSessions, setPastSessions] = useState<Record<string, SessionData>>({});

  useEffect(() => {
    try {
      const u1 = subscribeToTournament(TEAM_SLUG, setDoc);
      const u2 = subscribeToOpponents(setOpponents);
      return () => { u1(); u2(); };
    } catch {}
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(MY_ARMY_KEY);
    if (saved !== null) setMyIdx(Number(saved));
  }, []);

  function pickArmy(i: number) {
    setMyIdx(i);
    localStorage.setItem(MY_ARMY_KEY, String(i));
  }

  const armies = useMemo(() => doc?.roster?.armies || [], [doc]);
  const myArmy = myIdx !== null ? armies[myIdx] : null;
  const myFaction = myArmy?.faction || "";

  // Live subscription to the active coaching session
  useEffect(() => {
    if (!doc?.activeSessionId) { setActiveSession(null); return; }
    try {
      return subscribeToSession(doc.activeSessionId, setActiveSession);
    } catch {}
  }, [doc?.activeSessionId]);

  // Fetch completed rounds' sessions for the results history
  const completedRounds = useMemo(
    () => (doc?.rounds || []).filter(
      (r): r is TournamentRound & { sessionId: string } =>
        !!r.sessionId && r.status === "completed"
    ),
    [doc]
  );
  const loadPast = useCallback(async () => {
    const entries = await Promise.all(
      completedRounds.map(async (r) => [r.sessionId, await fetchSession(r.sessionId)] as const)
    );
    const map: Record<string, SessionData> = {};
    for (const [id, s] of entries) if (s) map[id] = s;
    setPastSessions(map);
  }, [completedRounds]);
  useEffect(() => { loadPast(); }, [loadPast]);

  // My results across completed rounds
  const myResults = useMemo(() => {
    const rows: { round: number; opponent: string; theirFaction: string; estimate: number | null; actual: number; delta: number | null }[] = [];
    for (const r of completedRounds) {
      const m = myMatchup(pastSessions[r.sessionId], myFaction);
      if (!m || !m.final) continue;
      const diff = (m.aVP ?? 0) - (m.bVP ?? 0);
      const bp = vpToBP(diff);
      const actual = diff >= 0 ? bp.winner : bp.loser;
      const estimate = m.estimate && m.estimate > 0 ? m.estimate : null;
      rows.push({
        round: r.number,
        opponent: r.opponentName,
        theirFaction: m.bFaction,
        estimate,
        actual,
        delta: estimate !== null ? actual - estimate : null,
      });
    }
    return rows;
  }, [completedRounds, pastSessions, myFaction]);

  const calibration = useMemo(() => {
    const deltas = myResults.map((r) => r.delta).filter((d): d is number => d !== null);
    if (!deltas.length) return null;
    return {
      n: deltas.length,
      avg: deltas.reduce((a, b) => a + b, 0) / deltas.length,
      abs: deltas.reduce((a, b) => a + Math.abs(b), 0) / deltas.length,
    };
  }, [myResults]);

  // My estimate progress for my army
  const myProgress = useMemo(() => {
    if (myIdx === null) return { filled: 0, total: 0 };
    let filled = 0, total = 0;
    for (const team of Object.values(opponents)) {
      (team.armies || []).forEach((_, j) => {
        total++;
        if (team.estimates?.[`${myIdx}_${j}`]) filled++;
      });
    }
    return { filled, total };
  }, [opponents, myIdx]);

  const liveMatchup = myMatchup(activeSession, myFaction);
  const currentRound = (doc?.rounds || []).find((r) => r.status === "live" || r.status === "pairing");

  return (
    <>
      <header className="px-4 sm:px-6 py-4 border-b border-white/[0.08] sticky top-12 bg-[#0f0f13] z-20">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-[#e8e8f0] tracking-tight">
            Min side
            <span className="text-[#4ade80] ml-2 text-sm font-normal">— {TEAM_NAME}</span>
          </h1>
          {myArmy && (
            <span className="text-[12px] text-[#8888a0]">
              {myArmy.player ? `${myArmy.player} · ` : ""}{myFaction}
            </span>
          )}
        </div>
      </header>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
        {/* Army picker */}
        <div className="rounded-xl border border-white/[0.08] p-4">
          <h2 className="text-xs font-semibold text-[#8888a0] uppercase tracking-wider mb-2">Vælg din hær</h2>
          {armies.length === 0 ? (
            <p className="text-[11px] text-[#8888a0]">Intet roster endnu — bed kaptajnen opsætte holdet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {armies.map((a, i) => (
                <button
                  key={i}
                  onClick={() => pickArmy(i)}
                  className={`text-left rounded-lg border p-2 transition-colors ${myIdx === i ? "border-[#a855f7]/60 bg-[#a855f7]/10" : "border-white/[0.08] hover:border-white/[0.18]"}`}
                >
                  <div className="text-[11px] text-[#e8e8f0] font-medium truncate">{a.faction}</div>
                  <div className="text-[9px] text-[#8888a0] truncate">{a.player || "—"}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {myIdx !== null && myArmy && (
          <>
            {/* Live game */}
            <div className="rounded-xl border border-[rgba(34,197,94,0.25)] bg-[rgba(34,197,94,0.03)] p-4">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-[#e8e8f0]">Din kamp nu</h2>
                {doc?.activeSessionId && (
                  <span className="text-[9px] text-[#4ade80] bg-[rgba(34,197,94,0.12)] px-2 py-0.5 rounded-full animate-pulse">LIVE</span>
                )}
              </div>
              {liveMatchup ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: liveMatchup.aDisposition ? DISP_STYLES[liveMatchup.aDisposition].color : "#8888a0" }} />
                      <span className="text-[13px] font-semibold text-[#4ade80]">{liveMatchup.aFaction}</span>
                    </div>
                    <span className="text-[11px] text-[#8888a0]">vs</span>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: liveMatchup.bDisposition ? DISP_STYLES[liveMatchup.bDisposition].color : "#8888a0" }} />
                      <span className="text-[13px] font-semibold text-[#e8e8f0]">{liveMatchup.bFaction}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-[#8888a0] flex-wrap">
                    <span className="bg-[#22222e] px-1.5 py-0.5 rounded">{liveMatchup.module}</span>
                    {liveMatchup.aDetachments?.length ? <span>{liveMatchup.aDetachments.join(", ")}</span> : null}
                    {liveMatchup.estimate > 0 && (
                      <span className="flex items-center gap-1">Estimat: <BPChip v={liveMatchup.estimate} /></span>
                    )}
                    <span className="flex items-center gap-1.5">
                      Live: <span className="text-[#e8e8f0] font-bold">{liveMatchup.aVP ?? 0}</span>–<span className="text-[#e8e8f0] font-bold">{liveMatchup.bVP ?? 0}</span> VP
                      <span className="text-[#8888a0]">(runde {liveMatchup.round ?? 1}/5)</span>
                    </span>
                  </div>
                  {liveMatchup.layoutPage && (
                    <details>
                      <summary className="text-[10px] text-[#a855f7] cursor-pointer hover:text-[#c084fc]">Vis layout</summary>
                      <img src={getLayoutImage(liveMatchup.layoutPage)} alt="Layout" className="mt-2 rounded-lg border border-white/[0.08] w-full max-w-sm" />
                    </details>
                  )}
                </div>
              ) : currentRound?.status === "pairing" ? (
                <p className="text-[12px] text-[#8888a0]">Kaptajnen laver pairings — din kamp dukker op her når den er sat.</p>
              ) : (
                <p className="text-[12px] text-[#8888a0]">Ingen aktiv kamp lige nu.</p>
              )}
            </div>

            {/* Your calibration */}
            {calibration && (
              <div className="rounded-xl border border-white/[0.08] p-4">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-sm font-semibold text-[#e8e8f0]">Din kalibrering</h2>
                  <span className="text-[10px] text-[#8888a0]">{calibration.n} kampe</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl font-bold ${Math.abs(calibration.avg) <= 1 ? "text-[#4ade80]" : calibration.avg > 0 ? "text-[#facc15]" : "text-[#f87171]"}`}>
                    {calibration.avg > 0 ? "+" : ""}{calibration.avg.toFixed(1)}
                  </span>
                  <span className="text-[11px] text-[#8888a0]">snit-afvigelse (±{calibration.abs.toFixed(1)})</span>
                </div>
                <p className="text-[10px] text-[#8888a0] mt-1">
                  {calibration.avg > 1 ? "Du spiller bedre end dine estimater — vær lidt mere optimistisk." : calibration.avg < -1 ? "Dine estimater er for optimistiske — skru lidt ned." : "Godt kalibreret."}
                </p>
              </div>
            )}

            {/* Your results */}
            <div className="rounded-xl border border-white/[0.08] p-4">
              <h2 className="text-sm font-semibold text-[#e8e8f0] mb-3">Dine resultater</h2>
              {myResults.length === 0 ? (
                <p className="text-[11px] text-[#8888a0]">Ingen færdigspillede kampe endnu.</p>
              ) : (
                <div className="space-y-1">
                  {myResults.map((r) => (
                    <div key={r.round} className="flex items-center gap-2 rounded-lg border border-white/[0.05] px-2.5 py-1.5">
                      <span className="text-[10px] font-semibold text-[#8888a0] bg-[#22222e] px-1.5 py-0.5 rounded shrink-0">R{r.round}</span>
                      <span className="text-[11px] text-[#e8e8f0] flex-1 min-w-0 truncate">vs {r.opponent} · {r.theirFaction}</span>
                      {r.estimate !== null ? <BPChip v={r.estimate} /> : <span className="w-8 text-center text-[10px] text-[#44445a]">—</span>}
                      <span className="text-[9px] text-[#8888a0]">→</span>
                      <BPChip v={r.actual} big />
                      {r.delta !== null && (
                        <span className={`text-[11px] font-bold w-8 text-right ${Math.abs(r.delta) <= 1 ? "text-[#8888a0]" : r.delta > 0 ? "text-[#4ade80]" : "text-[#f87171]"}`}>
                          {r.delta > 0 ? "+" : ""}{r.delta}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Your estimates progress */}
            <div className="rounded-xl border border-white/[0.08] p-4">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-sm font-semibold text-[#e8e8f0]">Dine estimater</h2>
                <Link href="/estimates" className="ml-auto text-[11px] text-[#a855f7] hover:text-[#c084fc] transition-colors">Udfyld →</Link>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-[#a855f7]" style={{ width: `${myProgress.total ? Math.round(100 * myProgress.filled / myProgress.total) : 0}%` }} />
                </div>
                <span className="text-[11px] text-[#8888a0]">{myProgress.filled}/{myProgress.total}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
