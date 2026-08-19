"use client";

// The current identity, resolved from the signed-in Firebase user: the active
// player is the Player whose `authUid` matches the user's uid. Pages read
// `activePlayer` and nothing downstream changed when real auth landed.
//
// Admins keep a localStorage override (the old "who are you" pick) so a captain
// can act as any player during coaching/testing; for a normal player identity
// is fixed by their login and `setActivePlayer` is a no-op.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { subscribeToPlayers, type Player } from "./players";
import { subscribeToIsAdmin } from "./membership";
import { useAuth } from "./auth";

const KEY = "wtc-active-player"; // admin-only override

interface ActivePlayerCtx {
  players: Player[];
  activePlayer: Player | null;
  activePlayerId: string | null;
  isAdmin: boolean;
  bound: boolean; // a Player matched the signed-in uid
  setActivePlayer: (id: string | null) => void; // admin override only
}

const Ctx = createContext<ActivePlayerCtx | null>(null);

export function ActivePlayerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [overrideId, setOverrideId] = useState<string | null>(null);

  useEffect(() => subscribeToPlayers(setPlayers), []);
  useEffect(() => subscribeToIsAdmin(user?.uid ?? null, setIsAdmin), [user?.uid]);

  useEffect(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setOverrideId(saved);
  }, []);

  const setActivePlayer = (id: string | null) => {
    if (!isAdmin) return; // identity is fixed by login for normal players
    setOverrideId(id);
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {}
  };

  // The player bound to this login.
  const boundPlayer = useMemo(
    () => (user ? players.find((p) => p.authUid === user.uid) ?? null : null),
    [players, user]
  );

  // Admins may override; everyone else is their bound player.
  const activePlayer = useMemo(() => {
    if (isAdmin && overrideId) {
      return players.find((p) => p.id === overrideId) ?? boundPlayer;
    }
    return boundPlayer;
  }, [isAdmin, overrideId, players, boundPlayer]);

  const value = useMemo<ActivePlayerCtx>(
    () => ({
      players,
      activePlayer,
      activePlayerId: activePlayer?.id ?? null,
      isAdmin,
      bound: boundPlayer !== null,
      setActivePlayer,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [players, activePlayer, isAdmin, boundPlayer]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActivePlayer(): ActivePlayerCtx {
  return (
    useContext(Ctx) ?? {
      players: [],
      activePlayer: null,
      activePlayerId: null,
      isAdmin: false,
      bound: false,
      setActivePlayer: () => {},
    }
  );
}
