"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { TEAM_NAME } from "@/lib/team";
import { useActiveTournament } from "@/lib/active-tournament";
import { useActivePlayer } from "@/lib/active-player";
import { useAuth } from "@/lib/auth";
import { subscribeToMyTournaments, upsertSelfUser } from "@/lib/membership";
import type { TournamentMeta } from "@/lib/tournaments-registry";
import ArmyEditor from "@/components/ArmyEditor";
import { DISP_STYLES, FACTIONS } from "@/lib/data";
import {
  subscribeToTournament,
  addWarmupGame,
  deleteWarmupGame,
  savePlayerProfile,
  setSlotArmy,
  setSlotName,
  type TournamentDoc,
  type TournamentRound,
  type WarmupGame,
  type PlayerProfile,
} from "@/lib/tournament-db";
import {
  subscribeToOpponents,
  estimateStyle,
  clusterLists,
  matchClusterByMember,
  lookupEstimate,
  listSimilarity,
  slugifyTeam,
  archetypeId,
  fetchArchetypeBank,
  snapshotSlotCells,
  setNeedsTestCells,
  switchSlotArchetype,
  appendListToMetaTeam,
  SIMILARITY_THRESHOLD,
  type OpponentMap,
  type ListCluster,
  type ClusterMember,
  type OpponentList,
  type ArchetypeDescriptor,
} from "@/lib/estimates-db";
import { archetypeWarmupStats } from "@/lib/forecast";
import { parseTeamLists, formatUnitsLines } from "@/lib/list-parser";
import {
  fetchSession,
  subscribeToSession,
  type SessionData,
  type MatchupData,
} from "@/lib/session";
import { tournamentGamesForArmy } from "@/lib/tournament-games";
import { getLayoutImage } from "@/lib/layouts";


function BPChip({ v, big }: { v: number; big?: boolean }) {
  const s = estimateStyle(v);
  return (
    <span
      className={`inline-flex items-center justify-center rounded border font-bold ${big ? "w-11 h-9 text-[15px]" : "w-8 h-6 text-[11px]"}`}
      style={{ background: s.bg, color: s.fg, borderColor: s.border }}
    >
      {v}
    </span>
  );
}

// Find the matchup in a session that belongs to our army (matched by faction) —
// used for the LIVE active session; completed rounds go through
// tournamentGamesForArmy instead.
function myMatchup(session: SessionData | null, faction: string): MatchupData | null {
  if (!session) return null;
  return (session.matchups || []).find((m) => m.aFaction === faction) || null;
}

