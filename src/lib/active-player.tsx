"use client";

// The current identity. Pre-login this is a local "who are you" pick; when real
// auth lands, resolve the active player from the signed-in user's authUid
// instead of localStorage and nothing downstream changes — pages already read
// `activePlayer`.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { subscribeToPlayers, type Player } from "./players";

const KEY = "wtc-active-player";

interface ActivePlayerCtx {
  players: Player[];
  activePlayer: Player | null;
  activePlayerId: string | null;
  setActivePlayer: (id: string | null) => void;
}

const Ctx = createContext<ActivePlayerCtx | null>(null);

export function ActivePlayerProvider({ children }: { children: ReactNode }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [activePlayerId, setId] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setId(saved);
    return subscribeToPlayers(setPlayers);
  }, []);

  const setActivePlayer = (id: string | null) => {
    setId(id);
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {}
  };

  const activePlayer = useMemo(
    () => players.find((p) => p.id === activePlayerId) ?? null,
    [players, activePlayerId]
  );

  const value = useMemo<ActivePlayerCtx>(
    () => ({ players, activePlayer, activePlayerId, setActivePlayer }),
    [players, activePlayer, activePlayerId]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActivePlayer(): ActivePlayerCtx {
  return (
    useContext(Ctx) ?? {
      players: [],
      activePlayer: null,
      activePlayerId: null,
      setActivePlayer: () => {},
    }
  );
}
