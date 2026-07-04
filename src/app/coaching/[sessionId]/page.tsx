"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import CoachingDashboard from "@/components/CoachingDashboard";
import { subscribeToTournament, type TournamentDoc } from "@/lib/tournament-db";
import { TEAM_SLUG } from "@/lib/team";

export default function CoachingPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  // Look up the team tournament so the round can be completed from this page
  // when this session is the active one.
  const [doc, setDoc] = useState<TournamentDoc | null>(null);
  useEffect(() => {
    try {
      return subscribeToTournament(TEAM_SLUG, setDoc);
    } catch {}
  }, []);

  const isActive = doc?.activeSessionId === sessionId;
  const round = isActive
    ? (doc?.rounds || []).find((r) => r.sessionId === sessionId)
    : undefined;

  return (
    <CoachingDashboard
      sessionId={sessionId}
      teamSlug={isActive ? TEAM_SLUG : undefined}
      roundNumber={round?.number}
      onRoundCompleted={() => router.push("/tournament")}
    />
  );
}
