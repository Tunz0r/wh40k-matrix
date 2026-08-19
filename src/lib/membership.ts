"use client";

// Membership + roles + users registry — the denormalized index the DB rules
// check to enforce HARD per-tournament isolation and segregation of duties.
// Nothing here except the source-of-truth nodes is authoritative; the derived
// index is rebuilt from truth by `recomputeMembership()`, safe to run any time.
//
// Sources of truth (rules read these):
//   tournaments/_admins/{uid}: true              admin allowlist
//   tournaments/_players/{playerId}.authUid      player binding (membership from roster playerIds)
//   tournaments/_coaches/{uid}/{tournamentId}    per-tournament coach assignment
// Derived index (admin-write; clients never read directly — rule root.child()
// lookups bypass read rules):
//   tournaments/_members/{nodeKey}/{uid}         per-tournament / per-estimate-node access
//   tournaments/_teamMembers/{uid}               bound member of ANY tournament
//   tournaments/_myTournaments/{uid}/{id}        the tournaments a user may list
//   tournaments/_profileOwners/{dataSlug}/a{idx} = authUid  SoD: who may write that profile
// Registry of logins (admin-read, self-write):
//   tournaments/_users/{uid} = {displayName, note?, lastSeen}
//
// A Firebase uid's email is NEVER stored in the RTDB — only a display name.

import { ref, get, set, update, onValue, off } from "firebase/database";
import { getDb, authReady } from "./firebase";
import type { Player } from "./players";
import type { TournamentMeta } from "./tournaments-registry";
import type { TournamentDoc } from "./tournament-db";

const ADMINS = "tournaments/_admins";
const COACHES = "tournaments/_coaches";
const MY_TOURNAMENTS = "tournaments/_myTournaments";
const USERS = "tournaments/_users";
const REGISTRY = "tournaments/_registry";
const PLAYERS = "tournaments/_players";

// A signed-in login, as shown in the admin users list. Display name only —
// never the email (that lives in Firebase Auth).
export interface AppUser {
  uid: string;
  displayName?: string;
  note?: string; // optional free-text the pending user leaves for the admin
  lastSeen?: number;
}

export type CoachMap = Record<string, Record<string, true>>; // uid -> {tournamentId: true}

// The estimate-layer node keys a tournament's dataSlug fans out into. The
// `estimates/$node` wildcard rule gates each of these, so membership has to be
// written for every variant (RTDB rules can't strip suffixes). Kept in sync
// with the sibling node names in estimates-db.ts.
const ESTIMATE_SUFFIXES = ["", "-versioner", "-arketype-bank", "-lists-raw", "-sanity-ok"];

function nodeKeysForSlug(dataSlug: string): string[] {
  return ESTIMATE_SUFFIXES.map((suffix) => dataSlug + suffix);
}

// --- Users registry --------------------------------------------------------

// Called on every (non-anonymous) sign-in: record/refresh the caller's own row
// so the admin can see who has logged in. Merges, preserving any note. Never
// writes email.
export async function upsertSelfUser(
  uid: string,
  displayName: string | null | undefined
): Promise<void> {
  await authReady();
  await update(ref(getDb(), `${USERS}/${uid}`), {
    displayName: displayName || "",
    lastSeen: Date.now(),
  });
}

// A pending user leaves a note for the admin (e.g. "I'm Simon O"). Self-write.
export async function setUserNote(uid: string, note: string): Promise<void> {
  await authReady();
  await update(ref(getDb(), `${USERS}/${uid}`), { note });
}

export function subscribeToUsers(callback: (users: AppUser[]) => void): () => void {
  return adminSubscribe(USERS, (val) => {
    const rec = (val as Record<string, Omit<AppUser, "uid">>) || {};
    callback(
      Object.entries(rec)
        .map(([uid, u]) => ({ uid, ...u }))
        .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
    );
  });
}

// --- Roles: admin + coach --------------------------------------------------

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

export async function setAdmin(uid: string, on: boolean): Promise<void> {
  await authReady();
  await set(ref(getDb(), `${ADMINS}/${uid}`), on ? true : null);
}

export function subscribeToAdmins(callback: (uids: Set<string>) => void): () => void {
  return adminSubscribe(ADMINS, (val) =>
    callback(new Set(Object.keys((val as Record<string, true>) || {})))
  );
}

export function subscribeToCoaches(callback: (coaches: CoachMap) => void): () => void {
  return adminSubscribe(COACHES, (val) => callback((val as CoachMap) || {}));
}

// Assign/unassign a coach to one tournament, then refresh the index so it takes
// effect immediately.
export async function assignCoach(
  uid: string,
  tournamentId: string,
  on: boolean
): Promise<void> {
  await authReady();
  await set(ref(getDb(), `${COACHES}/${uid}/${tournamentId}`), on ? true : null);
  await recomputeMembership();
}

// --- Binding + revoke ------------------------------------------------------

// Admin action: bind a Firebase uid to a Player, then refresh the index. If the
// player was bound to a different uid, this overwrites it (re-bind).
export async function bindPlayer(uid: string, playerId: string): Promise<void> {
  await authReady();
  await update(ref(getDb(), `${PLAYERS}/${playerId}`), { authUid: uid });
  await recomputeMembership();
}

