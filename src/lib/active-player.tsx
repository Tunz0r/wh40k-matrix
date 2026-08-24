"use client";

// The current identity is now PER-TOURNAMENT: you are whichever roster slot in
// the ACTIVE tournament you've claimed (roster.armies[i].claimedByUid === your
// uid). No global player pool. Owners/admins can "act as" any slot via an
// override. Back-compat shims (activePlayer / activePlayerId / players, with ids
// "a{idx}") keep existing consumers working.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { subscribeToIsAdmin, subscribeToHasAccess, subscribeToIsOwner, recomputeMembership } from "./membership";
import { subscribeToRoster } from "./tournament-db";
import { useActiveTournament } from "./active-tournament";
import { useAuth } from "./auth";

interface Slot {
  idx: number;
  name: string;
  claimedByUid?: string;
}

interface ActivePlayerCtx {
  slots: Slot[];
  myArmyIdx: number | null; // the slot I've claimed in the active tournament
  effectiveIdx: number | null; // my slot, or the owner/admin "act as" override
  isAdmin: boolean; // global super-admin
  isOwner: boolean; // owner (captain) of the active tournament
  canManage: boolean; // isAdmin || isOwner
  access: boolean;
  setOverrideIdx: (i: number | null) => void;
  // --- back-compat shims (ids are "a{idx}") ---
  players: { id: string; name: string }[];
  activePlayerId: string | null;
  activePlayer: { id: string; name: string } | null;
  setActivePlayer: (id: string | null) => void;
}

const Ctx = createContext<ActivePlayerCtx | null>(null);

export function ActivePlayerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { activeSlug } = useActiveTournament();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [hasGrant, setHasGrant] = useState(false);
  const [overrideIdx, setOverrideIdx] = useState<number | null>(null);

  useEffect(() => subscribeToIsAdmin(user?.uid ?? null, setIsAdmin), [user?.uid]);
  useEffect(() => subscribeToHasAccess(user?.uid ?? null, setHasGrant), [user?.uid]);
  useEffect(() => subscribeToIsOwner(activeSlug, user?.uid ?? null, setIsOwner), [activeSlug, user?.uid]);

  // Keep the derived membership index fresh automatically — the super-admin no
  // longer has to click "Genberegn". Runs best-effort in the background when a
  // super-admin opens the app, throttled so rapid reloads don't hammer it.
  useEffect(() => {
    if (!isAdmin) return;
    try {
      const last = Number(localStorage.getItem("wtc-last-recompute") || 0);
      if (Date.now() - last < 120000) return;
      localStorage.setItem("wtc-last-recompute", String(Date.now()));
    } catch { /* localStorage unavailable — recompute anyway */ }
    recomputeMembership().catch(() => {});
  }, [isAdmin]);

  // The active tournament's roster slots.
  useEffect(() => {
    setOverrideIdx(null); // an override is tournament-specific
    return subscribeToRoster(activeSlug, (roster) => {
      const armies = roster?.armies || [];
      setSlots(armies.map((a, idx) => ({ idx, name: a.player?.trim() || `Plads ${idx + 1}`, claimedByUid: a.claimedByUid })));
    });
  }, [activeSlug]);

  const canManage = isAdmin || isOwner;

  const myArmyIdx = useMemo(
    () => (user ? slots.find((s) => s.claimedByUid === user.uid)?.idx ?? null : null),
    [slots, user]
  );

  const effectiveIdx = canManage && overrideIdx !== null ? overrideIdx : myArmyIdx;

  const setActivePlayer = (id: string | null) => {
    if (!canManage) return;
    setOverrideIdx(id ? parseInt(id.slice(1), 10) : null);
  };

  const value = useMemo<ActivePlayerCtx>(() => {
    const players = slots.map((s) => ({ id: `a${s.idx}`, name: s.name }));
    const activePlayer = effectiveIdx !== null ? players.find((p) => p.id === `a${effectiveIdx}`) ?? null : null;
    return {
      slots,
      myArmyIdx,
      effectiveIdx,
      isAdmin,
      isOwner,
      canManage,
      access: isAdmin || hasGrant || myArmyIdx !== null,
      setOverrideIdx: (i) => canManage && setOverrideIdx(i),
      players,
      activePlayerId: effectiveIdx !== null ? `a${effectiveIdx}` : null,
      activePlayer,
      setActivePlayer,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, myArmyIdx, effectiveIdx, isAdmin, isOwner, canManage, hasGrant]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActivePlayer(): ActivePlayerCtx {
  return (
    useContext(Ctx) ?? {
      slots: [],
      myArmyIdx: null,
      effectiveIdx: null,
      isAdmin: false,
      isOwner: false,
      canManage: false,
      access: false,
      setOverrideIdx: () => {},
      players: [],
      activePlayerId: null,
      activePlayer: null,
      setActivePlayer: () => {},
    }
  );
}
