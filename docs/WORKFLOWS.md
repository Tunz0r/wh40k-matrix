# Workflows

How we actually operate the app day to day.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the Firebase values (ask Martin, or copy from Vercel)
npm run dev                  # http://localhost:3000
```

- **Test login**: set `NEXT_PUBLIC_ENABLE_TEST_LOGIN=1` in `.env.local` (local only,
  never in production) to get an anonymous "🧪 Test-bruger" button for exercising
  flows without a real account.
- `npm run build` to typecheck + build, `npm run lint` to lint.
- `.env.local` is gitignored — never commit real Firebase values or secrets.

## Deploying

Push to `master` → Vercel auto-deploys. **Confirm it landed** (don't assume):

```bash
git push origin master
npx vercel ls                # the top row should read ● Ready
```

Branch first if you're not meant to be on `master`; commit/push only when asked.

## Firebase security rules

`database.rules.json` is the source of truth, but **it is published by hand** in
the Firebase console (Realtime Database → Rules → Publish). A rule change in the
file does nothing until published — if something looks broken after a rules edit,
check whether it was published.

## The MFM bot (points/disposition updates)

GW updates the Munitorum Field Manual (mfm.warhammer-community.com) periodically.
`scripts/mfm-check.mjs` (run by `.github/workflows/mfm-watch.yml`, weekly +
`workflow_dispatch`) scrapes every faction, updates `mfm-snapshot.json`, flags
changed codexes as stale in the library, and opens an issue with the diff.

Run it on demand and handle the result:

```bash
gh workflow run mfm-watch.yml
gh run watch <run-id>
```

- If it reports **detachment DP/disposition changes**, re-sync `src/lib/data.ts`
  FACTIONS to match the live site. Verify by comparing `data.ts` against the live
  site — see [`docs/adr/0002-data-ts-mirrors-mfm.md`](adr/0002-data-ts-mirrors-mfm.md).
- **Unit/codex "UPDATED"** changes don't touch `data.ts` but deprecate the codex's
  library sources (⚠).
- The deprecation write needs the `FIREBASE_BOT_EMAIL`/`FIREBASE_BOT_PASSWORD`
  GitHub **environment** secrets (environment `Production`) — the job declares
  `environment: Production` so they're injected.

## Recording decisions (stay in sync)

When you settle a plan or a hard-to-reverse decision, write it down so the other
person's agents aren't starting blind — see the convention in
[`AGENTS.md`](../AGENTS.md): update [`GLOSSARY.md`](../GLOSSARY.md) and add an ADR
under [`docs/adr/`](adr/), ideally via the `/grill-with-docs` skill. Commit them.
