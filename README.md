# WH40K team-tournament prep

A tool for preparing **team tournaments** in Warhammer 40,000 (WTC-style): build
each team's lists, estimate every matchup against the opponents, and run
tournament day with pairing and live coaching. Multi-tenant — many teams prep the
same event year-round, each isolated. Next.js + Firebase, deployed on Vercel.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in the Firebase values (ask Martin / copy from Vercel)
npm run dev                  # http://localhost:3000
```

Set `NEXT_PUBLIC_ENABLE_TEST_LOGIN=1` in `.env.local` to get a local-only test
login for poking at flows.

## Where to look

| | |
|---|---|
| **Vocabulary** — the shared language | [`GLOSSARY.md`](./GLOSSARY.md) |
| **How it's built** — stack, data model, key files, gotchas | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) |
| **How we operate** — dev, deploy, the MFM bot, rules | [`docs/WORKFLOWS.md`](./docs/WORKFLOWS.md) |
| **Why we did it this way** — decisions | [`docs/adr/`](./docs/adr/) |
| **Working with AI agents** — conventions | [`AGENTS.md`](./AGENTS.md) |
| **In-app how-to** (for users) | `/guide` in the running app |

## The hard rules (read before touching data)

- **Never** bulk-overwrite or reset the Firebase `estimates` node — it's
  production data, and past tournaments stay frozen in time.
- **No PII in the Realtime Database** — display names only, never emails.
- **`database.rules.json` is published by hand** in the Firebase console; editing
  the file alone does nothing.
- **`src/lib/data.ts` mirrors the live MFM** — keep it in sync when GW updates
  points/dispositions.

See [`docs/adr/`](./docs/adr/) for the reasoning behind each.

## Deploying

Push to `master` → Vercel auto-deploys. Confirm with `npx vercel ls` (top row
should read ● Ready). Details in [`docs/WORKFLOWS.md`](./docs/WORKFLOWS.md).
