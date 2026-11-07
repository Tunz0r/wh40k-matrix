# Changelog

Human-readable summary of notable work, newest first — so a collaborator (and
their agent) can catch up without reading every commit. See `git log` for the
full detail.

## 2026-11-07

- **Events-maintenance agent** (`.github/workflows/events-maintenance.yml` +
  `scripts/events-maintenance.mjs`). Keeps the usage/error log healthy, daily:
  - *#1 Error-watch* — if any `error` events in the last 24h, upsert ONE rolling
    GitHub issue (`[app-errors]`) with a signature breakdown. Low-noise: one
    issue, at most one comment/day, only on days with errors.
  - *#2 Prune* — delete events older than 60 days (+ a 50k hard cap).
  - Runs as the MFM bot; the `events` rule now grants that bot read + delete.
    **Publish `database.rules.json`** (manual) for the bot to read/prune.
- **Test safety-net (Vitest).** 21 unit tests over the pure, bug-prone core —
  `list-parser` (one case per real bug: mixed formats, two-army lists, bracket vs
  paren points, team/list splitting), `forecast` (`shrunkForecast`,
  `matchupForecast` incl. disposition-bias on/off), `disposition-meta`. Run with
  `npm test`; a CI workflow (`.github/workflows/ci.yml`) type-checks + tests on
  every push and PR. See [`ROADMAP.md`](./ROADMAP.md) P0#2.
- **Usage analytics + Vercel Web Analytics** (`src/lib/analytics.ts`,
  `components/Analytics.tsx`, `components/UsageAnalytics.tsx`). A thin, no-PII
  `track()` logs key actions to an append-only `events/` node; an admin
  **Brugsstatistik** panel on `/admin` shows what's actually used. Added the
  `events` rule to `database.rules.json` — **publish it by hand** in the Firebase
  console. See [`ROADMAP.md`](./ROADMAP.md) P0#1.
  - *Finished:* instrumented all events (incl. `roster_imported`, `team_joined`,
    `stats_viewed`); added **error logging** (`trackError` + global
    `onerror`/`unhandledrejection` handlers + key write-failure sites); the admin
    panel now shows an errors tile and a recent-errors list.
  - *Decisions captured:* [ADR-0005](./adr/0005-usage-analytics-rtdb-event-log.md)
    (why a no-PII RTDB event log, not a 3rd-party service) + GLOSSARY terms
    (Priority/pinned, Disposition bias, Usage event / `track()`, Error logging).
- **Bigger per-team estimate matrix.** Full army names on the row labels, wider
  column headers, larger cells (`EstimateInput` gained a `size` prop). Other
  matrices unchanged.

## 2026-11-06

- **`/stats-priority`** — the same meta stats as `/stats`, scoped to only the
  teams you've tagged ★. The stats page was extracted into a reusable
  `StatsView` component with a `variant` prop (no duplication).
- **Per-camp priority pinning** on Estimater: a ★ on each opponent floats it into
  a "Prioritet — skal udfyldes" band at the top. Stored in the camp's OWN node
  (`estimates/{dataSlug}/{team}/pinned`), **never** the shared field — not
  inherited by other camps. Also renamed the mode toggle "Pr. land" → "Pr. hold".
- **Disposition bias is now opt-in** (off by default everywhere) via a global,
  persisted toggle (`src/lib/disp-bias.ts`); `matchupForecast` takes an
  `applyDispBias` arg instead of always folding it in. Refreshed
  `DISP_MATCHUP_WR` from listhammer.info/stats (field has flattened; Priority
  Assets vs Disruption 58% is the one big edge).
- **`/stats` works for any tournament**, not just the legacy WTC 2026 field — it
  analyses the active tournament's field (honouring the `wtc` flag when present)
  and no longer double-counts our own roster.

## 2026-10-29 → 10-30  (collaboration + MFM bot)

- **Collaboration setup** for the two-person team: `GLOSSARY.md`, ADRs under
  `docs/adr/`, `ARCHITECTURE.md` / `WORKFLOWS.md`, and the vendored
  `grill-with-docs` skill in `.claude/skills/` (no install needed).
- **MFM bot closes the loop**: it now re-syncs `src/lib/data.ts` FACTIONS from the
  snapshot end-to-end (`scripts/sync-data-ts.mjs`), and tracks Black Templars +
  Imperial Agents (previously missed). Re-synced a large drift across factions.
- **Two-disposition detachments** (`d2`): a 3-DP detachment that may choose between
  two Force Dispositions is now supported ([ADR-0004](./adr/0004-two-dispositions-via-d2.md)).

## Earlier

- 2026-10-20 — "Sådan bruger du appen" guide page (`/guide`) + nav link.
- 2026-10-13 — dropped hardcoded "WTC" branding (not every tournament is the WTC).
- 2026-10-07/08 — practice-round ("Øve-runde") on the Turnering tab; fixed ghost
  team members and widened the add-player picker.
