"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DISP_STYLES, type Disposition } from "@/lib/data";
import { getLayoutImage } from "@/lib/layouts";
import { vpToBP, calculateTeamBP, teamResult } from "@/lib/scoring";
import {
  type SessionData,
  type MatchupData,
  subscribeToSession,
  updateMatchupEstimate,
  updateMatchupRound,
  updateMatchupNotes,
  updateMatchupFinal,
} from "@/lib/session";

function DispDot({ d }: { d: Disposition | null }) {
  if (!d) return null;
  const s = DISP_STYLES[d];
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ background: s.color }}
      title={d}
    />
  );
}

function BPBadge({ vp }: { vp: number }) {
  const bp = vpToBP(vp);
  const isPositive = vp >= 0;
  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
        Math.abs(vp) <= 5
          ? "bg-[#8888a0]/10 text-[#8888a0]"
          : isPositive
            ? "bg-[rgba(34,197,94,0.12)] text-[#4ade80]"
            : "bg-[rgba(239,68,68,0.12)] text-[#f87171]"
      }`}
    >
      {isPositive ? bp.winner : bp.loser} BP
    </span>
  );
}

export default function CoachingPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null);
  const [view, setView] = useState<"captain" | "coach">("captain");

  useEffect(() => {
    if (!sessionId) return;
    try {
      const unsub = subscribeToSession(sessionId, (data) => {
        if (data) {
          setSession(data);
          setError(null);
        } else {
          setError("Session ikke fundet");
        }
        setLoading(false);
      });
      return unsub;
    } catch {
      setError("Kunne ikke forbinde til Firebase");
      setLoading(false);
    }
  }, [sessionId]);

  const handleEstimate = useCallback(
    (idx: number, value: number) => {
      updateMatchupEstimate(sessionId, idx, value);
    },
    [sessionId]
  );

  const handleRound = useCallback(
    (idx: number, round: number) => {
      updateMatchupRound(sessionId, idx, round);
    },
    [sessionId]
  );

  const handleNotes = useCallback(
    (idx: number, notes: string) => {
      updateMatchupNotes(sessionId, idx, notes);
    },
    [sessionId]
  );

  const handleFinal = useCallback(
    (idx: number, final: boolean) => {
      updateMatchupFinal(sessionId, idx, final);
    },
    [sessionId]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-[#8888a0] text-sm">Indlæser session...</div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <div className="text-red-400 text-sm">{error || "Ukendt fejl"}</div>
        <Link href="/pairings" className="text-[#a855f7] text-xs hover:text-[#c084fc]">
          ← Tilbage til pairings
        </Link>
      </div>
    );
  }

  const estimates = session.matchups.map((m) => ({
    aVP: Math.max(0, 50 + m.estimate / 2),
    bVP: Math.max(0, 50 - m.estimate / 2),
  }));
  const { teamABP, teamBBP } = calculateTeamBP(estimates);
  const result = teamResult(teamABP, teamBBP);
  const finishedCount = session.matchups.filter((m) => m.final).length;

  return (
    <>
      <header className="px-4 sm:px-6 py-4 border-b border-white/[0.08] sticky top-0 bg-[#0f0f13] z-20">
        <div className="flex items-center gap-2 text-xs text-[#8888a0] mb-1">
          <Link href="/" className="hover:text-[#e8e8f0] transition-colors">
            Matrix
          </Link>
          <span>/</span>
          <span className="text-[#e8e8f0]">Coaching</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-base font-semibold text-[#e8e8f0]">
            {session.teamAName} vs {session.teamBName}
          </h1>
          <div className="flex gap-1 ml-auto">
            <button
              onClick={() => setView("captain")}
              className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                view === "captain"
                  ? "bg-[#a855f7] text-white"
                  : "bg-[#22222e] text-[#8888a0] hover:text-[#e8e8f0]"
              }`}
            >
              Kaptajn
            </button>
            <button
              onClick={() => setView("coach")}
              className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                view === "coach"
                  ? "bg-[#a855f7] text-white"
                  : "bg-[#22222e] text-[#8888a0] hover:text-[#e8e8f0]"
              }`}
            >
              Coach
            </button>
          </div>
        </div>

        {/* Scoreboard */}
        <div className="mt-3 flex items-center gap-4 bg-[#1a1a22] rounded-lg p-3 border border-white/[0.08]">
          <div className={`flex-1 text-center ${result === "A" ? "" : "opacity-60"}`}>
            <div className="text-[11px] text-[#8888a0] uppercase tracking-wider">
              {session.teamAName}
            </div>
            <div className={`text-2xl font-bold ${result === "A" ? "text-[#4ade80]" : "text-[#e8e8f0]"}`}>
              {teamABP}
            </div>
            <div className="text-[10px] text-[#8888a0]">BP</div>
          </div>
          <div className="text-center px-2 sm:px-4 shrink-0">
            <div className={`text-[10px] sm:text-xs font-semibold rounded px-2 py-0.5 ${
              result === "draw"
                ? "bg-[#8888a0]/10 text-[#8888a0]"
                : result === "A"
                  ? "bg-[rgba(34,197,94,0.12)] text-[#4ade80]"
                  : "bg-[rgba(239,68,68,0.12)] text-[#f87171]"
            }`}>
              {result === "draw" ? "DRAW" : "FØRER"}
            </div>
            <div className="text-[9px] sm:text-[10px] text-[#8888a0] mt-1">
              Diff: {Math.abs(teamABP - teamBBP)} BP · {finishedCount}/8
            </div>
          </div>
          <div className={`flex-1 text-center ${result === "B" ? "" : "opacity-60"}`}>
            <div className="text-[11px] text-[#8888a0] uppercase tracking-wider">
              {session.teamBName}
            </div>
            <div className={`text-2xl font-bold ${result === "B" ? "text-[#4ade80]" : "text-[#e8e8f0]"}`}>
              {teamBBP}
            </div>
            <div className="text-[10px] text-[#8888a0]">BP</div>
          </div>
        </div>
      </header>

      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <div className="space-y-3">
          {session.matchups.map((matchup, idx) => (
            <MatchupCard
              key={idx}
              idx={idx}
              matchup={matchup}
              teamAName={session.teamAName}
              teamBName={session.teamBName}
              expanded={expandedMatch === idx}
              onToggle={() => setExpandedMatch(expandedMatch === idx ? null : idx)}
              isCoach={view === "coach"}
              onEstimate={handleEstimate}
              onRound={handleRound}
              onNotes={handleNotes}
              onFinal={handleFinal}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function MatchupCard({
  idx,
  matchup,
  teamAName,
  teamBName,
  expanded,
  onToggle,
  isCoach,
  onEstimate,
  onRound,
  onNotes,
  onFinal,
}: {
  idx: number;
  matchup: MatchupData;
  teamAName: string;
  teamBName: string;
  expanded: boolean;
  onToggle: () => void;
  isCoach: boolean;
  onEstimate: (idx: number, v: number) => void;
  onRound: (idx: number, r: number) => void;
  onNotes: (idx: number, n: string) => void;
  onFinal: (idx: number, f: boolean) => void;
}) {
  const bp = vpToBP(matchup.estimate);
  const aAhead = matchup.estimate >= 0;

  return (
    <div
      className={`rounded-lg border transition-colors ${
        matchup.final
          ? "border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.03)]"
          : "border-white/[0.08]"
      }`}
    >
      {/* Summary row — always visible */}
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-2.5"
      >
        {/* Mobile: stacked layout */}
        <div className="flex items-center gap-2 sm:hidden">
          <span className="text-[11px] text-[#8888a0] w-5 shrink-0 font-semibold">
            {idx + 1}.
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <DispDot d={matchup.aDisposition} />
              <span className="text-[12px] text-[#e8e8f0] truncate">{matchup.aFaction}</span>
              <BPBadge vp={matchup.estimate} />
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <DispDot d={matchup.bDisposition} />
              <span className="text-[12px] text-[#e8e8f0] truncate">{matchup.bFaction}</span>
              <BPBadge vp={-matchup.estimate} />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 shrink-0">
            <span className={`text-[13px] font-bold ${
              matchup.estimate > 5
                ? "text-[#4ade80]"
                : matchup.estimate < -5
                  ? "text-[#f87171]"
                  : "text-[#8888a0]"
            }`}>
              {matchup.estimate > 0 ? "+" : ""}{matchup.estimate}
            </span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((r) => (
                <span
                  key={r}
                  className={`w-1.5 h-1.5 rounded-full ${
                    r <= matchup.round
                      ? matchup.final ? "bg-[#4ade80]" : "bg-[#a855f7]"
                      : "bg-[#8888a0]/20"
                  }`}
                />
              ))}
            </div>
            {matchup.final && (
              <span className="text-[8px] font-semibold text-[#4ade80] bg-[rgba(34,197,94,0.12)] px-1 py-0.5 rounded">
                DONE
              </span>
            )}
          </div>
        </div>

        {/* Desktop: single row */}
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-[11px] text-[#8888a0] w-5 shrink-0 font-semibold">
            {idx + 1}.
          </span>
          <DispDot d={matchup.aDisposition} />
          <span className="text-[12px] text-[#e8e8f0] truncate flex-1 min-w-0">
            {matchup.aFaction}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <BPBadge vp={matchup.estimate} />
            <span className={`text-[13px] font-bold w-8 text-center ${
              matchup.estimate > 5
                ? "text-[#4ade80]"
                : matchup.estimate < -5
                  ? "text-[#f87171]"
                  : "text-[#8888a0]"
            }`}>
              {matchup.estimate > 0 ? "+" : ""}{matchup.estimate}
            </span>
            <BPBadge vp={-matchup.estimate} />
          </div>
          <span className="text-[12px] text-[#e8e8f0] truncate flex-1 min-w-0 text-right">
            {matchup.bFaction}
          </span>
          <DispDot d={matchup.bDisposition} />
          <div className="flex items-center gap-1 shrink-0 ml-1">
            {[1, 2, 3, 4, 5].map((r) => (
              <span
                key={r}
                className={`w-1.5 h-1.5 rounded-full ${
                  r <= matchup.round
                    ? matchup.final
                      ? "bg-[#4ade80]"
                      : "bg-[#a855f7]"
                    : "bg-[#8888a0]/20"
                }`}
              />
            ))}
          </div>
          {matchup.final && (
            <span className="text-[9px] font-semibold text-[#4ade80] bg-[rgba(34,197,94,0.12)] px-1.5 py-0.5 rounded">
              DONE
            </span>
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-white/[0.06] pt-3 space-y-3">
          {/* Match info */}
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-[#8888a0] bg-[#22222e] px-1.5 py-0.5 rounded shrink-0">
              {matchup.module}
            </span>
            <span className="text-[#8888a0] break-words">
              {matchup.aDetachments.join(", ")} vs {matchup.bDetachments.join(", ")}
            </span>
          </div>

          {/* Round tracker */}
          <div>
            <div className="text-[10px] text-[#8888a0] uppercase tracking-wider mb-1.5 font-semibold">
              Runde
            </div>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((r) => (
                <button
                  key={r}
                  onClick={() => isCoach && onRound(idx, r)}
                  disabled={!isCoach}
                  className={`w-9 h-8 rounded text-xs font-semibold transition-colors ${
                    r <= matchup.round
                      ? matchup.final
                        ? "bg-[rgba(34,197,94,0.15)] text-[#4ade80] border border-[rgba(34,197,94,0.3)]"
                        : "bg-[rgba(168,85,247,0.15)] text-[#a855f7] border border-[rgba(168,85,247,0.3)]"
                      : "bg-[#22222e] text-[#8888a0] border border-white/[0.08]"
                  } ${isCoach ? "cursor-pointer hover:border-white/20" : "cursor-default"}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Estimate slider */}
          <div>
            <div className="text-[10px] text-[#8888a0] uppercase tracking-wider mb-1.5 font-semibold">
              VP Estimat
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#e8e8f0] w-12 sm:w-20 truncate shrink-0">{matchup.aFaction}</span>
              <input
                type="range"
                min={-50}
                max={50}
                step={5}
                value={matchup.estimate}
                onChange={(e) => isCoach && onEstimate(idx, Number(e.target.value))}
                disabled={!isCoach}
                className="flex-1 accent-[#a855f7] h-2 cursor-pointer disabled:cursor-default min-w-0"
              />
              <span className="text-[10px] text-[#e8e8f0] w-12 sm:w-20 truncate text-right shrink-0">{matchup.bFaction}</span>
            </div>
            <div className="flex justify-between text-[10px] text-[#8888a0] mt-0.5 px-12 sm:px-20">
              <span>+50</span>
              <span>0</span>
              <span>+50</span>
            </div>
            <div className="text-center mt-1">
              <span className={`text-sm font-bold ${
                matchup.estimate > 5
                  ? "text-[#4ade80]"
                  : matchup.estimate < -5
                    ? "text-[#f87171]"
                    : "text-[#8888a0]"
              }`}>
                {matchup.estimate > 0 ? "+" : ""}{matchup.estimate} VP
              </span>
              <div className="text-[10px] text-[#8888a0] mt-0.5 sm:inline sm:ml-2">
                → {aAhead ? teamAName : teamBName} {bp.winner} BP / {aAhead ? teamBName : teamAName} {bp.loser} BP
              </div>
            </div>
          </div>

          {/* Quick estimate buttons */}
          {isCoach && (
            <div className="flex flex-wrap gap-1.5">
              {[-40, -30, -20, -10, 0, 10, 20, 30, 40].map((v) => (
                <button
                  key={v}
                  onClick={() => onEstimate(idx, v)}
                  className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                    matchup.estimate === v
                      ? "border-[#a855f7] bg-[rgba(168,85,247,0.15)] text-[#a855f7]"
                      : "border-white/[0.08] text-[#8888a0] hover:border-white/[0.18] hover:text-[#e8e8f0]"
                  }`}
                >
                  {v > 0 ? "+" : ""}{v}
                </button>
              ))}
            </div>
          )}

          {/* Notes */}
          {isCoach && (
            <div>
              <textarea
                value={matchup.notes}
                onChange={(e) => onNotes(idx, e.target.value)}
                placeholder="Noter..."
                className="w-full h-12 bg-[#1a1a22] border border-white/[0.14] rounded p-2 text-[11px] text-[#e8e8f0] placeholder:text-[#8888a0] outline-none resize-none focus:border-[#a855f7]"
              />
            </div>
          )}
          {!isCoach && matchup.notes && (
            <div className="text-[11px] text-[#8888a0] bg-[#1a1a22] rounded p-2 border border-white/[0.06]">
              {matchup.notes}
            </div>
          )}

          {/* Mark as done */}
          {isCoach && (
            <button
              onClick={() => onFinal(idx, !matchup.final)}
              className={`text-[11px] font-medium px-3 py-1.5 rounded-md transition-colors ${
                matchup.final
                  ? "bg-[rgba(34,197,94,0.12)] text-[#4ade80] border border-[rgba(34,197,94,0.3)]"
                  : "bg-[#22222e] text-[#8888a0] border border-white/[0.08] hover:text-[#e8e8f0]"
              }`}
            >
              {matchup.final ? "✓ Markeret som færdig" : "Markér som færdig"}
            </button>
          )}

          {/* Layout image */}
          {matchup.layoutPage && (
            <details>
              <summary className="text-[10px] text-[#a855f7] cursor-pointer hover:text-[#c084fc]">
                Vis layout
              </summary>
              <img
                src={getLayoutImage(matchup.layoutPage)}
                alt="Layout"
                className="mt-2 rounded-lg border border-white/[0.08] w-full max-w-md"
              />
            </details>
          )}
        </div>
      )}
    </div>
  );
}
