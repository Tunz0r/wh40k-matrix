// Player entity — a person on the team, independent of any one tournament.
// Roster slots link to a player via `playerId`; "my stuff" is resolved from the
// active player's identity. Today the active player is chosen locally (a "who
// are you" picker); the `authUid` field is the seam for real login — once a user
// signs in, look their player up by authUid instead of the local pick, and
// everything downstream (profile, warmups, results) already keys off the player.
//
// Lives under the write-allowed `tournaments` node (DB rules only open
// sessions/tournaments/estimates); "_players" can't collide with a real
// tournament slug ("_" prefix).

import { ref, set, get, update, remove, onValue, off, push } from "firebase/database";
import { getDb, authReady } from "./firebase";

export interface Player {
  id: string;
  name: string;
  createdAt: number;
  authUid?: string; // set when a login is bound to this player (future)
}

const PLAYERS = "tournaments/_players";

export function subscribeToPlayers(callback: (players: Player[]) => void): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  authReady().then(() => {
    if (cancelled) return;
    const r = ref(getDb(), PLAYERS);
    onValue(r, (snap) => {
      const val = (snap.val() as Record<string, Player>) || {};
      callback(Object.values(val).sort((a, b) => a.name.localeCompare(b.name, "da")));
    });
    cleanup = () => off(r);
  });
  return () => { cancelled = true; cleanup?.(); };
}

export async function getPlayers(): Promise<Player[]> {
  await authReady();
  const snap = await get(ref(getDb(), PLAYERS));
  const val = (snap.val() as Record<string, Player>) || {};
  return Object.values(val).sort((a, b) => a.name.localeCompare(b.name, "da"));
}

export async function addPlayer(name: string): Promise<Player> {
  await authReady();
  const id = push(ref(getDb(), PLAYERS)).key!;
  const player: Player = { id, name: name.trim(), createdAt: Date.now() };
  await set(ref(getDb(), `${PLAYERS}/${id}`), player);
  return player;
}

export async function updatePlayer(id: string, patch: Partial<Player>): Promise<void> {
  await authReady();
  await update(ref(getDb(), `${PLAYERS}/${id}`), patch);
}

export async function deletePlayer(id: string): Promise<void> {
  await authReady();
  await remove(ref(getDb(), `${PLAYERS}/${id}`));
}
