"use client";

import { type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useActivePlayer } from "@/lib/active-player";
import LoginScreen from "./LoginScreen";
import PendingScreen from "./PendingScreen";

// The single gate in front of the whole app:
//   loading                    -> spinner
//   not signed in              -> LoginScreen
//   signed in, no access grant -> PendingScreen (awaiting approval)
//   player / coach / admin      -> the app
export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { access } = useActivePlayer();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-white/[0.15] border-t-[#a855f7] animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginScreen />;
  if (!access) return <PendingScreen />;

  return <>{children}</>;
}
