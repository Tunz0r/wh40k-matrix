"use client";

// Global "active tournament" selection. A nav dropdown sets it; pages read it to
// scope what they show. Backed by localStorage so it persists per device, and by
// the registry so the list stays live. Defaults to WTC 2026.
//
// Phase 2 note: estimate pages will read `activeSlug` once estimates-db is
// parameterized by dataSlug. For now the selection drives the nav (brand + team
// room) and is the seam everything else hangs off.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  subscribeToRegistry,
  ensureRegistry,
  WTC_2026,
  type TournamentMeta,
} from "./tournaments-registry";
import { subscribeToMyTournaments, subscribeToIsAdmin } from "./membership";
import { useAuth } from "./auth";

const KEY = "wtc-active-tournament";

interface ActiveTournament {
  tournaments: TournamentMeta[];
  active: TournamentMeta | null;
  activeId: string;
  activeSlug: string; // dataSlug of the active tournament
  activeFieldSlug?: string; // event's shared field node, when the camp is in an event
  setActive: (id: string) => void;
}

const Ctx = createContext<ActiveTournament | null>(null);

export function ActiveTournamentProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState<TournamentMeta[]>([]);
  const [activeId, setActiveId] = useState<string>(WTC_2026.id);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setActiveId(saved);
    ensureRegistry().catch(() => {});
  }, []);

  useEffect(() => subscribeToIsAdmin(user?.uid ?? null, setIsAdmin), [user?.uid]);

  // The switchable list: admins see the whole registry; everyone else sees the
  // tournaments they belong to. Sourcing this from the admin-only registry was a
  // bug — non-admins got an empty list, so `active` never resolved and the whole
  // app mis-scoped to the WTC 2026 / Team Denmark default.
  useEffect(() => {
    if (isAdmin) return subscribeToRegistry(setTournaments);
    if (user?.uid) return subscribeToMyTournaments(user.uid, setTournaments);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTournaments([]);
  }, [isAdmin, user?.uid]);

  const setActive = (id: string) => {
    setActiveId(id);
    try { localStorage.setItem(KEY, id); } catch {}
  };

  const active = useMemo(
    () =>
      tournaments.find((t) => t.id === activeId) ??
      tournaments.find((t) => t.id === WTC_2026.id) ??
      tournaments[0] ?? // a non-Denmark user defaults to their own first tournament
      null,
    [tournaments, activeId]
  );

  const value = useMemo<ActiveTournament>(
    () => ({
      tournaments,
      active,
      activeId: active?.id ?? activeId,
      activeSlug: active?.dataSlug ?? WTC_2026.dataSlug,
      activeFieldSlug: active?.fieldSlug,
      setActive,
    }),
    [tournaments, active, activeId]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Safe outside the provider (SSR, isolated tests): resolves to WTC 2026.
export function useActiveTournament(): ActiveTournament {
  return (
    useContext(Ctx) ?? {
      tournaments: [],
      active: null,
      activeId: WTC_2026.id,
      activeSlug: WTC_2026.dataSlug,
      setActive: () => {},
    }
  );
}
