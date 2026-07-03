"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import CoachingDashboard from "@/components/CoachingDashboard";
import {
  subscribeToTournament,
  type TournamentDoc,
} from "@/lib/tournament-db";

export default function TeamRoomPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [doc, setDoc] = useState<TournamentDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setNotFound(false);
    try {
      const unsub = subscribeToTournament(slug, (data) => {
        if (data) {
          setDoc(data);
          setNotFound(false);
        } else {
          setNotFound(true);
        }
        setLoading(false);
      });
      return unsub;
    } catch {
      setNotFound(true);
      setLoading(false);
    }
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-[#8888a0] text-sm">Indlæser team room...</div>
      </div>
    );
  }

  if (notFound || !doc) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <div className="text-red-400 text-sm">Hold ikke fundet</div>
        <p className="text-[11px] text-[#8888a0]">
          Tjek at URL&apos;en er korrekt: /team/{slug}
        </p>
        <Link
          href="/tournament"
          className="text-[#a855f7] text-xs hover:text-[#c084fc]"
        >
          ← Gå til turnering
        </Link>
      </div>
    );
  }

  const completedRounds = (doc.rounds || []).filter(
    (r) => r.status === "completed"
  );
  const currentRound = (doc.rounds || []).find(
    (r) => r.status === "pairing" || r.status === "live"
  );

  return (
    <>
      <header className="px-4 sm:px-6 py-4 border-b border-white/[0.08] sticky top-0 bg-[#0f0f13] z-20">
        <div className="flex items-center gap-2 text-xs text-[#8888a0] mb-1">
          <Link href="/" className="hover:text-[#e8e8f0] transition-colors">
            Matrix
          </Link>
          <span>/</span>
          <span className="text-[#e8e8f0]">Team Room</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-[#e8e8f0]">
            {doc.teamName}
          </h1>
          {currentRound && (
            <span className="text-[10px] font-semibold text-[#a855f7] bg-[rgba(168,85,247,0.1)] px-2 py-0.5 rounded-md">
              Runde {currentRound.number}
            </span>
          )}
          {doc.activeSessionId && (
            <span className="text-[9px] text-[#4ade80] bg-[rgba(34,197,94,0.1)] px-2 py-0.5 rounded-full animate-pulse">
              LIVE
            </span>
          )}
        </div>
      </header>

      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        {/* Active coaching session */}
        {doc.activeSessionId && (
          <CoachingDashboard sessionId={doc.activeSessionId} embedded />
        )}

        {/* Pairing in progress, no active session yet */}
        {!doc.activeSessionId && currentRound?.status === "pairing" && (
          <div className="rounded-xl border border-dashed border-[rgba(168,85,247,0.3)] bg-[rgba(168,85,247,0.03)] p-8 text-center">
            <div className="text-[#a855f7] text-sm font-semibold mb-1">
              Runde {currentRound.number}
            </div>
            <div className="text-[#8888a0] text-xs">
              Kaptajnen laver pairings...
            </div>
            <div className="mt-3 flex justify-center gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-[#a855f7] animate-pulse"
                  style={{ animationDelay: `${i * 0.3}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* No active round */}
        {!doc.activeSessionId && !currentRound && (
          <div className="rounded-xl border border-dashed border-white/[0.08] p-8 text-center">
            <div className="text-[#8888a0] text-xs">
              {completedRounds.length > 0
                ? "Venter på næste runde..."
                : "Turneringen er ikke startet endnu."}
            </div>
          </div>
        )}

        {/* Round history */}
        {completedRounds.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xs font-semibold text-[#8888a0] uppercase tracking-wider mb-3">
              Afsluttede runder
            </h2>
            <div className="space-y-2">
              {completedRounds
                .sort((a, b) => b.number - a.number)
                .map((r) => (
                  <div
                    key={r.number}
                    className="rounded-lg border border-white/[0.08] p-3 flex items-center gap-3"
                  >
                    <span className="text-[11px] font-semibold text-[#8888a0] bg-[#22222e] px-2 py-0.5 rounded">
                      Runde {r.number}
                    </span>
                    <span className="text-[12px] text-[#e8e8f0]">
                      vs {r.opponentName}
                    </span>
                    {r.sessionId && (
                      <Link
                        href={`/coaching/${r.sessionId}`}
                        className="ml-auto text-[11px] text-[#a855f7] hover:text-[#c084fc] transition-colors"
                      >
                        Se resultater →
                      </Link>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