export default function PlayerPage() {
  const [doc, setDoc] = useState<TournamentDoc | null>(null);
  const [opponents, setOpponents] = useState<OpponentMap>({});
  const [activeSession, setActiveSession] = useState<SessionData | null>(null);
  const [pastSessions, setPastSessions] = useState<Record<string, SessionData>>({});

  const { activeSlug, active, setActive } = useActiveTournament();
  const { user } = useAuth();
  const [myTournaments, setMyTournaments] = useState<TournamentMeta[]>([]);
  useEffect(() => (user?.uid ? subscribeToMyTournaments(user.uid, setMyTournaments) : undefined), [user?.uid]);
  useEffect(() => {
    try {
      const u1 = subscribeToTournament(activeSlug, setDoc);
      const u2 = subscribeToOpponents(setOpponents, activeSlug);
      return () => { u1(); u2(); };
    } catch {}
  }, [activeSlug]);

  const { activePlayer, activePlayerId, players, setActivePlayer, effectiveIdx, myArmyIdx, canManage } = useActivePlayer();
  // Self-rename of my own seat (fixes seats that got labelled with an email
  // before we captured a proper name at join).
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const onOwnSeat = myArmyIdx !== null && effectiveIdx === myArmyIdx;
  async function saveMyName() {
    const n = nameDraft.trim();
    if (!n || myArmyIdx === null) return;
    await setSlotName(activeSlug, myArmyIdx, n).catch(() => {});
    if (user?.uid) await upsertSelfUser(user.uid, n).catch(() => {});
    setNameEditing(false);
  }

  const armies = useMemo(() => doc?.roster?.armies || [], [doc]);
  // "My army" = the roster slot I've claimed in the ACTIVE tournament (or the
  // slot an owner/admin is acting as). Resolved by active-player from claimedByUid.
  const myIdx = effectiveIdx !== null && effectiveIdx < armies.length ? effectiveIdx : null;
  const myArmy = myIdx !== null ? armies[myIdx] : null;
  const myFaction = myArmy?.faction || "";

  // Live subscription to the active coaching session
  useEffect(() => {
    if (!doc?.activeSessionId) { setActiveSession(null); return; }
    try {
      return subscribeToSession(doc.activeSessionId, setActiveSession);
    } catch {}
  }, [doc?.activeSessionId]);

  // Fetch completed rounds' sessions for the results history
  const completedRounds = useMemo(
    () => (doc?.rounds || []).filter(
      (r): r is TournamentRound & { sessionId: string } =>
        !!r.sessionId && r.status === "completed"
    ),
    [doc]
  );
  const loadPast = useCallback(async () => {
    const entries = await Promise.all(
      completedRounds.map(async (r) => [r.sessionId, await fetchSession(r.sessionId)] as const)
    );
    const map: Record<string, SessionData> = {};
    for (const [id, s] of entries) if (s) map[id] = s;
    setPastSessions(map);
  }, [completedRounds]);
  useEffect(() => { loadPast(); }, [loadPast]);

  // My played tournament games, bridged to Min side: estimate from the opponent
  // country's matrix, result from the coaching session. See lib/tournament-games.
  const myResults = useMemo(
    () =>
      myIdx === null
        ? []
        : tournamentGamesForArmy({
            opponents,
            rounds: completedRounds.map((r) => ({
              number: r.number,
              opponentName: r.opponentName,
              sessionId: r.sessionId,
            })),
            sessions: pastSessions,
            armyIdx: myIdx,
            armyFaction: myFaction,
          }),
    [opponents, completedRounds, pastSessions, myIdx, myFaction]
  );

  const calibration = useMemo(() => {
    const deltas = myResults.map((r) => r.delta).filter((d): d is number => d !== null);
    if (!deltas.length) return null;
    const n = deltas.length;
    // ACCURACY (mean absolute deviation) is the headline: how far off each
    // estimate is regardless of direction. A signed average would let a +12 and
    // a -12 cancel to 0 and hide two terrible estimates — MAD flags them.
    const mad = deltas.reduce((a, b) => a + Math.abs(b), 0) / n;
    // BIAS (signed mean) is secondary: only says which way you lean on average.
    const bias = deltas.reduce((a, b) => a + b, 0) / n;
    // Worst single miss, to surface an outlier even when the average looks fine.
    const worst = deltas.reduce((m, d) => (Math.abs(d) > Math.abs(m) ? d : m), 0);
    return { n, mad, bias, worst };
  }, [myResults]);

  // --- Warmup games: log prep results vs archetypes and compare to estimates ---
  const clusters = useMemo(() => clusterLists(opponents), [opponents]);

  // Archetype dropdown sorted alphabetically for findability. Each option
  // carries a hover tooltip (title) with countries + full unit list so the
  // right archetype can be identified before picking.
  const clusterOptions = useMemo(
    () =>
      clusters
        .map((c, i) => {
          const units = c.rep.list.units?.length
            ? c.rep.list.units
            : c.members.find((m) => m.list.units?.length)?.list.units;
          const countries = [...new Set(c.members.map((m) => m.teamName))];
          const title =
            [
              c.rep.list.disposition,
              countries.join(", "),
            ].filter(Boolean).join(" · ") +
            (units ? `\n\n${formatUnitsLines(units)}` : "\n\n(ingen liste indsat endnu)");
          return {
            c,
            i,
            title,
            label: `${c.rep.list.faction} — ${(c.rep.list.detachments || []).join(", ")}${
              c.members.length > 1 ? ` (${c.members.length} lister)` : ""
            }`,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label, "da")),
    [clusters]
  );

  // My current estimate for an archetype — same precedence as the estimates
  // page: rep's manual value, any manual member, then any cell at all.
  const clusterEstimate = useCallback(
    (cluster: ListCluster, idx: number): number | null => {
      const cellFor = (m: ClusterMember) =>
        opponents[m.teamSlug]?.estimates?.[`${idx}_${m.listIdx}`];
      const rep = cellFor(cluster.rep);
      const manual = cluster.members.map(cellFor).find((c) => c && !c.auto);
      const cell = (rep && !rep.auto ? rep : manual) ?? rep ?? cluster.members.map(cellFor).find(Boolean);
      return cell ? cell.v : null;
    },
    [opponents]
  );

  // --- Min arketype: which archetype the player themselves runs ---
  const myProfile: PlayerProfile | null =
    myIdx !== null ? doc?.profiles?.[`a${myIdx}`] ?? null : null;

  // The live cluster matching a profile — matched against any member (not just
  // the rep), so a build merged into a wider cluster still resolves.
  const profileCluster = useMemo(() => {
    if (!myProfile) return null;
    const asList: OpponentList = {
      faction: myProfile.faction,
      detachments: myProfile.detachments || [],
      disposition: (myProfile.disposition ?? null) as OpponentList["disposition"],
      ...(myProfile.units?.length ? { units: myProfile.units } : {}),
    };
    return matchClusterByMember(clusters, asList);
  }, [myProfile, clusters]);

  // --- Practice priority: which archetypes to train against next ---
  // Ranks the WTC field's archetypes for MY army by (a) how common they are —
  // Tier 2/3 countries weighted slightly higher — (b) how contested/losing my
  // current estimate is (a crushing win needs no reps; a coin-flip or a loss
  // does), and (c) whether I still need to test it (no games on my current list,
  // or flagged 🧪 unsure). Recomputes live as estimates come in, so a handful of
  // prep games before WTC can be aimed where they move the most.
  const T23_WEIGHT = 1.35;
  const practiceTop = useMemo(() => {
    if (myIdx === null) return [];
    const ourArchetype = myProfile
      ? { faction: myProfile.faction, detachments: myProfile.detachments || [], disposition: myProfile.disposition ?? null }
      : null;
    const scored = clusters.map((c, ci) => {
      // Prevalence over REAL WTC opponents only (skip meta-library copies).
      let wPrev = 0, fieldCount = 0, t23 = 0;
      const countries: string[] = [];
      for (const m of c.members) {
        if (!opponents[m.teamSlug]?.wtc) continue;
        fieldCount++;
        countries.push(m.teamName);
        const is23 = /tier\s*[23]\b/i.test(m.tier || "");
        wPrev += is23 ? T23_WEIGHT : 1;
        if (is23) t23++;
      }
      if (fieldCount === 0) return null;
      const est = clusterEstimate(c, myIdx);
      // Need is highest for draws/losses (est ≤ 10) and decays for comfortable
      // wins; unestimated archetypes sit at a neutral 0.9 until a number arrives.
      const matchupNeed = est === null ? 0.9 : Math.max(0.3, Math.min(1.3, 1.3 - Math.max(0, est - 10) * 0.12));
      const w = archetypeWarmupStats(doc?.warmups, myIdx, c.rep.list, ourArchetype);
      const gamesOn = w?.onArchetype ?? 0;
      const repFactor = 1 - Math.min(gamesOn, 3) * 0.25; // already-practiced → lower
      const unsure = c.members.some((m) => opponents[m.teamSlug]?.estimates?.[`${myIdx}_${m.listIdx}`]?.needsTest);
      const priority = wPrev * matchupNeed * repFactor * (unsure ? 1.3 : 1);
      return { c, ci, priority, fieldCount, t23, est, gamesOn, unsure, countries };
    });
    return scored
      .filter((x): x is NonNullable<typeof x> => !!x && x.priority > 0)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 10);
  }, [clusters, myIdx, opponents, doc, myProfile, clusterEstimate]);

  const [profCluster, setProfCluster] = useState<string>("");
  const [profPaste, setProfPaste] = useState("");
  const [profPasting, setProfPasting] = useState(false);
  const [profChanging, setProfChanging] = useState(false);
  const [profBusy, setProfBusy] = useState(false);

  // Opponents already played (locked rounds) — their estimate cells are the
  // historical record and are never rewritten by archetype moves.
  const lockedSlugs = useMemo(() => {
    const s = new Set<string>();
    for (const r of doc?.rounds || []) {
      if ((r.status === "live" || r.status === "completed") && r.opponentName) {
        s.add(slugifyTeam(r.opponentName));
      }
    }
    return s;
  }, [doc]);

  const profileDescriptor = (p: PlayerProfile): ArchetypeDescriptor => ({
    faction: p.faction,
    detachments: p.detachments || [],
    disposition: p.disposition ?? null,
  });

  // Set or switch the archetype: park the old row in the bank, attribute or
  // inherit for the new one (see switchSlotArchetype), then save the profile.
  async function commitProfile(profile: PlayerProfile) {
    if (myIdx === null || profBusy) return;
    const newDesc = profileDescriptor(profile);
    const oldDesc = myProfile ? profileDescriptor(myProfile) : null;
    const label = `${newDesc.faction} — ${newDesc.detachments.join(", ")}`;
    const ownCount = Object.keys(snapshotSlotCells(opponents, myIdx)).length;
    setProfBusy(true);
    try {
      if (oldDesc && archetypeId(oldDesc) !== archetypeId(newDesc)) {
        const bank = await fetchArchetypeBank(archetypeId(newDesc), activeSlug);
        const m = Object.keys(bank).length;
        if (
          !confirm(
            `Skift arketype til ${label}?\n\n` +
              `Dine ${ownCount} estimater gemmes på den gamle arketype og hentes frem hvis nogen vælger den igen.\n` +
              (m > 0
                ? `Du overtager ${m} gemte estimater fra ${label}.`
                : `${label} har ingen gemte estimater — du starter forfra.`)
          )
        ) {
          setProfBusy(false);
          return;
        }
      } else if (!oldDesc && ownCount > 0) {
        const bank = await fetchArchetypeBank(archetypeId(newDesc), activeSlug);
        const m = Object.keys(bank).length;
        if (
          !confirm(
            `Vælg ${label} som din arketype?\n\n` +
              `Dine ${ownCount} eksisterende estimater knyttes til arketypen.` +
              (m > 0 ? ` Gemte estimater fra banken udfylder de felter du mangler.` : "")
          )
        ) {
          setProfBusy(false);
          return;
        }
      }
      const res = await switchSlotArchetype(opponents, myIdx, oldDesc, newDesc, lockedSlugs, activeSlug);
      await savePlayerProfile(activeSlug, myIdx, profile);
      if (res.inherited > 0) alert(`${res.inherited} estimater overtaget fra arketypen.`);
      setProfCluster("");
      setProfPaste("");
      setProfPasting(false);
      setProfChanging(false);
    } catch {
      alert("Kunne ikke gemme arketypen — tjek Firebase.");
    } finally {
      setProfBusy(false);
    }
  }

  function saveProfileFromCluster(cluster: ListCluster, ownUnits?: string[]) {
    commitProfile({
      faction: cluster.rep.list.faction,
      detachments: cluster.rep.list.detachments || [],
      disposition: cluster.rep.list.disposition ?? null,
      ...(ownUnits?.length ? { units: ownUnits } : {}),
    });
  }

  // Clearing parks the row in the archetype's bank and empties it — a slot
  // without an archetype should not carry estimates.
  async function clearProfile() {
    if (myIdx === null || !myProfile || profBusy) return;
    const n = Object.keys(snapshotSlotCells(opponents, myIdx)).length;
    if (
      !confirm(
        `Nulstil din arketype?\n\nDine ${n} estimater parkeres på arketypen og din række tømmes. De kommer tilbage når du eller en holdkammerat vælger arketypen igen.`
      )
    )
      return;
    setProfBusy(true);
    try {
      await switchSlotArchetype(opponents, myIdx, profileDescriptor(myProfile), null, lockedSlugs, activeSlug);
      await savePlayerProfile(activeSlug, myIdx, null);
    } catch {
      alert("Kunne ikke nulstille — tjek Firebase.");
    } finally {
      setProfBusy(false);
    }
  }

  // Paste own list → parse → match to a field archetype (≥ threshold), or
  // — when nothing matches — CREATE the archetype from the list (appended to
  // the Warmup Arketyper meta team) and pick it.
  async function matchProfilePaste() {
    const parsed = parseTeamLists(profPaste.trim())[0];
    if (!parsed || !parsed.units.length) {
      alert("Kunne ikke læse listen — indsæt et komplet liste-export (GW-app, WTC eller NewRecruit).");
      return;
    }
    const asList: OpponentList = {
      faction: parsed.faction || "",
      detachments: parsed.detachments,
      disposition: parsed.disposition,
      units: parsed.units,
    };
    let best: { c: ListCluster; sim: number } | null = null;
    for (const c of clusters) {
      const sim = listSimilarity(asList, c.rep.list);
      if (sim >= SIMILARITY_THRESHOLD && (!best || sim > best.sim)) best = { c, sim };
    }
    if (best) {
      saveProfileFromCluster((best as { c: ListCluster }).c, parsed.units);
      return;
    }

    // No match — create the archetype, but only with resolved metadata.
    if (!parsed.faction || !parsed.detachments.length) {
      alert(
        "Ingen arketype matcher listen, og faction/detachment kunne ikke læses fra den — så kan arketypen ikke oprettes. Tjek at listen har faction- og detachment-linjer, eller vælg en arketype manuelt."
      );
      return;
    }
    const disposition =
      parsed.disposition ??
      FACTIONS[parsed.faction]?.find((d) => d.n === parsed.detachments[0])?.d ??
      null;
    const label = `${parsed.faction} — ${parsed.detachments.join(", ")}`;
    if (
      !confirm(
        `Ingen arketype i feltet matcher din liste (≥${SIMILARITY_THRESHOLD}% lighed).\n\nOpret "${label}" som ny arketype i biblioteket og vælg den?`
      )
    )
      return;
    try {
      await appendListToMetaTeam({
        faction: parsed.faction,
        detachments: parsed.detachments,
        disposition,
        units: parsed.units,
      });
    } catch {
      alert("Kunne ikke oprette arketypen — tjek Firebase.");
      return;
    }
    await commitProfile({
      faction: parsed.faction,
      detachments: parsed.detachments,
      disposition,
      units: parsed.units,
    });
  }

  const [wuCluster, setWuCluster] = useState<string>("");
  const [wuActual, setWuActual] = useState<string>("");
  const [wuDate, setWuDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [wuNotes, setWuNotes] = useState("");

  const wuSelected = wuCluster === "" ? null : clusters[Number(wuCluster)] ?? null;
  const wuEstimate = wuSelected && myIdx !== null ? clusterEstimate(wuSelected, myIdx) : null;

  async function logWarmup() {
    if (myIdx === null || !wuSelected) return;
    const actual = Number(wuActual);
    if (wuActual.trim() === "" || !Number.isFinite(actual) || actual < 0 || actual > 20) {
      alert("Resultat skal være 0-20 BP.");
      return;
    }
    const game: WarmupGame = {
      date: wuDate,
      faction: wuSelected.rep.list.faction,
      detachments: wuSelected.rep.list.detachments || [],
      disposition: wuSelected.rep.list.disposition ?? null,
      own: myProfile
        ? {
            faction: myProfile.faction,
            detachments: myProfile.detachments || [],
            disposition: myProfile.disposition ?? null,
          }
        : null,
      estimate: wuEstimate,
      actual,
      ...(wuNotes.trim() ? { notes: wuNotes.trim() } : {}),
    };
    try {
      await addWarmupGame(activeSlug, myIdx, game);
      // Closing the loop: testing the matchup clears its "needs testing" flag
      // on this army's estimate cells for the archetype.
      const testedKeys = wuSelected.members
        .filter((m) => opponents[m.teamSlug]?.estimates?.[`${myIdx}_${m.listIdx}`]?.needsTest)
        .map((m) => `${m.teamSlug}/${myIdx}_${m.listIdx}`);
      if (testedKeys.length) setNeedsTestCells(testedKeys, false, activeSlug).catch(() => {});
      setWuCluster("");
      setWuActual("");
      setWuNotes("");
    } catch {
      alert("Kunne ikke gemme warmup-kampen — tjek Firebase.");
    }
  }

  // Each logged game re-derives its CURRENT estimate live from the estimates
  // data, so edits in the estimates menu show up here immediately. The value
  // snapshotted at log time is only a fallback (archetype no longer matched).
  const myWarmups = useMemo(() => {
    if (myIdx === null) return [];
    const node = doc?.warmups?.[`a${myIdx}`] || {};
    return Object.entries(node)
      .map(([id, g]) => {
        const snapshot = g.estimate ?? null;
        const live = lookupEstimate(opponents, null, myIdx, {
          faction: g.faction,
          detachments: g.detachments || [],
          disposition: (g.disposition ?? null) as OpponentList["disposition"],
        });
        return { id, ...g, estimate: snapshot, currentEstimate: live ?? snapshot };
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [doc, myIdx, opponents]);

  const warmupStats = useMemo(() => {
    const deltas = myWarmups
      .filter((g) => g.currentEstimate !== null)
      .map((g) => g.actual - (g.currentEstimate as number));
    if (!deltas.length) return null;
    return {
      n: deltas.length,
      avg: deltas.reduce((a, b) => a + b, 0) / deltas.length,
      abs: deltas.reduce((a, b) => a + Math.abs(b), 0) / deltas.length,
    };
  }, [myWarmups]);

  // My estimate progress for my army
  const myProgress = useMemo(() => {
    if (myIdx === null) return { filled: 0, total: 0 };
    let filled = 0, total = 0;
    for (const team of Object.values(opponents)) {
      (team.armies || []).forEach((_, j) => {
        total++;
        if (team.estimates?.[`${myIdx}_${j}`]) filled++;
      });
    }
    return { filled, total };
  }, [opponents, myIdx]);

  const liveMatchup = myMatchup(activeSession, myFaction);
  const currentRound = (doc?.rounds || []).find((r) => r.status === "live" || r.status === "pairing");

  return (
    <>
      <header className="px-4 sm:px-6 py-4 border-b border-white/[0.08] sticky top-12 bg-[#0f0f13] z-20">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-[#e8e8f0] tracking-tight">
            Min side
            <span className="text-[#4ade80] ml-2 text-sm font-normal">— {active?.teamName ?? TEAM_NAME}</span>
          </h1>
          {activePlayer && !nameEditing && (
            <span className="text-[12px] text-[#8888a0] flex items-center gap-1.5">
              {activePlayer.name}{myFaction ? ` · ${myFaction}` : ""}
              {onOwnSeat && (
                <button
                  onClick={() => { setNameDraft(activePlayer.name); setNameEditing(true); }}
                  title="Ret dit navn"
                  className="text-[10px] text-[#8888a0] hover:text-[#c084fc] transition-colors"
                >
                  ✎
                </button>
              )}
            </span>
          )}
          {activePlayer && nameEditing && (
            <span className="flex items-center gap-1.5">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveMyName(); if (e.key === "Escape") setNameEditing(false); }}
                className="text-[12px] px-2 py-1 rounded-md border border-white/[0.14] bg-[#1a1a22] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
              />
              <button onClick={saveMyName} disabled={!nameDraft.trim()} className="text-[11px] px-2 py-1 rounded-md bg-[#a855f7] hover:bg-[#9333ea] text-white font-semibold disabled:opacity-50">Gem</button>
              <button onClick={() => setNameEditing(false)} className="text-[11px] text-[#8888a0] hover:text-[#e8e8f0]">Annullér</button>
            </span>
          )}
        </div>
      </header>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
        {/* My tournaments — this page is mine across every team I'm on. */}
        {myTournaments.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            <span className="text-[#8888a0]">Mine turneringer:</span>
            {myTournaments.map((t) => (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={`px-2 py-1 rounded-md border transition-colors ${
                  t.id === active?.id
                    ? "border-[#a855f7] bg-[#a855f7]/10 text-[#c084fc]"
                    : "border-white/[0.12] text-[#c8c8d8] hover:border-[#a855f7]"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        {/* Identity. Owners/admins can act as any slot; a normal player is
            simply their claimed slot (or is prompted to claim one). */}
        {canManage ? (
          <div className="rounded-xl border border-white/[0.08] p-4">
            <h2 className="text-xs font-semibold text-[#8888a0] uppercase tracking-wider mb-2">Optræd som plads</h2>
            {players.length === 0 ? (
              <p className="text-[11px] text-[#8888a0]">Ingen pladser på rosteret endnu.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {players.map((p) => {
                  const idx = parseInt(p.id.slice(1), 10);
                  const army = armies[idx];
                  const isMe = p.id === activePlayerId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setActivePlayer(p.id)}
                      className={`text-left rounded-lg border p-2 transition-colors ${isMe ? "border-[#a855f7]/60 bg-[#a855f7]/10" : "border-white/[0.08] hover:border-white/[0.18]"}`}
                    >
                      <div className="text-[11px] text-[#e8e8f0] font-medium truncate">{army?.player?.trim() || p.name}</div>
                      <div className="text-[9px] text-[#8888a0] truncate">{army ? army.faction : "—"}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : myIdx === null ? (
          <div className="rounded-xl border border-white/[0.08] p-4">
            <h2 className="text-xs font-semibold text-[#8888a0] uppercase tracking-wider mb-2">Min plads</h2>
            <p className="text-[11px] text-[#8888a0]">
              Du har ikke gjort krav på en plads i denne turnering endnu. Bed din kaptajn om at åbne
              holdet, så kan du vælge din plads.
            </p>
          </div>
        ) : null}

        {/* Pick your army — for a claimed seat with no army chosen yet. */}
        {myIdx !== null && myArmy && !myArmy.faction && (
          <div className="rounded-xl border border-[rgba(168,85,247,0.25)] bg-[rgba(168,85,247,0.04)] p-4 space-y-2">
            <h2 className="text-sm font-semibold text-[#e8e8f0]">Vælg din hær</h2>
            <p className="text-[11px] text-[#8888a0]">
              Du er på holdet i {active?.name ?? "turneringen"}, men har ikke valgt en hær endnu.
              Vælg faction, detachment og disposition.
            </p>
            <ArmyEditor
              initial={myArmy}
              onSave={(a) => {
                if (myIdx !== null) setSlotArmy(activeSlug, myIdx, a).catch(() => {});
              }}
              onCancel={() => {}}
            />
          </div>
        )}

        {myIdx !== null && myArmy && myArmy.faction && (
          <>
            {/* Min arketype: map own army to a field archetype */}
            <div className="rounded-xl border border-white/[0.08] p-4">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h2 className="text-sm font-semibold text-[#e8e8f0]">Min arketype</h2>
                {myProfile && (
                  <span className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => setProfChanging(!profChanging)}
                      disabled={profBusy}
                      className="text-[10px] text-[#a855f7] hover:text-[#c084fc] transition-colors disabled:opacity-40"
                    >
                      {profChanging ? "Annullér skift" : "Skift arketype"}
                    </button>
                    <button
                      onClick={clearProfile}
                      disabled={profBusy}
                      className="text-[10px] text-[#8888a0] hover:text-red-400 transition-colors disabled:opacity-40"
                    >
                      Nulstil
                    </button>
                  </span>
                )}
              </div>
              {myProfile && (
                <div className={`text-[12px] text-[#e8e8f0] ${profChanging ? "mb-2" : ""}`}>
                  {myProfile.faction}
                  <span className="text-[#8888a0]"> — {(myProfile.detachments || []).join(", ")}</span>
                  {myProfile.disposition && (
                    <span className="text-[10px] text-[#8888a0]"> · {myProfile.disposition}</span>
                  )}
                  <p className="text-[10px] text-[#8888a0] mt-1">
                    {profileCluster
                      ? `Matcher arketypen med ${profileCluster.members.length} ${profileCluster.members.length === 1 ? "liste" : "lister"} i feltet — dine estimater er knyttet til arketypen.`
                      : "⚠ Matcher ikke længere nogen arketype i feltet — vælg en ny."}
                  </p>
                </div>
              )}
              {(!myProfile || profChanging) && (
                <>
                  <p className="text-[10px] text-[#8888a0] mb-2">
                    Vælg den arketype du selv spiller — eller indsæt din liste, så finder vi den. Bruges til at sanity-tjekke holdets estimater.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={profCluster}
                      onChange={(e) => setProfCluster(e.target.value)}
                      className="flex-1 min-w-[200px] bg-[#1a1a22] border border-white/[0.14] rounded-lg px-2 py-1.5 text-[11px] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
                    >
                      <option value="">Vælg arketype…</option>
                      {clusterOptions.map(({ i, label, title }) => (
                        <option key={i} value={i} title={title}>{label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const c = profCluster === "" ? null : clusters[Number(profCluster)];
                        if (c) saveProfileFromCluster(c);
                      }}
                      disabled={profCluster === ""}
                      className="text-[11px] font-medium text-white bg-[#a855f7] hover:bg-[#9333ea] disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-md transition-colors"
                    >
                      Gem
                    </button>
                    <button
                      onClick={() => setProfPasting(!profPasting)}
                      className="text-[11px] text-[#a855f7] hover:text-[#c084fc] transition-colors"
                    >
                      {profPasting ? "Annullér" : "Indsæt liste i stedet"}
                    </button>
                  </div>
                  {profPasting && (
                    <div className="mt-2 space-y-1.5">
                      <textarea
                        value={profPaste}
                        onChange={(e) => setProfPaste(e.target.value)}
                        placeholder="Indsæt hele dit liste-export her (GW-app, WTC eller NewRecruit) — vi matcher den til en arketype i feltet, eller opretter den som ny arketype hvis intet matcher..."
                        className="w-full h-24 bg-[#1a1a22] border border-white/[0.14] rounded-lg p-2 text-[10px] text-[#e8e8f0] placeholder:text-[#8888a0] outline-none resize-none font-mono focus:border-[#a855f7]"
                      />
                      <button
                        onClick={matchProfilePaste}
                        disabled={!profPaste.trim()}
                        className="text-[11px] font-medium text-white bg-[#a855f7] hover:bg-[#9333ea] disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-md transition-colors"
                      >
                        Match til arketype
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Live game */}
            <div className="rounded-xl border border-[rgba(34,197,94,0.25)] bg-[rgba(34,197,94,0.03)] p-4">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-[#e8e8f0]">Din kamp nu</h2>
                {doc?.activeSessionId && (
                  <span className="text-[9px] text-[#4ade80] bg-[rgba(34,197,94,0.12)] px-2 py-0.5 rounded-full animate-pulse">LIVE</span>
                )}
              </div>
              {liveMatchup ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: liveMatchup.aDisposition ? DISP_STYLES[liveMatchup.aDisposition].color : "#8888a0" }} />
                      <span className="text-[13px] font-semibold text-[#4ade80]">{liveMatchup.aFaction}</span>
                    </div>
                    <span className="text-[11px] text-[#8888a0]">vs</span>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: liveMatchup.bDisposition ? DISP_STYLES[liveMatchup.bDisposition].color : "#8888a0" }} />
                      <span className="text-[13px] font-semibold text-[#e8e8f0]">{liveMatchup.bFaction}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-[#8888a0] flex-wrap">
                    <span className="bg-[#22222e] px-1.5 py-0.5 rounded">{liveMatchup.module}</span>
                    {liveMatchup.aDetachments?.length ? <span>{liveMatchup.aDetachments.join(", ")}</span> : null}
                    {liveMatchup.estimate > 0 && (
                      <span className="flex items-center gap-1">
                        Estimat: <BPChip v={liveMatchup.estimate + (liveMatchup.tableAdj ?? 0)} />
                        {(liveMatchup.tableAdj ?? 0) !== 0 && (
                          <span className="text-[9px] text-[#facc15]">(bord {liveMatchup.tableAdj! > 0 ? "+" : ""}{liveMatchup.tableAdj})</span>
                        )}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      Live: <span className="text-[#e8e8f0] font-bold">{liveMatchup.aVP ?? 0}</span>–<span className="text-[#e8e8f0] font-bold">{liveMatchup.bVP ?? 0}</span> VP
                      <span className="text-[#8888a0]">(runde {liveMatchup.round ?? 1}/5)</span>
                    </span>
                  </div>
                  {liveMatchup.layoutPage && (
                    <details>
                      <summary className="text-[10px] text-[#a855f7] cursor-pointer hover:text-[#c084fc]">Vis layout</summary>
                      <img src={getLayoutImage(liveMatchup.layoutPage)} alt="Layout" className="mt-2 rounded-lg border border-white/[0.08] w-full max-w-sm" />
                    </details>
                  )}
                </div>
              ) : currentRound?.status === "pairing" ? (
                <p className="text-[12px] text-[#8888a0]">Kaptajnen laver pairings — din kamp dukker op her når den er sat.</p>
              ) : (
                <p className="text-[12px] text-[#8888a0]">Ingen aktiv kamp lige nu.</p>
              )}
            </div>

            {!myProfile && (
              <p className="text-[11px] text-[#8888a0] px-1 -mt-2">
                Vælg din arketype ovenfor for at låse op for træningsprioritet, warmup-log og resultater.
              </p>
            )}

            {/* The prep tools only appear once you've mapped your archetype — it's
                what ties estimates and warmup calibration to your list. */}
            {myProfile && (
            <>
            {/* Practice priority: what to train against next, ranked live */}
            <div className="rounded-xl border border-white/[0.08] p-4">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h2 className="text-sm font-semibold text-[#e8e8f0]">Prioritér din træning</h2>
                <span className="text-[10px] text-[#8888a0]">top 10 · {myFaction}</span>
                <Link href="/stats" className="ml-auto text-[11px] text-[#a855f7] hover:text-[#c084fc] transition-colors">Feltets stats →</Link>
              </div>
              <p className="text-[10px] text-[#8888a0] mb-3">
                Har du kun ~10 træningskampe før WTC? Her er de arketyper der giver mest igen — vægtet efter hvor udbredt arketypen er (Tier 2/3-lande tæller ekstra), hvor tæt/svær din matchup er, og om du mangler at teste den. Opdateres løbende når estimater kommer ind. Tryk på en for at vælge den i loggen nedenfor.
              </p>
              {practiceTop.length === 0 ? (
                <p className="text-[11px] text-[#8888a0]">Ingen arketyper i feltet endnu — eller vælg din hær ovenfor.</p>
              ) : (
                <div className="space-y-1">
                  {practiceTop.map((p, i) => {
                    const disp = p.c.rep.list.disposition;
                    const color = disp ? DISP_STYLES[disp].color : "#8888a0";
                    const label = `${p.c.rep.list.faction} — ${(p.c.rep.list.detachments || []).join(", ")}`;
                    const uniqCountries = [...new Set(p.countries)];
                    return (
                      <button
                        key={p.ci}
                        onClick={() => {
                          setWuCluster(String(p.ci));
                          document.getElementById("warmup-log")?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                        title={`${disp ? disp + " · " : ""}${uniqCountries.join(", ")}`}
                        className={`w-full flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${wuCluster === String(p.ci) ? "border-[#a855f7]/60 bg-[#a855f7]/10" : "border-white/[0.05] hover:border-[#a855f7]/40"}`}
                      >
                        <span className="text-[11px] font-bold text-[#8888a0] w-4 shrink-0 tabular-nums">{i + 1}</span>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-[11px] text-[#e8e8f0] flex-1 min-w-0 truncate">{label}</span>
                        <span className="text-[10px] text-[#8888a0] shrink-0 tabular-nums whitespace-nowrap" title="lister i feltet · heraf Tier 2/3">
                          {p.fieldCount}×{p.t23 > 0 && <span className="text-[#c084fc]"> ·{p.t23} T2/3</span>}
                        </span>
                        {p.est !== null ? <BPChip v={p.est} /> : <span className="w-8 text-center text-[11px] text-[#44445a]" title="ikke estimeret endnu">?</span>}
                        <span className="w-11 shrink-0 text-right text-[9px] whitespace-nowrap">
                          {p.unsure && <span title="markeret usikker (🧪)">🧪 </span>}
                          {p.gamesOn === 0 ? <span className="text-[#facc15]" title="ingen testkampe på din liste endnu">0 spil</span> : <span className="text-[#4ade80]" title="testkampe spillet på din liste">{p.gamesOn}g</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Warmup prep: log practice games vs archetypes, compare to estimates */}
            <div id="warmup-log" className="rounded-xl border border-white/[0.08] p-4">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h2 className="text-sm font-semibold text-[#e8e8f0]">Warmup-kampe</h2>
                <Link href="/warmups" className="text-[11px] text-[#a855f7] hover:text-[#c084fc] transition-colors ml-auto order-last">
                  Hele holdet →
                </Link>
                {warmupStats && (
                  <span className="text-[10px] text-[#8888a0]">
                    {warmupStats.n} med estimat · snit{" "}
                    <span className={`font-bold ${Math.abs(warmupStats.avg) <= 1 ? "text-[#4ade80]" : warmupStats.avg > 0 ? "text-[#facc15]" : "text-[#f87171]"}`}>
                      {warmupStats.avg > 0 ? "+" : ""}{warmupStats.avg.toFixed(1)}
                    </span>{" "}
                    (±{warmupStats.abs.toFixed(1)})
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[#8888a0] mb-3">
                Log dine træningskampe mod arketyper — så ser du før WTC om dine resultater matcher dine estimater.
              </p>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <select
                  value={wuCluster}
                  onChange={(e) => setWuCluster(e.target.value)}
                  className="flex-1 min-w-[200px] bg-[#1a1a22] border border-white/[0.14] rounded-lg px-2 py-1.5 text-[11px] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
                >
                  <option value="">Vælg arketype…</option>
                  {clusterOptions.map(({ i, label, title }) => (
                    <option key={i} value={i} title={title}>{label}</option>
                  ))}
                </select>
                {wuSelected && (
                  <span className="flex items-center gap-1 text-[11px] text-[#8888a0]">
                    Estimat:{" "}
                    {wuEstimate !== null ? <BPChip v={wuEstimate} /> : <span className="text-[#44445a]">—</span>}
                  </span>
                )}
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={wuActual}
                  onChange={(e) => setWuActual(e.target.value)}
                  placeholder="BP"
                  className="w-16 bg-[#1a1a22] border border-white/[0.14] rounded-lg px-2 py-1.5 text-[11px] text-[#e8e8f0] placeholder:text-[#8888a0] outline-none focus:border-[#a855f7]"
                />
                <input
                  type="date"
                  value={wuDate}
                  onChange={(e) => setWuDate(e.target.value)}
                  className="bg-[#1a1a22] border border-white/[0.14] rounded-lg px-2 py-1.5 text-[11px] text-[#e8e8f0] outline-none focus:border-[#a855f7]"
                />
                <button
                  onClick={logWarmup}
                  disabled={!wuSelected || wuActual.trim() === ""}
                  className="text-[11px] font-medium text-white bg-[#a855f7] hover:bg-[#9333ea] disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-md transition-colors"
                >
                  Log kamp
                </button>
              </div>
              <input
                type="text"
                value={wuNotes}
                onChange={(e) => setWuNotes(e.target.value)}
                placeholder="Note (valgfri) — hvad gik galt/godt, terræn, missions..."
                className="w-full bg-[#1a1a22] border border-white/[0.14] rounded-lg px-2 py-1.5 text-[11px] text-[#e8e8f0] placeholder:text-[#8888a0] outline-none focus:border-[#a855f7] mb-3"
              />
              {myWarmups.length === 0 ? (
                <p className="text-[11px] text-[#8888a0]">Ingen warmup-kampe logget endnu.</p>
              ) : (
                <div className="space-y-1">
                  {myWarmups.map((g) => {
                    const delta = g.currentEstimate !== null ? g.actual - g.currentEstimate : null;
                    return (
                      <div key={g.id} className="rounded-lg border border-white/[0.05] px-2.5 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-[#8888a0] shrink-0 w-16">{g.date.slice(5)}</span>
                          <span
                            className="text-[11px] flex-1 min-w-0 truncate"
                            title={
                              g.own
                                ? `${g.own.faction} — ${(g.own.detachments || []).join(", ")}\nvs\n${g.faction} — ${(g.detachments || []).join(", ")}`
                                : undefined
                            }
                          >
                            {g.own && (
                              <span className="text-[#8888a0]">
                                {g.own.faction}
                                {g.own.detachments?.length ? ` (${g.own.detachments.join(", ")})` : ""}{" "}
                              </span>
                            )}
                            <span className="text-[#8888a0] font-semibold">vs</span>{" "}
                            <span className="text-[#e8e8f0]">{g.faction}</span>
                            <span className="text-[#8888a0]"> · {(g.detachments || []).join(", ")}</span>
                          </span>
                          {g.currentEstimate !== null ? (
                            <span
                              title={
                                g.estimate !== null && g.estimate !== g.currentEstimate
                                  ? `Estimat da kampen blev logget: ${g.estimate}`
                                  : "Nuværende estimat for arketypen"
                              }
                            >
                              <BPChip v={g.currentEstimate} />
                            </span>
                          ) : (
                            <span className="w-8 text-center text-[10px] text-[#44445a]">—</span>
                          )}
                          <span className="text-[9px] text-[#8888a0]">→</span>
                          <BPChip v={g.actual} big />
                          {delta !== null && (
                            <span className={`text-[11px] font-bold w-8 text-right ${Math.abs(delta) <= 1 ? "text-[#8888a0]" : delta > 0 ? "text-[#4ade80]" : "text-[#f87171]"}`}>
                              {delta > 0 ? "+" : ""}{delta}
                            </span>
                          )}
                          <button
                            onClick={() => {
                              if (!confirm("Slet denne warmup-kamp?")) return;
                              if (myIdx !== null) deleteWarmupGame(activeSlug, myIdx, g.id).catch(() => {});
                            }}
                            title="Slet warmup-kamp"
                            className="text-[11px] text-[#8888a0] hover:text-red-400 shrink-0 transition-colors"
                          >
                            ×
                          </button>
                        </div>
                        {g.notes && (
                          <p className="text-[10px] text-[#8888a0] mt-0.5 pl-[72px] break-words">{g.notes}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Your calibration */}
            {calibration && (
              <div className="rounded-xl border border-white/[0.08] p-4">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-sm font-semibold text-[#e8e8f0]">Din kalibrering</h2>
                  <span className="text-[10px] text-[#8888a0]">{calibration.n} kampe</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl font-bold ${calibration.mad <= 1.5 ? "text-[#4ade80]" : calibration.mad <= 3 ? "text-[#facc15]" : "text-[#f87171]"}`}>
                    {calibration.mad.toFixed(1)}
                  </span>
                  <span className="text-[11px] text-[#8888a0]">BP gns. afvigelse pr. kamp (uanset retning)</span>
                </div>
                <p className="text-[10px] text-[#8888a0] mt-1">
                  {calibration.mad <= 1.5
                    ? "Skarpe estimater — du rammer tæt på."
                    : calibration.mad <= 3
                      ? "Rimeligt, men der er spredning i træfsikkerheden."
                      : "Estimaterne rammer langt fra — kampene svinger meget over og under."}
                </p>
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/[0.06] text-[10px] text-[#8888a0]">
                  <span>
                    Tendens{" "}
                    <b className={Math.abs(calibration.bias) <= 1 ? "text-[#8888a0]" : calibration.bias > 0 ? "text-[#4ade80]" : "text-[#f87171]"}>
                      {calibration.bias > 0 ? "+" : ""}{calibration.bias.toFixed(1)}
                    </b>{" "}
                    {Math.abs(calibration.bias) <= 1 ? "(ingen skævhed)" : calibration.bias > 0 ? "(underestimerer)" : "(overestimerer)"}
                  </span>
                  <span>
                    · Værste <b className="text-[#e8e8f0]">{calibration.worst > 0 ? "+" : ""}{calibration.worst}</b> BP
                  </span>
                </div>
              </div>
            )}

            {/* Your results — tournament games bridged from coaching sessions */}
            <div className="rounded-xl border border-white/[0.08] p-4">
              <h2 className="text-sm font-semibold text-[#e8e8f0]">Dine turneringskampe</h2>
              <p className="text-[10px] text-[#8888a0] mb-3">Automatisk hentet fra spillede runder — estimat fra landets matrix, resultat fra coaching-sessionen.</p>
              {myResults.length === 0 ? (
                <p className="text-[11px] text-[#8888a0]">Ingen færdigspillede kampe endnu.</p>
              ) : (
                <div className="space-y-1">
                  {myResults.map((r) => (
                    <div key={r.round} className="flex items-center gap-2 rounded-lg border border-white/[0.05] px-2.5 py-1.5">
                      <span className="text-[10px] font-semibold text-[#8888a0] bg-[#22222e] px-1.5 py-0.5 rounded shrink-0">R{r.round}</span>
                      <span className="text-[11px] text-[#e8e8f0] flex-1 min-w-0 truncate" title={`${r.theirFaction}${r.theirDetachments.length ? ` — ${r.theirDetachments.join(", ")}` : ""}${r.theirDisposition ? ` [${r.theirDisposition}]` : ""}`}>
                        vs {r.opponentTeam} · {r.theirFaction}
                        {r.theirDetachments.length > 0 && <span className="text-[#8888a0]"> {r.theirDetachments.join(", ")}</span>}
                      </span>
                      {r.estimate !== null ? <BPChip v={r.estimate} /> : <span className="w-8 text-center text-[10px] text-[#44445a]">—</span>}
                      <span className="text-[9px] text-[#8888a0]">→</span>
                      <BPChip v={r.actual} big />
                      {r.delta !== null && (
                        <span className={`text-[11px] font-bold w-8 text-right ${Math.abs(r.delta) <= 1 ? "text-[#8888a0]" : r.delta > 0 ? "text-[#4ade80]" : "text-[#f87171]"}`}>
                          {r.delta > 0 ? "+" : ""}{r.delta}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Your estimates progress */}
            <div className="rounded-xl border border-white/[0.08] p-4">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-sm font-semibold text-[#e8e8f0]">Dine estimater</h2>
                <Link href="/estimates" className="ml-auto text-[11px] text-[#a855f7] hover:text-[#c084fc] transition-colors">Udfyld →</Link>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-[#a855f7]" style={{ width: `${myProgress.total ? Math.round(100 * myProgress.filled / myProgress.total) : 0}%` }} />
                </div>
                <span className="text-[11px] text-[#8888a0]">{myProgress.filled}/{myProgress.total}</span>
              </div>
            </div>
            </>
            )}
          </>
        )}
      </div>
    </>
  );
}
