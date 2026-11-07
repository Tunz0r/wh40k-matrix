# Usage analytics as a no-PII RTDB event log (not a third-party service)

We had **zero** visibility into which parts of the app get used or what breaks.
We needed usage analytics + basic error visibility.

## Decision

Log usage as **our own append-only event stream in the Realtime Database**
(`events/{autoId} = { e, uid, ts, …props }`), read back by an admin-only panel,
instead of adopting a third-party product analytics service (PostHog, Mixpanel,
Amplitude).

- **No PII** (upholds [ADR-0003](./0003-no-pii-in-rtdb-manual-rules.md)): events
  carry the `uid` (already our identity key) and a tiny non-identifying prop bag —
  never names, emails, or list content. The message on an `error` event is
  truncated and admin-only.
- **Append-only + admin-read**, enforced by the `events` rule in
  `database.rules.json`: any signed-in user may create an event tagged with their
  own uid; nobody can edit/delete others'; only admins can read the log.
- `track()` / `trackError()` are **fire-and-forget**: wrapped so they can never
  break a user flow, and they wait for `authReady()` before reading the uid (a
  fresh page load fires `page_view` before Firebase rehydrates the user).
- **Vercel Web Analytics** is layered on top for cookieless raw page traffic; the
  RTDB log is what powers the in-app, uid-sliceable breakdown.

## Why (the trade-off)

- **Stack fit + privacy over richness.** A third-party service gives funnels,
  retention and session replay out of the box — but ships user data to an external
  vendor, which sits badly with our no-PII invariant, and adds a dependency for a
  hobby-scale, trusted-user tool. Keeping events in the DB we already run means no
  new vendor, no extra consent surface, and trivially no-PII.
- **Cost:** we hand-roll the aggregation (the admin panel) and there's no
  funnel/retention tooling. For "which features are used + what's failing" that's
  enough; richer analysis can come later without re-instrumenting (the `track()`
  call sites stay).

## Consequences / gotchas

- The `events` rule, like all rules, is **published by hand** in the Firebase
  console. Until it's published, writes are silently rejected (and `track()`
  swallows the error) — the admin panel shows a "publish the rules" message.
- The `events` node grows unbounded, so a **daily maintenance agent**
  (`scripts/events-maintenance.mjs`, `.github/workflows/events-maintenance.yml`)
  prunes events older than 60 days and alerts on errors. It runs as the MFM bot,
  so the `events` rule grants `_bots` read + delete (admins still read in-app).
- If we later need stack traces / alerting beyond the in-app log, add a dedicated
  error service (Sentry) alongside — it doesn't replace this decision.
