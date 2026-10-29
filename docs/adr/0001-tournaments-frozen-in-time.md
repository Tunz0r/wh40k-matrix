# Tournaments are frozen in time

An MFM/codex sync updates the *current* meta only; it must never retroactively
rewrite a past (or finished) tournament's stored dispositions, lists or estimates.
We chose this because the app doubles as a historical record — we'd rather keep
each tournament exactly as it was played than always show the newest points. A
stored list reads its own saved disposition (not one re-derived from `data.ts`),
so a sync can't touch it; a real backfill is only ever done deliberately, on
request, and only for an active event.
