# Project skills (vendored — no install needed)

These skills are committed to the repo so everyone gets them via `git pull` —
no `claude plugin install` required. Claude Code auto-discovers skills in
`.claude/skills/`.

## What's here

- **`grill-with-docs`** — the one we use: run `/grill-with-docs` to be interviewed
  about a plan or decision while it writes the results into `GLOSSARY.md` and
  `docs/adr/`. It delegates to the two below.
- **`grilling`** — the relentless interview.
- **`domain-modeling`** — maintains `GLOSSARY.md` + ADRs (see its `GLOSSARY-FORMAT.md`
  and `ADR-FORMAT.md`).

See [`AGENTS.md`](../../AGENTS.md) for how we use these to keep decisions in sync.

## Attribution

Vendored verbatim from **[mattpocock/skills](https://github.com/mattpocock/skills)**
(© 2026 Matt Pocock), MIT-licensed — see [`LICENSE`](./LICENSE). We keep a pinned
copy here instead of the plugin so both of us run the exact same version via git.
To pull in updates or more of Matt's skills later:
`claude plugin install mattpocock-skills@claude-plugins-official`.