export async function unbindPlayer(playerId: string): Promise<void> {
  await authReady();
  await update(ref(getDb(), `${PLAYERS}/${playerId}`), { authUid: null });
  await recomputeMembership();
}

// Strip a uid of all access: remove admin + coach assignments + any player
// binding, then recompute. The _users row is kept (they still show as pending).
export async function revokeAccess(uid: string): Promise<void> {
  await authReady();
  const db = getDb();
  await set(ref(db, `${ADMINS}/${uid}`), null);
  await set(ref(db, `${COACHES}/${uid}`), null);
  const players = ((await get(ref(db, PLAYERS))).val() as Record<string, Player>) || {};
  await Promise.all(
    Object.values(players)
      .filter((p) => p.authUid === uid)
      .map((p) => update(ref(db, `${PLAYERS}/${p.id}`), { authUid: null }))
  );
  await recomputeMembership();
}

// --- Recompute the derived index -------------------------------------------

// Rebuild _members/_teamMembers/_myTournaments/_profileOwners from truth
// (rosters + player bindings + coach assignments). Idempotent — replaces each
// subtree. Admin-write only, so this runs in an admin context.
export async function recomputeMembership(): Promise<void> {
  await authReady();
  const db = getDb();

  const [registrySnap, playersSnap, coachesSnap] = await Promise.all([
    get(ref(db, REGISTRY)),
    get(ref(db, PLAYERS)),
    get(ref(db, COACHES)),
  ]);

  const registry = (registrySnap.val() as Record<string, TournamentMeta>) || {};
  const players = (playersSnap.val() as Record<string, Player>) || {};
  const coaches = (coachesSnap.val() as CoachMap) || {};

  const uidByPlayer = new Map<string, string>();
  for (const p of Object.values(players)) if (p.authUid) uidByPlayer.set(p.id, p.authUid);

  // tournamentId -> coach uids assigned to it
  const coachUidsByTournament = new Map<string, Set<string>>();
  for (const [uid, assigned] of Object.entries(coaches)) {
    for (const tid of Object.keys(assigned || {})) {
      if (!coachUidsByTournament.has(tid)) coachUidsByTournament.set(tid, new Set());
      coachUidsByTournament.get(tid)!.add(uid);
    }
  }

  const members: Record<string, Record<string, true>> = {};
  const teamMembers: Record<string, true> = {};
  const myTournaments: Record<string, Record<string, true>> = {};
  const profileOwners: Record<string, Record<string, string>> = {};

  const grant = (uid: string, meta: TournamentMeta) => {
    teamMembers[uid] = true;
    myTournaments[uid] = myTournaments[uid] || {};
    myTournaments[uid][meta.id] = true;
    for (const nodeKey of nodeKeysForSlug(meta.dataSlug)) {
      members[nodeKey] = members[nodeKey] || {};
      members[nodeKey][uid] = true;
    }
  };

  await Promise.all(
    Object.values(registry).map(async (meta) => {
      const doc = (await get(ref(db, `tournaments/${meta.dataSlug}`))).val() as TournamentDoc | null;
      const armies = doc?.roster?.armies || [];

      // Rostered players
      armies.forEach((army, idx) => {
        const uid = army.playerId ? uidByPlayer.get(army.playerId) : undefined;
        if (!uid) return;
        grant(uid, meta);
        profileOwners[meta.dataSlug] = profileOwners[meta.dataSlug] || {};
        profileOwners[meta.dataSlug][`a${idx}`] = uid;
      });

      // Coaches assigned to this tournament
      for (const uid of coachUidsByTournament.get(meta.id) || []) grant(uid, meta);
    })
  );

  await update(ref(db, "tournaments"), {
    _members: members,
    _teamMembers: teamMembers,
    _myTournaments: myTournaments,
    _profileOwners: profileOwners,
  });
}

// --- Access + tournament listing (client, self-readable) -------------------

// Whether the signed-in user has been granted access to anything (player OR
// coach) — reads their own _myTournaments row. Admins are handled separately.
export function subscribeToHasAccess(
  uid: string | null,
  callback: (hasAccess: boolean) => void
): () => void {
  if (!uid) {
    callback(false);
    return () => {};
  }
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  authReady().then(() => {
    if (cancelled) return;
    const r = ref(getDb(), `${MY_TOURNAMENTS}/${uid}`);
    onValue(
      r,
      (snap) => callback(snap.exists()),
      () => callback(false)
    );
    cleanup = () => off(r);
  });
  return () => {
    cancelled = true;
    cleanup?.();
  };
}

// The tournaments a signed-in member can see — their own only. Reads the
// per-user index (self-readable) then pulls each registry entry the rules allow.
// Admins should use subscribeToRegistry instead (they can read the whole thing).
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

// --- helpers ---------------------------------------------------------------

// Subscribe to an admin-only node, tolerating the permission-denied a non-admin
// hits (returns null value so the callback can render "nothing").
function adminSubscribe(path: string, onVal: (val: unknown) => void): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  authReady().then(() => {
    if (cancelled) return;
    const r = ref(getDb(), path);
    onValue(
      r,
      (snap) => onVal(snap.val()),
      () => onVal(null)
    );
    cleanup = () => off(r);
  });
  return () => {
    cancelled = true;
    cleanup?.();
  };
}
