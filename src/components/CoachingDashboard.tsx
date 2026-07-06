"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { DISP_STYLES, type Disposition } from "@/lib/data";
import { getLayoutImage } from "@/lib/layouts";
import { vpToBP, calculateTeamBP, teamResult } from "@/lib/scoring";
import {
  type SessionData,
  type MatchupData,
  subscribeToSession,
  updateMatchupVP,
  updateMatchupRound,
  updateMatchupNotes,
  updateMatchupFinal,
} from "@/lib/session";
import { updateRoundStatus } from "@/lib/tournament-db";

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

interface CoachingDashboardProps {
  sessionId: string;
  embedded?: boolean;
  teamSlug?: string;
  roundNumber?: number;
  onRoundCompleted?: () => void;
}

export default function CoachingDashboard({ sessionId, embedded, teamSlug, roundNumber, onRoundCompleted }: CoachingDashboardProps) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null);
  const [view, setView] = useState<"captain" | "coach">("captain");

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
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

  const handleVP = useCallback(
    (idx: number, aVP: number, bVP: number) => {
      updateMatchupVP(sessionId, idx, aVP, bVP);
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
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-[#8888a0] text-sm">Indlæser session...</div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] gap-3">
        <div className="text-red-400 text-sm">{error || "Ukendt fejl"}</div>
        {!embedded && (
          <Link href="/tournament" className="text-[#a855f7] text-xs hover:text-[#c084fc]">
            ← Tilbage til turnering
          </Link>
        )}
      </div>
    );
  }

  const estimates = session.matchups.map((m) => ({
    aVP: m.aVP ?? 0,
    bVP: m.bVP ?? 0,
  }));
  const { teamABP, teamBBP } = calculateTeamBP(estimates);
  const result = teamResult(teamABP, teamBBP);
  const finishedCount = session.matchups.filter((m) => m.final).length;

  return (
    <>
      {!embedded && (
        <header className="px-4 sm:px-6 py-4 border-b border-white/[0.08] sticky top-0 bg-[#0f0f13] z-20">
          <div className="flex items-center gap-2 text-xs text-[#8888a0] mb-1">
            <Link href="/" className="hover:text-[#e8e8f0] transition-colors">
              Matrix
            </Link>
            <span>/</span>
            <Link href="/tournament" className="hover:text-[#e8e8f0] transition-colors">
              Turnering
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
        </header>
      )}

      {embedded && (
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <h2 className="text-sm font-semibold text-[#e8e8f0]">
            {session.teamAName} vs {session.teamBName}
          </h2>
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
      )}

      {/* Scoreboard */}
      <div className={embedded ? "mb-4" : "px-4 sm:px-6 sticky top-0 bg-[#0f0f13] z-10"}>
        <div className={`flex items-center gap-4 bg-[#1a1a22] rounded-lg p-3 border border-white/[0.08] ${!embedded ? "mt-3" : ""}`}>
          <div className={`flex-1 text-center ${result === "A" ? "" : "opacity-60"}`}>
            <div className="text-[10px] text-[#4ade80] uppercase tracking-wider font-semibold">
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
      </div>

      <div className={embedded ? "" : "p-4 sm:p-6 max-w-4xl mx-auto"}>
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
              onVP={handleVP}
              onRound={handleRound}
              onNotes={handleNotes}
              onFinal={handleFinal}
            />
          ))}
        </div>

        {teamSlug && roundNumber && finishedCount === session.matchups.length && (
          <div className="mt-6 text-center">
            <button
              onClick={() => {
                if (!confirm(`Afslut runde ${roundNumber}? Alle kampe er færdige.`)) return;
                updateRoundStatus(teamSlug, roundNumber, "completed", { us: teamABP, them: teamBBP }).then(() => {
                  onRoundCompleted?.();
                }).catch(() => {});
              }}
              className="text-[13px] font-semibold text-white bg-[#4ade80] hover:bg-[#22c55e] px-6 py-2.5 rounded-lg transition-colors"
            >
              Afslut runde {roundNumber}
            </button>
            <p className="text-[10px] text-[#8888a0] mt-1.5">Alle {session.matchups.length} kampe er markeret som færdige</p>
          </div>
        )}
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
  onVP,
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
  onVP: (idx: number, aVP: number, bVP: number) => void;
  onRound: (idx: number, r: number) => void;
  onNotes: (idx: number, n: string) => void;
  onFinal: (idx: number, f: boolean) => void;
}) {
  const aVP = matchup.aVP ?? 0;
  const bVP = matchup.bVP ?? 0;
  const vpDiff = aVP - bVP;
  const bp = vpToBP(vpDiff);
  const aAhead = vpDiff >= 0;

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
              <span className="text-[12px] text-[#e8e8f0] truncate font-medium">{matchup.aFaction}</span>
              <span className={`text-[12px] font-bold ml-auto shrink-0 ${aAhead ? "text-[#4ade80]" : "text-[#e8e8f0]"}`}>{aVP}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <DispDot d={matchup.bDisposition} />
              <span className="text-[12px] text-[#8888a0] truncate">{matchup.bFaction}</span>
              <span className={`text-[12px] font-bold ml-auto shrink-0 ${!aAhead && vpDiff !== 0 ? "text-[#f87171]" : "text-[#8888a0]"}`}>{bVP}</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 shrink-0 pl-2 border-l border-white/[0.06]">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
              aAhead ? "bg-[rgba(34,197,94,0.12)] text-[#4ade80]" : !aAhead && vpDiff !== 0 ? "bg-[rgba(239,68,68,0.12)] text-[#f87171]" : "bg-[#8888a0]/10 text-[#8888a0]"
            }`}>
              {aAhead ? bp.winner : bp.loser} BP
            </span>
            {matchup.estimate != null && matchup.estimate > 0 && (
              <span className={`text-[9px] ${matchup.estimate >= 11 ? "text-[#4ade80]" : matchup.estimate <= 9 ? "text-[#f87171]" : "text-[#8888a0]"}`}>
                Est {matchup.estimate}
              </span>
            )}
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
          <span className="text-[12px] text-[#e8e8f0] truncate flex-1 min-w-0 font-medium">
            {matchup.aFaction}
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <span className={`text-[14px] font-bold w-7 text-right ${aAhead ? "text-[#4ade80]" : "text-[#e8e8f0]"}`}>{aVP}</span>
            <span className="text-[11px] text-[#8888a0]">–</span>
            <span className={`text-[14px] font-bold w-7 ${!aAhead && vpDiff !== 0 ? "text-[#f87171]" : "text-[#8888a0]"}`}>{bVP}</span>
          </div>
          <span className="text-[12px] text-[#8888a0] truncate flex-1 min-w-0 text-right">
            {matchup.bFaction}
          </span>
          <DispDot d={matchup.bDisposition} />
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
            aAhead ? "bg-[rgba(34,197,94,0.12)] text-[#4ade80]" : !aAhead && vpDiff !== 0 ? "bg-[rgba(239,68,68,0.12)] text-[#f87171]" : "bg-[#8888a0]/10 text-[#8888a0]"
          }`}>
            {aAhead ? bp.winner : bp.loser} BP
          </span>
          {matchup.estimate != null && matchup.estimate > 0 && (
            <span className={`text-[9px] shrink-0 ${matchup.estimate >= 11 ? "text-[#4ade80]" : matchup.estimate <= 9 ? "text-[#f87171]" : "text-[#8888a0]"}`}>
              Est {matchup.estimate}
            </span>
          )}
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

          {/* VP Score input */}
          <div>
            <div className="text-[10px] text-[#8888a0] uppercase tracking-wider mb-2 font-semibold">
              Score
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* Team A (our team) */}
              <div className="rounded-lg border border-[rgba(34,197,94,0.2)] bg-[rgba(34,197,94,0.03)] p-2.5">
                <div className="flex items-center gap-1.5 mb-2">
                  <DispDot d={matchup.aDisposition} />
                  <span className="text-[11px] text-[#4ade80] font-medium truncate">{matchup.aFaction}</span>
                </div>
                <div className="flex items-center gap-2">
                  {isCoach && (
                    <button
                      onClick={() => onVP(idx, Math.max(0, aVP - 1), bVP)}
                      className="w-8 h-8 rounded bg-[#22222e] text-[#8888a0] hover:text-[#e8e8f0] border border-white/[0.08] text-sm font-bold"
                    >
                      −
                    </button>
                  )}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={aVP}
                    onChange={(e) => isCoach && onVP(idx, Math.max(0, Number(e.target.value) || 0), bVP)}
                    disabled={!isCoach}
                    className="flex-1 text-center text-xl font-bold bg-[#1a1a22] border border-white/[0.14] rounded px-1 py-1.5 text-[#e8e8f0] outline-none focus:border-[#4ade80] disabled:opacity-60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  {isCoach && (
                    <button
                      onClick={() => onVP(idx, Math.min(100, aVP + 1), bVP)}
                      className="w-8 h-8 rounded bg-[#22222e] text-[#8888a0] hover:text-[#e8e8f0] border border-white/[0.08] text-sm font-bold"
                    >
                      +
                    </button>
                  )}
                </div>
              </div>
              {/* Team B (opponent) */}
              <div className="rounded-lg border border-white/[0.08] p-2.5">
                <div className="flex items-center gap-1.5 mb-2">
                  <DispDot d={matchup.bDisposition} />
                  <span className="text-[11px] text-[#8888a0] font-medium truncate">{matchup.bFaction}</span>
                </div>
                <div className="flex items-center gap-2">
                  {isCoach && (
                    <button
                      onClick={() => onVP(idx, aVP, Math.max(0, bVP - 1))}
                      className="w-8 h-8 rounded bg-[#22222e] text-[#8888a0] hover:text-[#e8e8f0] border border-white/[0.08] text-sm font-bold"
                    >
                      −
                    </button>
                  )}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={bVP}
                    onChange={(e) => isCoach && onVP(idx, aVP, Math.max(0, Number(e.target.value) || 0))}
                    disabled={!isCoach}
                    className="flex-1 text-center text-xl font-bold bg-[#1a1a22] border border-white/[0.14] rounded px-1 py-1.5 text-[#e8e8f0] outline-none focus:border-[#a855f7] disabled:opacity-60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  {isCoach && (
                    <button
                      onClick={() => onVP(idx, aVP, Math.min(100, bVP + 1))}
                      className="w-8 h-8 rounded bg-[#22222e] text-[#8888a0] hover:text-[#e8e8f0] border border-white/[0.08] text-sm font-bold"
                    >
                      +
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="text-center mt-2 text-[10px] text-[#8888a0]">
              → {teamAName} {aAhead ? bp.winner : bp.loser} BP / {teamBName} {aAhead ? bp.loser : bp.winner} BP
            </div>
          </div>

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
