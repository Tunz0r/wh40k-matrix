// Lightweight, privacy-respecting usage logging. We had NO visibility into what
// parts of the app get used; this is the thin layer that fixes it.
//
// Design (see docs/ROADMAP.md):
// - Fire-and-forget: every call is wrapped so it can NEVER break a user flow.
// - No PII (ADR-0003): we store the `uid` (already our identity key) plus a tiny,
//   non-identifying prop bag — never names, emails, or list content.
// - Append-only to `events/` in RTDB; only admins can read it back (see the
//   `events` rule in database.rules.json). Vercel Web Analytics covers raw page
//   views too; this log is what powers the in-app admin breakdown.
import { getDb, currentUser, authReady } from "./firebase";
import { ref, push, serverTimestamp, query, limitToLast, onValue, off } from "firebase/database";

// The known product events. Keep this list tight so the admin view stays legible
// — add a case here when you instrument a genuinely new, decision-useful action.
export type AppEvent =
  | "page_view"
  | "estimate_set"
  | "bulk_import"
  | "list_paste"
  | "team_pinned"
  | "pairing_committed"
  | "warmup_logged"
  | "roster_imported"
  | "stats_viewed"
  | "tournament_created"
  | "team_joined"
  | "error";

type Props = Record<string, string | number | boolean>;

let lastPageKey = "";

// Record a usage event. Safe to call anywhere, signed in or not (no-ops when
// signed out, and swallows any write error).
export function track(event: AppEvent, props?: Props): void {
  try {
    // Collapse duplicate page views from re-renders / StrictMode double-mounts.
    if (event === "page_view") {
      const key = String(props?.path ?? "");
      if (key === lastPageKey) return;
      lastPageKey = key;
    }
    // Wait for auth to restore before reading the uid — on a fresh page load the
    // event fires (useEffect on mount) BEFORE Firebase has rehydrated the user, so
    // a synchronous read would drop it. authReady resolves once the user is known.
    void authReady()
      .then(() => {
        const uid = currentUser()?.uid;
        if (!uid) return;
        return push(ref(getDb(), "events"), {
          e: event,
          uid,
          ts: serverTimestamp(),
          ...(props || {}),
        });
      })
      .catch(() => {});
  } catch {
    // never throw from analytics
  }
}

// --- Errors ---

let lastErrKey = "";
let lastErrAt = 0;

// Log a failure to the same stream, so admins can see what breaks — not just what
// gets used. `ctx` is a short, stable label ("saveEstimate", "unhandledrejection");
// the message is truncated and admin-only, but keep obviously-sensitive strings
// out of it. Deduped within 5s so a crash loop can't spam the log.
export function trackError(ctx: string, err?: unknown): void {
  try {
    const msg = (err instanceof Error ? err.message : String(err ?? "")).slice(0, 180);
    const key = ctx + "|" + msg;
    const now = Date.now();
    if (key === lastErrKey && now - lastErrAt < 5000) return;
    lastErrKey = key;
    lastErrAt = now;
    track("error", { ctx, msg });
  } catch {
    // never throw from analytics
  }
}

// --- Read side (admin only; the `events` rule restricts reads to admins) ---

export interface UsageEvent {
  e: string; // event name
  uid: string;
  ts: number;
  [k: string]: string | number | boolean;
}

// Subscribe to the most recent usage events (newest last). Admin-only by rule;
// a non-admin read is rejected and simply yields an empty list.
export function subscribeToUsage(
  cb: (events: UsageEvent[]) => void,
  max = 3000
): () => void {
  let active = true;
  let r: ReturnType<typeof query> | null = null;
  authReady().then(() => {
    if (!active) return;
    r = query(ref(getDb(), "events"), limitToLast(max));
    onValue(
      r,
      (snap) => {
        const val = (snap.val() as Record<string, UsageEvent>) || {};
        cb(Object.values(val).sort((a, b) => (a.ts || 0) - (b.ts || 0)));
      },
      () => cb([]) // permission denied / offline → empty
    );
  });
  return () => {
    active = false;
    if (r) off(r);
  };
}
