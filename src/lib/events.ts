"use client";

// Events — the layer ABOVE a team's prep. An Event is the actual tournament
// several teams attend (WTC 2027, a local team event, …). It owns the SHARED
// opponent field (the lists everyone preps against) and groups multiple
// team-CAMPS, each of which is one team's isolated prep (roster/estimates/
// coaching), i.e. a TournamentMeta with `eventId` set.
//
// Data:
//   tournaments/_events/{id}                    EventMeta
//   tournaments/_myEvents/{uid}/{id} = true     events a user organizes or has a camp in
//   tournaments/_owners/{fieldSlug}/{uid}       the organizer (write access to the field)
//   tournaments/_members/{fieldSlug}/{uid}      every event member (read access; set by recompute)
//   estimates/_fields/{fieldSlug}               the shared field: OpponentTeams (+ a `_raw` child)
//
// The shared field reuses the exact "shared lists + per-camp estimate graft"
// pattern the archetype library already uses (see estimates-db subscribeToOpponents).
// A camp's estimate cells never leave its own node, so teams stay isolated.

import { ref, get, set, update, onValue, off } from "firebase/database";
import { getDb, authReady, currentUser } from "./firebase";
import {
  addTournament,
  updateTournament,
  stripUndefined,
  type TournamentMeta,
  type TournamentStatus,
} from "./tournaments-registry";

export interface EventMeta {
  id: string; // stable id + URL, e.g. "wtc-2027"
  name: string; // display name
  fieldSlug: string; // estimates/_fields/{fieldSlug} — the shared field. == id by convention.
  teamSize?: number; // default team size for camps registering under it
  format?: string; // free text, e.g. "WTC · 7 runder"
  rounds?: number;
  startDate?: string | null; // ISO date (YYYY-MM-DD)
  endDate?: string | null; // ISO date; absent/equal to start = single-day event
  status: TournamentStatus;
  createdAt: number;
  organizerUid?: string; // who created it (owns the field; may edit the event)
}

const EVENTS = "tournaments/_events";
const MY_EVENTS = "tournaments/_myEvents";
const OWNERS = "tournaments/_owners";
const REGISTRY = "tournaments/_registry";

export const slugifyId = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Create an event. The signed-in user becomes its organizer: they own the field
// node (write access) and see it in their event index. No camp is created yet —
// teams (incl. the organizer's own) register separately.
export async function addEvent(meta: Omit<EventMeta, "createdAt" | "fieldSlug"> & { fieldSlug?: string }): Promise<void> {
  await authReady();
  const uid = currentUser()?.uid;
  const fieldSlug = meta.fieldSlug || meta.id;
  const entry = stripUndefined({ ...meta, fieldSlug, organizerUid: uid, createdAt: Date.now() }) as EventMeta;
  const updates: Record<string, unknown> = { [`${EVENTS}/${meta.id}`]: entry };
  if (uid) {
    updates[`${OWNERS}/${fieldSlug}/${uid}`] = true; // organizer can write the field
    updates[`${MY_EVENTS}/${uid}/${meta.id}`] = true;
  }
  await update(ref(getDb()), updates);
}

export async function getEvent(id: string): Promise<EventMeta | null> {
  await authReady();
  const snap = await get(ref(getDb(), `${EVENTS}/${id}`));
  return snap.exists() ? (snap.val() as EventMeta) : null;
}

export async function updateEvent(id: string, patch: Partial<EventMeta>): Promise<void> {
  await authReady();
  await update(ref(getDb(), `${EVENTS}/${id}`), stripUndefined(patch as Record<string, unknown>));
}

// Register a team (a new camp) under an existing event. The signed-in user
// becomes the camp's captain; the camp points at the event's shared field. A
// later recompute grants everyone on the camp read access to that field.
export async function registerTeamForEvent(opts: {
  eventId: string;
  campId: string; // becomes the camp's registry id AND dataSlug
  teamName: string;
  teamSize?: number;
}): Promise<void> {
  await authReady();
  const ev = await getEvent(opts.eventId);
  if (!ev) throw new Error("event not found");
  const uid = currentUser()?.uid;
  await addTournament({
    id: opts.campId,
    name: `${ev.name} — ${opts.teamName}`,
    dataSlug: opts.campId,
    teamName: opts.teamName,
    teamSize: opts.teamSize ?? ev.teamSize ?? 8,
    format: ev.format,
    rounds: ev.rounds,
    status: ev.status,
    eventId: opts.eventId,
    fieldSlug: ev.fieldSlug,
  });
  // Let the captain see the event they just joined (register another team, etc.).
  if (uid) await update(ref(getDb()), { [`${MY_EVENTS}/${uid}/${opts.eventId}`]: true });
}

