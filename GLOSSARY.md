# WH40K WTC-prep app

The shared language of this project: a tool for preparing **team tournaments**
in Warhammer 40,000 (WTC-style) — building each team's lists, estimating every
matchup against opponents, and running tournament day with pairing + live
coaching. Keep this file current so both of us (and our agents) use the same
words. It's a starting point — extend it with `/grill-with-docs`.

## Tournaments & teams

**Event**:
A multi-team tournament several teams attend (e.g. "WTC 2027", "DM i 40K for Hold").
Owns the shared opponent-list field that all participating teams read.
_Avoid_: tournament (when you mean the whole event)

**Camp**:
One team's instance within an event — its own roster, estimates and prep, isolated
from the other teams. Stored as a tournament doc with an `eventId` + `fieldSlug`.
_Avoid_: team, tournament

**dataSlug**:
The per-camp data key (e.g. `team-denmark`) that namespaces a camp's roster and
estimates in Firebase. One camp = one dataSlug.

**Seat / claim**:
A roster slot a player takes by signing in via the invite link (`claimedByUid`).
A player is "on the team" only when they've claimed a seat — not just when a name
is typed in.
_Avoid_: member (ambiguous — see Role)

## Lists & rules

**List** (a.k.a. army):
One player's 2000-point army: a faction + its detachment(s) + a chosen Force
Disposition.
_Avoid_: deck

**Detachment**:
An army sub-configuration with a Detachment-Points cost and Force Disposition(s).
The generic 3DP detachment of each faction offers a CHOICE of two dispositions
(see `d2` in `src/lib/data.ts`).

**DP (Detachment Points)**:
The per-list budget (max 3). Detachments cost 1–3 DP; a list's detachments sum to
the budget (e.g. three 1DP, or one 3DP).

**Force Disposition**:
One of five — Take and Hold, Purge the Foe, Priority Assets, Reconnaissance,
Disruption. Drives the matchup edge and the pairing.
_Avoid_: disposition type, stance

## Estimates & pairing

**Estimate**:
Our predicted result for one of our lists vs one opponent list, on the **WTC scale
0–20** (10 = even). The core unit of prep.

**Estimate matrix**:
The grid of estimates — our armies (rows) × an opponent's lists (columns).

**Matchup**:
One of our lists paired against one of theirs in a round.

**Pairing**:
The WTC process each round that assigns our lists to theirs
(Initial Skirmish → Main Engagement → Champion).

**Seeding / tier**:
Opponent teams grouped by expected strength (Tier 1–4), weighting which matchups
to prep first.

**Team room**:
A camp's live coaching view during a round, shared with coaches; updates live.

## Roles

**Captain**:
Owns a camp — the roster, the full estimate matrix, seeding, pairing and rounds.

**Player**:
Claims a seat, picks their own list, and fills in their own estimates.

**Coach**:
Follows a team room live during a round; advises but can't change the setup.

**Admin**:
Super-admin (cross-camp) — the one who must never be a bottleneck.

## MFM & reference data

**MFM (Munitorum Field Manual)**:
GW's official points + Force-Disposition source at mfm.warhammer-community.com.
The source of truth for detachments and dispositions.

**MFM bot / snapshot**:
The scheduled scraper (`scripts/mfm-check.mjs`) + its record (`mfm-snapshot.json`)
of the live MFM. `src/lib/data.ts` FACTIONS must mirror the snapshot
(see `docs/adr/0002-data-ts-mirrors-mfm.md`).

**Archetype / library**:
A clustered list type in the global reference library (`estimates/_library`), reused
across camps. Marked **stale (⚠)** when its codex changes (library deprecation).
