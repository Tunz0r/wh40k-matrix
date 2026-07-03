"use client";

import { useParams } from "next/navigation";
import CoachingDashboard from "@/components/CoachingDashboard";

export default function CoachingPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  return <CoachingDashboard sessionId={sessionId} />;
}
