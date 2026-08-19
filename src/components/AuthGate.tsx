"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useActivePlayer } from "@/lib/active-player";
import SiteNav from "./SiteNav";
import LoginScreen from "./LoginScreen";
import Landing from "./Landing";

// The single gate in front of the whole app:
//   loading                    -> spinner
//   not signed in              -> LoginScreen
//   signed in, no access:
//      on a /join route         -> the join page (claim a slot via invite)
//      otherwise                -> Landing (create your own tournament)
//   owner / player / coach / admin -> the app (with nav)
export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { access } = useActivePlayer();
  const pathname = usePathname() || "/";

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-white/[0.15] border-t-[#a855f7] animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginScreen />;
  if (!access) {
    // A join link is reachable by any signed-in user (that's the point).
    if (pathname.startsWith("/join")) return <>{children}</>;
    return <Landing />;
  }

  return (
    <>
      <SiteNav />
      {children}
    </>
  );
}
