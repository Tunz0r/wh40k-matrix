# Architecture

How this app is built. Read [`GLOSSARY.md`](../GLOSSARY.md) first for the vocabulary.

## Stack

- **Next.js 16** (App Router, React 19) — ⚠️ see [`AGENTS.md`](../AGENTS.md): this
  Next is newer than most training data; check `node_modules/next/dist/docs/`
  before using framework APIs.
- **Firebase Realtime Database** (project `wtcpairing`, region europe-west1) for
  all data + **Firebase Auth** for identity. Client config comes from
  `NEXT_PUBLIC_FIREBASE_*` env vars (`src/lib/firebase.ts`).
- **Vercel** — auto-deploys on push to `master` (repo `Tunz0r/wh40k-matrix`).
- Tailwind-style utility classes inline; no component library.

## The multi-tenant model

Several teams prep for the same tournament year-round, each isolated:

```
Event  (e.g. "WTC 2027")          tournaments/_events/{eventId}
  └── Camp  (one team's instance)  tournaments/_registry/{id}  →  TournamentMeta
        ├── roster + rounds        tournaments/{dataSlug}
        ├── players (seats)        roster.armies[i].claimedByUid
        └── estimates              estimates/{dataSlug}(+suffixes)
```

- **Event** owns the **shared opponent-list field** (`estimates/_fields/{fieldSlug}`,
  `fieldSlug === eventId`) that every participating camp reads. Each camp's own
  estimate *cells* graft on top at read time — isolation is per camp.
- A **camp** is keyed by its `dataSlug` (e.g. `team-denmark`). Its roster, rounds
  and estimates live under that slug.
- A **player** joins by claiming a seat via an invite link (`claimedByUid`).

## Firebase node map (the important bits)

Source-of-truth (security rules read these):
- `tournaments/_admins/{uid}` — super-admins
- `tournaments/_owners/{dataSlug}/{uid}` — captains of a camp
- `tournaments/_coaches/{uid}/{tournamentId}` — per-camp coaches
- `tournaments/_players/{playerId}` — legacy player pool + bindings
- `tournaments/{dataSlug}` — the camp doc (`roster`, `rounds`, `profiles`, `_join`)

Derived index — **rebuilt by `recomputeMembership()` (admin-write only)**; clients
never read it directly, the rules do (`root.child(...)`):
- `_members/{nodeKey}/{uid}`, `_teamMembers/{uid}`, `_myTournaments/{uid}/{id}`,
  `_myEvents/{uid}/{eventId}`, `_profileOwners/{dataSlug}/a{idx}`

Estimates + reference:
- `estimates/{dataSlug}` (+ `-versioner`, `-arketype-bank`, `-lists-raw`, `-sanity-ok`)
- `estimates/_fields/{fieldSlug}` — shared event opponent lists
- `estimates/_library` + `_library/_deprecated/{faction}` — global archetype library + staleness

Registry of logins: `tournaments/_users/{uid}` = `{displayName, lastSeen}` —
**display name only, never email** (admin-read). See
[`docs/adr/0003-no-pii-in-rtdb-manual-rules.md`](adr/0003-no-pii-in-rtdb-manual-rules.md).

## Access & membership

Access is granted two ways: **self-writes** (claiming a seat, registering a team
for an event) grant access immediately via rules; the **derived index** is
rebuilt by `recomputeMembership()` to fold in captains, coaches and bindings.
It runs automatically (throttled) when an admin opens the app — no manual button.

## Key files

| Area | File |
|---|---|
| Detachments / dispositions / `d2` | `src/lib/data.ts` |
| Membership + roles + recompute | `src/lib/membership.ts` |
| Estimates read/write + library | `src/lib/estimates-db.ts` |
| Camp doc, seats, warmups | `src/lib/tournament-db.ts` |
| Camp registry (TournamentMeta) | `src/lib/tournaments-registry.ts` |
| Events (shared field, cascade) | `src/lib/events.ts` |
| Roster model + (de)serialize | `src/lib/roster.ts` |
| List-export parsing | `src/lib/list-parser.ts` |
| Firebase init | `src/lib/firebase.ts` |
| Security rules (published by hand) | `database.rules.json` |
| MFM scraper bot | `scripts/mfm-check.mjs` + `.github/workflows/mfm-watch.yml` |

Pages (`src/app/*`): `estimates` (the matrix), `tournament/[id]` (camp dashboard),
`team/[slug]` (team room), `player` (Min side), `manage` (captain), `admin`,
`roster` (builder), `join`/`event` (onboarding), `guide` (how-to).

## Gotchas (things that will bite)

- **RTDB rejects `undefined`** in writes — strip it (`stripUndefined`) or the write fails.
- **Deleting a node** needs a `.write` rule at that node/ancestor; owner leaves are
  nulled per-uid, not the whole node (avoids PERMISSION_DENIED).
- **`database.rules.json` is published MANUALLY** in the Firebase console — editing
  the file alone changes nothing in production.
- **Never bulk-overwrite the estimates node** — it's production data. See
  [`docs/adr/0001-tournaments-frozen-in-time.md`](adr/0001-tournaments-frozen-in-time.md).
- **`data.ts` must mirror the live MFM** — see
  [`docs/adr/0002-data-ts-mirrors-mfm.md`](adr/0002-data-ts-mirrors-mfm.md).
