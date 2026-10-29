# data.ts FACTIONS mirrors the live MFM

`src/lib/data.ts` keeps its own detachment/disposition table rather than reading
the MFM at runtime (the site 403s bots and is a heavy RSC app). The MFM bot keeps
`mfm-snapshot.json` current automatically, but **syncing that into `data.ts` is a
manual step** — and it drifted badly once because the bot's change issues were
never actioned.

The discipline: when the bot opens an MFM issue, re-sync `data.ts`, and verify
drift by comparing `data.ts` against the live site (not snapshot-vs-live, which
only proves the snapshot is current). The bot also flags unit/codex changes via
GW's "UPDATED" badges, not just detachment changes.
