"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import CoachingDashboard from "@/components/CoachingDashboard";
import { subscribeToTournament, type TournamentDoc } from "@/lib/tournament-db";
import { fetchSession } from "@/lib/session";
import { TEAM_SLUG } from "@/lib/team";

export default function CoachingPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  // The session records which tournament it belongs to; fall back to WTC 2026
  // for sessions created before that field existed.
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    fetchSession(sessionId)
      .then((s) => setSlug(s?.teamSlug ?? TEAM_SLUG))
      .catch(() => setSlug(TEAM_SLUG));
  }, [sessionId]);

  // Look up that tournament so the round can be completed from this page when
  // this session is the active one.
  const [doc, setDoc] = useState<TournamentDoc | null>(null);
  useEffect(() => {
    if (!slug) return;
    try {
      return subscribeToTournament(slug, setDoc);
    } catch {}
  }, [slug]);

  const isActive = doc?.activeSessionId === sessionId;
  const round = isActive
    ? (doc?.rounds || []).find((r) => r.sessionId === sessionId)
    : undefined;

  return (
    <CoachingDashboard
      sessionId={sessionId}
      teamSlug={isActive ? slug ?? undefined : undefined}
      roundNumber={round?.number}
      onRoundCompleted={() => router.push("/tournament")}
    />
  );
}
