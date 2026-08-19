"use client";

// Membership + admin + claim primitives — the denormalized index the DB rules
// check to enforce HARD per-tournament isolation. Nothing here is the source of
// truth; membership is DERIVED from rosters (a slot's playerId) + player
// bindings (a Player's authUid). `recomputeMembership()` rebuilds the index from
// that truth and is safe to run any time.
//
// Index nodes (all admin-write; clients never read them directly — rule
// `root.child()` lookups bypass read rules):
//   tournaments/_admins/{uid}        -> true      (admin allowlist)
//   tournaments/_members/{nodeKey}/{uid} -> true  (per-tournament / per-estimate-node)
//   tournaments/_teamMembers/{uid}   -> true      (bound member of ANY tournament)
//   tournaments/_claims/{uid}        -> claim     (self-write, admin-read)
//
// A Firebase uid's email is NEVER stored outside a transient claim; the bound
// Player entity keeps only a display name + authUid.

import { ref, get, set, update, onValue, off } from "firebase/database";
import { getDb, authReady } from "./firebase";
import type { Player } from "./players";
import type { TournamentMeta } from "./tournaments-registry";
import type { TournamentDoc } from "./tournament-db";

const ADMINS = "tournaments/_admins";
const MY_TOURNAMENTS = "tournaments/_myTournaments";
const CLAIMS = "tournaments/_claims";
const REGISTRY = "tournaments/_registry";
const PLAYERS = "tournaments/_players";

export interface Claim {
  uid: string;
  displayName: string;
  email: string;
  requestedPlayerName?: string;
  createdAt: number;
}

// The estimate-layer node keys a tournament's dataSlug fans out into. The
// `estimates/$node` wildcard rule gates each of these, so membership has to be
// written for every variant (RTDB rules can't strip suffixes). Kept in sync
// with the sibling node names in estimates-db.ts.
const ESTIMATE_SUFFIXES = ["", "-versioner", "-arketype-bank", "-lists-raw", "-sanity-ok"];

function nodeKeysForSlug(dataSlug: string): string[] {
  // The tournament doc node (tournaments/{slug}) and every estimate sibling
  // share the same dataSlug key space, so one membership set covers them all.
  return ESTIMATE_SUFFIXES.map((suffix) => dataSlug + suffix);
}

// --- Admin -----------------------------------------------------------------

export async function isAdminUid(uid: string): Promise<boolean> {
  await authReady();
  return (await get(ref(getDb(), `${ADMINS}/${uid}`))).exists();
}

export function subscribeToIsAdmin(
  uid: string | null,
  callback: (isAdmin: boolean) => void
): () => void {
  if (!uid) {
    callback(false);
    return () => {};
  }
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  authReady().then(() => {
    if (cancelled) return;
    const r = ref(getDb(), `${ADMINS}/${uid}`);
    onValue(
      r,
      (snap) => callback(snap.exists()),
      () => callback(false) // permission-denied while unbound -> not admin
    );
    cleanup = () => off(r);
  });
  return () => {
    cancelled = true;
    cleanup?.();
  };
}

// --- Claims ----------------------------------------------------------------

// A signed-in but unbound user records who they are so an admin can bind them.
// Writes ONLY the caller's own claim (rule: $uid === auth.uid). The email is
// transient here (deleted on approval) so an admin can match the person.
export async function submitClaim(claim: Omit<Claim, "createdAt">): Promise<void> {
  await authReady();
  await set(ref(getDb(), `${CLAIMS}/${claim.uid}`), {
    ...claim,
    createdAt: Date.now(),
  });
}

export function subscribeToClaims(callback: (claims: Claim[]) => void): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  authReady().then(() => {
    if (cancelled) return;
    const r = ref(getDb(), CLAIMS);
    onValue(
      r,
      (snap) => {
        const val = (snap.val() as Record<string, Claim>) || {};
        callback(Object.values(val).sort((a, b) => a.createdAt - b.createdAt));
      },
      () => callback([]) // non-admins can't read claims
    );
    cleanup = () => off(r);
  });
  return () => {
    cancelled = true;
    cleanup?.();
  };
}

export async function deleteClaim(uid: string): Promise<void> {
  await authReady();
  await set(ref(getDb(), `${CLAIMS}/${uid}`), null);
}

// --- Binding + recompute ---------------------------------------------------

// Admin action: bind a Firebase uid to a Player, drop the claim, and refresh
// the membership index so the new binding takes effect immediately.
export async function bindPlayer(uid: string, playerId: string): Promise<void> {
  await authReady();
  await update(ref(getDb(), `${PLAYERS}/${playerId}`), { authUid: uid });
  await deleteClaim(uid);
  await recomputeMembership();
}