// Admin: convert an existing single-team camp into an event in place. The camp
// becomes team 1 under the new event; its country lists are copied to the shared
// field node (estimates stripped — those stay private to the camp). Requires the
// `_fields` DB rule to be published first.
export async function convertCampToEvent(opts: {
  camp: TournamentMeta; // the existing camp (from the registry list)
  eventName: string;
  eventId?: string;
}): Promise<void> {
  await authReady();
  const db = getDb();
  const camp = opts.camp;
  const campSlug = camp.dataSlug;
  // The event id / field slug MUST differ from the camp's own dataSlug — the
  // shared-field merge is gated on `fieldSlug !== campSlug`, and they'd otherwise
  // collide on the same estimate/owner/member keys. "Dukkelogen teams" -> camp
  // "dukkelogen-teams" -> event "dukkelogen-teams-event".
  let eventId = opts.eventId || slugifyId(opts.eventName);
  if (eventId === campSlug || eventId === camp.id) eventId = `${eventId}-event`;
  const fieldSlug = eventId;

  // Create the event (this user is organizer / field owner).
  await addEvent({
    id: eventId,
    name: opts.eventName,
    fieldSlug,
    teamSize: camp.teamSize,
    format: camp.format,
    rounds: camp.rounds,
    status: camp.status,
  });

  // Copy the camp's country lists to the shared field, WITHOUT estimates.
  const est = (await get(ref(db, `estimates/${campSlug}`))).val() as Record<string, unknown> | null;
  if (est) {
    const fieldUpdates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(est)) {
      if (k.startsWith("_")) continue;
      const team = v as { name?: string; armies?: unknown };
      if (team && team.name && team.armies) {
        const { estimates, ...listsOnly } = team as { estimates?: unknown };
        void estimates;
        fieldUpdates[`estimates/_fields/${fieldSlug}/${k}`] = listsOnly;
      }
    }
    if (Object.keys(fieldUpdates).length) await update(ref(db), fieldUpdates);
  }

  // Copy any verbatim raw lists into the field node's `_raw` child.
  const raw = (await get(ref(db, `estimates/${campSlug}-lists-raw`))).val();
  if (raw) await set(ref(db, `estimates/_fields/${fieldSlug}/_raw`), raw);

  // Point the camp at the event + field (registry keyed by the camp's id).
  await updateTournament(camp.id, { eventId, fieldSlug } as Partial<TournamentMeta>);
}

// The events a user organizes or has a camp in — reads the self-index then each
// event entry the rules allow.
export function subscribeToMyEvents(uid: string, callback: (events: EventMeta[]) => void): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  authReady().then(() => {
    if (cancelled) return;
    const r = ref(getDb(), `${MY_EVENTS}/${uid}`);
    onValue(
      r,
      async (snap) => {
        const ids = Object.keys((snap.val() as Record<string, true>) || {});
        const metas = await Promise.all(
          ids.map(async (id) => {
            try {
              return (await get(ref(getDb(), `${EVENTS}/${id}`))).val() as EventMeta | null;
            } catch {
              return null;
            }
          })
        );
        if (cancelled) return;
        callback(
          metas.filter((m): m is EventMeta => m !== null).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
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

// Admin: the whole events registry.
export function subscribeToEvents(callback: (events: EventMeta[]) => void): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  authReady().then(() => {
    if (cancelled) return;
    const r = ref(getDb(), EVENTS);
    onValue(
      r,
      (snap) => {
        const val = (snap.val() as Record<string, EventMeta>) || {};
        callback(Object.values(val).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
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

// The camps registered under an event — reads the registry (admin) or is passed
// a pre-filtered list. Returns camps whose eventId matches.
export function campsForEvent(all: TournamentMeta[], eventId: string): TournamentMeta[] {
  return all.filter((t) => t.eventId === eventId);
}
