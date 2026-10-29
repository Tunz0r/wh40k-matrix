<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Start here (so you're not on bare ground)

This repo keeps its context in files, not in one person's head or chat memory —
read these before working:

- **[`GLOSSARY.md`](./GLOSSARY.md)** — the project's shared vocabulary.
- **[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)** — stack, the multi-tenant
  data model, the Firebase node map, key files, and the gotchas that will bite.
- **[`docs/WORKFLOWS.md`](./docs/WORKFLOWS.md)** — local dev, deploying, Firebase
  rules, the MFM bot.
- **[`docs/adr/`](./docs/adr/)** — the hard-to-reverse decisions and *why*. Don't
  "fix" something recorded there without reading it first.

Non-negotiables (see the ADRs): never bulk-overwrite the `estimates` node; no PII
(emails) in the Realtime Database; `database.rules.json` is published by hand;
`src/lib/data.ts` mirrors the live MFM.

# Keeping decisions in sync (we're a two-person team now)

Two people work on this repo. To stay in sync, decisions and vocabulary live in
the repo, not in one person's head or chat session:

- **[`GLOSSARY.md`](./GLOSSARY.md)** — the project's shared vocabulary. Read it to
  get up to speed. When you settle on a term, add/refine it there (tight
  definitions; list rejected synonyms under `_Avoid_`).
- **[`docs/adr/`](./docs/adr/)** — Architecture Decision Records. Record a short
  ADR when a decision is hard to reverse, surprising without context, AND a real
  trade-off (all three). Most decisions don't qualify — keep ADRs few.

These are maintained by the **`/grill-with-docs`** skill (Matt Pocock's skills,
installed via `claude plugin install mattpocock-skills@claude-plugins-official`):
it interviews you about a plan and writes the glossary/ADRs as you decide. You can
also just edit the files directly. Either way, commit them so the other person
(and their agent) picks the decisions up on `git pull`.