export async function unbindPlayer(playerId: string): Promise<void> {
  await authReady();
  await update(ref(getDb(), `${PLAYERS}/${playerId}`), { authUid: null });
  await recomputeMembership();
}

// Rebuild _members + _teamMembers from the source of truth (registry rosters +
// player bindings). Idempotent — replaces the whole index. Admin-write only, so
// this runs in an admin context (roster edits / tournament creation / binding).
export async function recomputeMembership(): Promise<void> {
  await authReady();
  const db = getDb();

  const [registrySnap, playersSnap] = await Promise.all([
    get(ref(db, REGISTRY)),
    get(ref(db, PLAYERS)),
  ]);

  const registry = (registrySnap.val() as Record<string, TournamentMeta>) || {};
  const players = (playersSnap.val() as Record<string, Player>) || {};

  // playerId -> bound authUid (only players that have signed in + been bound)
  const uidByPlayer = new Map<string, string>();
  for (const p of Object.values(players)) {
    if (p.authUid) uidByPlayer.set(p.id, p.authUid);
  }

  const members: Record<string, Record<string, true>> = {};
  const teamMembers: Record<string, true> = {};
  // uid -> { tournamentId: true } so a member can list ONLY their tournaments
  // (they can't read the whole registry under hard isolation).
  const myTournaments: Record<string, Record<string, true>> = {};

  await Promise.all(
    Object.values(registry).map(async (meta) => {
      const docSnap = await get(ref(db, `tournaments/${meta.dataSlug}`));
      const doc = docSnap.val() as TournamentDoc | null;
      const armies = doc?.roster?.armies || [];

      const uids = new Set<string>();
      for (const army of armies) {
        const uid = army.playerId ? uidByPlayer.get(army.playerId) : undefined;
        if (uid) uids.add(uid);
      }

      for (const uid of uids) {
        teamMembers[uid] = true;
        myTournaments[uid] = myTournaments[uid] || {};
        myTournaments[uid][meta.id] = true;
      }
      for (const nodeKey of nodeKeysForSlug(meta.dataSlug)) {
        members[nodeKey] = members[nodeKey] || {};
        for (const uid of uids) members[nodeKey][uid] = true;
      }
    })
  );

  // Single overwrite of each index subtree keeps it exactly in sync with truth.
  await update(ref(db, "tournaments"), {
    _members: members,
    _teamMembers: teamMembers,
    _myTournaments: myTournaments,
  });
}

// The tournaments a signed-in member can see — their own only. Reads the
// per-user index (`_myTournaments/{uid}`, self-readable) then pulls each
// registry entry the rules allow. Admins should use subscribeToRegistry instead
// (they can read the whole registry).
export function subscribeToMyTournaments(
  uid: string,
  callback: (tournaments: TournamentMeta[]) => void
): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  authReady().then(() => {
    if (cancelled) return;
    const r = ref(getDb(), `${MY_TOURNAMENTS}/${uid}`);
    onValue(
      r,
      async (snap) => {
        const ids = Object.keys((snap.val() as Record<string, true>) || {});
        const metas = await Promise.all(
          ids.map(async (id) => {
            try {
              return (await get(ref(getDb(), `${REGISTRY}/${id}`))).val() as TournamentMeta | null;
            } catch {
              return null;
            }
          })
        );
        if (cancelled) return;
        callback(
          metas
            .filter((m): m is TournamentMeta => m !== null)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        );
      },
      () => callback([])
    );
    cleanup = () => off(r);
  });
  return () => {
    cancelled = true;
    cleanup?.();
  };
}

// Which tournaments a player is rostered in — powers the "only my tournaments"
// index filter. Reads rosters directly (client-visible via membership once
// bound); admins see everything so callers can skip this for them.
export async function tournamentIdsForPlayer(playerId: string): Promise<Set<string>> {
  await authReady();
  const db = getDb();
  const registry = ((await get(ref(db, REGISTRY))).val() as Record<string, TournamentMeta>) || {};
  const ids = new Set<string>();
  await Promise.all(
    Object.values(registry).map(async (meta) => {
      const doc = (await get(ref(db, `tournaments/${meta.dataSlug}`))).val() as TournamentDoc | null;
      const armies = doc?.roster?.armies || [];
      if (armies.some((a) => a.playerId === playerId)) ids.add(meta.id);
    })
  );
  return ids;
}
