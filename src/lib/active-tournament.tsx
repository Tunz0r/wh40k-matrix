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

const KEY = "wtc-active-tournament";

interface ActiveTournament {
  tournaments: TournamentMeta[];
  active: TournamentMeta | null;
  activeId: string;
  activeSlug: string; // dataSlug of the active tournament
  setActive: (id: string) => void;
}

const Ctx = createContext<ActiveTournament | null>(null);

export function ActiveTournamentProvider({ children }: { children: ReactNode }) {
  const [tournaments, setTournaments] = useState<TournamentMeta[]>([]);
  const [activeId, setActiveId] = useState<string>(WTC_2026.id);

  useEffect(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    // Render the default first (avoids an SSR/client hydration mismatch), then
    // hydrate the saved choice on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setActiveId(saved);
    ensureRegistry().catch(() => {});
    return subscribeToRegistry(setTournaments);
  }, []);

  const setActive = (id: string) => {
    setActiveId(id);
    try { localStorage.setItem(KEY, id); } catch {}
  };

  const active = useMemo(
    () =>
      tournaments.find((t) => t.id === activeId) ??
      tournaments.find((t) => t.id === WTC_2026.id) ??
      null,
    [tournaments, activeId]
  );

  const value = useMemo<ActiveTournament>(
    () => ({
      tournaments,
      active,
      activeId: active?.id ?? activeId,
      activeSlug: active?.dataSlug ?? WTC_2026.dataSlug,
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
