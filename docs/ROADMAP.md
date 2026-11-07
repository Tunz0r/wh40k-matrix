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

### 1. Usage + error visibility  ✅ *first slice shipped*
We had zero analytics and no error monitoring, and ~123 `catch {}` / `.catch(() => {})`
/ `alert()` sites swallow failures. Shipped so far:

- **Vercel Web Analytics** (cookieless page-level traffic) in the root layout.
- A thin **`track(event, props)`** (`src/lib/analytics.ts`) → append-only `events/`
  node in RTDB, **no PII** (uid only, per [ADR-0003](./adr/0003-no-pii-in-rtdb-manual-rules.md)).
  Instrumented: `page_view`, `estimate_set`, `bulk_import`, `list_paste`,
  `team_pinned`, `pairing_committed`, `warmup_logged`, `tournament_created`.
- An admin **Brugsstatistik** panel (`/admin`, `UsageAnalytics.tsx`): events by
  type, most-visited routes, 14-day trend, active users.

> ⚠️ The `events` rule is in `database.rules.json` but **must be published by hand**
> in the Firebase console before writes land (see the manual-rules gotcha below).

Still to do: pipe swallowed errors into the same log (or add Sentry), and
instrument the remaining events (`roster_imported`, `team_joined`, `stats_viewed`).

### 2. A test safety-net on the risky code
There are **no tests**. The most logic-heavy, edge-case-prone code —
`list-parser.ts`, `forecast.ts`, the estimates read-merge — is verified only by
`tsc` + `next build`, which don't catch logic regressions. Add **Vitest** with a
handful of cases on the parser first (GW-app, WTC, NewRecruit, mixed team split,
divider lines, dual-army lists — all real bugs we've hit).

## P1 — operational robustness

- **`database.rules.json` is published manually.** Editing the file changes
  nothing in prod until someone pastes it into the Firebase console — a silent
  landmine. Add `firebase deploy --only database` to CI, or at least a checklist.
- **Membership index rebuilds only when an admin/captain opens the app** (throttled,
  `recomputeMembership()`). A scheduled rebuild (we already run GitHub Actions)
  would close the gap for self-serve tournaments with no active admin.
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

1. **Finish the analytics slice** (errors into the log; remaining events) — biggest
   insight per effort. *(slice 1 done)*
2. **Vitest on `list-parser` / `forecast`** — stop regressions before prod.
3. **Scheduled membership rebuild + rules-deploy in CI** — close the two ops gaps.
4. **Toasts instead of alerts** + stats→action links — polish.
