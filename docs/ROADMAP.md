# Roadmap & product review

A product-owner pass over the whole app (2026-11-07): where it stands, what's
missing, and what to build next. Pairs with [`CHANGELOG.md`](./CHANGELOG.md)
(what we've shipped) and [`ARCHITECTURE.md`](./ARCHITECTURE.md) (how it's built).

## Where the app stands

The core loop works end-to-end and the app is genuinely multi-tenant:

- Events → camps → claimed seats, with an **isolated-per-camp** estimate layer on
  top of a **shared opponent-list field**.
- **MFM bot** scrapes the live meta weekly and auto-syncs `data.ts` + deprecates
  stale codexes (`scripts/mfm-check.mjs`).
- **Bulk import** of a whole event's lists (GW-app / WTC / NewRecruit formats),
  parsed into faction / detachment / disposition / units.
- **Forecast + pairing** on the camp dashboard, warmup-corrected.
- **Warmups, coaching, calibration, sanity-check**, and two **meta-stats** pages
  (whole field + ★-priority subset).

This is a real product, not a prototype. The biggest gaps are **not features** —
they're **observability, a quality safety-net, and operational robustness**.

## P0 — highest priority

### 1. Usage + error visibility  ✅ *shipped*
We had zero analytics and no error monitoring, and ~123 `catch {}` / `.catch(() => {})`
/ `alert()` sites swallow failures. Shipped:

- **Vercel Web Analytics** (cookieless page-level traffic) in the root layout.
- A thin **`track(event, props)`** (`src/lib/analytics.ts`) → append-only `events/`
  node in RTDB, **no PII** (uid only, per [ADR-0003](./adr/0003-no-pii-in-rtdb-manual-rules.md)).
  Instrumented: `page_view`, `estimate_set`, `bulk_import`, `list_paste`,
  `team_pinned`, `pairing_committed`, `warmup_logged`, `tournament_created`,
  `roster_imported`, `team_joined`, `stats_viewed`.
- **Error logging** via `trackError(ctx, err)`: global `window.onerror` +
  `unhandledrejection` handlers, plus the key write-failure sites (bulk import,
  list save, seat claim). Deduped so a crash loop can't spam the log.
- An admin **Brugsstatistik** panel (`/admin`, `UsageAnalytics.tsx`): events by
  type, most-visited routes, 14-day trend, active users, an **errors (7d)** tile
  and a recent-errors list.

- A **daily maintenance agent** (`.github/workflows/events-maintenance.yml`):
  error-watch (upserts one rolling `[app-errors]` GitHub issue on new errors) +
  prune (drops events older than 60 days). Closes the loop so nobody has to watch
  `/admin`, and keeps the node bounded.

> ⚠️ The `events` rule is in `database.rules.json` but **must be published by hand**
> in the Firebase console before writes land (and before the bot can read/prune —
> the rule now grants `_bots` read + delete). See the manual-rules gotcha below.

Optional next: a dedicated error service (Sentry) if volume/stack-traces are ever
needed beyond the in-app log; a weekly usage digest (a Claude scheduled agent).

### 2. A test safety-net on the risky code  ✅ *shipped*
There were **no tests** — the app was verified only by `tsc` + `next build`, which
catch type errors but **not logic regressions**. Now: a **Vitest** suite (21 tests)
over the pure core — `list-parser` (one case per real bug below + each export
format), `forecast` (`shrunkForecast`, `matchupForecast` incl. the bias on/off
paths) and `disposition-meta` — run via `npm test` and in CI
(`.github/workflows/ci.yml`) on every push + PR, so a regression fails loudly
before prod. Grow the suite as new edge cases appear.

**Why this is the next priority (not a nice-to-have):**
- **`list-parser.ts` is load-bearing and silently fails.** It turns pasted army
  lists (GW-app / WTC / NewRecruit, mixed per team) into the faction / detachment /
  disposition / units that feed estimates → forecasts → pairing. A parsing
  regression doesn't throw — it quietly mis-splits a team or drops a list, and the
  bad data flows all the way to a pairing decision. Garbage in, garbage out, and
  nobody notices until a tournament.
- **It changes often.** Every new export format, MFM shift, or edge case touches
  it — exactly the code most likely to regress.
- **It's a proven bug magnet.** Just this session we fixed: mixed GW/WTC/NewRecruit
  in one document, pure-divider lines spawning phantom teams, a list containing two
  full armies, and `[bracket]` vs `(paren)` point costs. Each is a perfect
  regression test — and a candidate to silently come back.
- **It unblocks the second contributor.** Tests are executable documentation of
  intent and a guardrail so a change (ours or the brother's) that breaks a known
  case fails loudly in CI instead of in production.

**Scope (small — pure functions, ~a day, no infra):** add **Vitest** and cover the
pure core first:
- `list-parser.ts`: `parseArmyList`, `parseTeamLists`, `parseEventLists`,
  `matchFaction`, `matchDetachments`, `firstDisposition` — one case per real bug
  above, plus happy paths for each export format.
- `forecast.ts`: `shrunkForecast`, `matchupForecast` (incl. the `applyDispBias`
  on/off paths), `dispositionEdgeBP`.
- Wire `vitest` into a `test` script and run it in CI next to the build.

## P1 — operational robustness

- ~~**`database.rules.json` is published manually.**~~ ✅ **done** — rules now
  auto-deploy via CI (`.github/workflows/deploy-rules.yml`) on push to master,
  via a `FIREBASE_SERVICE_ACCOUNT` secret. No more manual console paste. See
  [ADR-0003](./adr/0003-no-pii-in-rtdb-manual-rules.md).
- **Membership index rebuild — deliberately deferred.** `recomputeMembership()`
  runs on every membership-changing action and (throttled) when an admin/captain
  opens the app. The only gap is a dormant tournament where someone joins and no
  owner visits for a while — and it **self-heals** the moment an owner next opens
  the app. A scheduled rebuild would need to run with admin privileges (making the
  MFM bot an admin has bad side effects — the super-admin bootstrap would claim
  owner-less tournaments *for the bot*), or a risky refactor of security-critical,
  untested code. Not worth it for a self-healing, low-impact gap. Revisit only if
  real access-lag bites; if so, extract recompute's pure core + test it, then run
  it from CI via the service account (bypasses rules, no bootstrap side effect).
- **No staging** — everything goes straight to `master` → prod. Fast, but no
  safety valve.

## P2 — product & UX polish

- Replace blocking `alert()` error messages with inline toasts.
- Stronger first-run onboarding inside the UI (create camp → import → estimate).
- Mobile pass on the matrix-heavy pages (Estimater / Dashboard) for tournament day.
- Make insight → action one click: link stats cards to "fill the missing
  estimates for this team".
- Extend pin/priority: sort by "most incomplete", or a "X teams still missing
  lists" banner.

## Suggested order

1. ~~**Finish the analytics slice**~~ ✅ done.
2. ~~**Vitest on `list-parser` / `forecast`**~~ ✅ done (21 tests + CI).
3. **Scheduled membership rebuild + rules-deploy in CI** — close the two ops gaps (P1).
4. **Toasts instead of alerts** + stats→action links — polish (P2).
