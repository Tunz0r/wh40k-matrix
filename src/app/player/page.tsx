"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { TEAM_SLUG, TEAM_NAME } from "@/lib/team";
import { DISP_STYLES } from "@/lib/data";
import {
  subscribeToTournament,
  addWarmupGame,
  deleteWarmupGame,
  savePlayerProfile,
  type TournamentDoc,
  type TournamentRound,
  type WarmupGame,
  type PlayerProfile,
} from "@/lib/tournament-db";
import {
  subscribeToOpponents,
  estimateStyle,
  clusterLists,
  lookupEstimate,
  listSimilarity,
  slugifyTeam,
  archetypeId,
  fetchArchetypeBank,
  snapshotSlotCells,
  switchSlotArchetype,
  SIMILARITY_THRESHOLD,
  type OpponentMap,
  type ListCluster,
  type ClusterMember,
  type OpponentList,
  type ArchetypeDescriptor,
} from "@/lib/estimates-db";
import { parseTeamLists, formatUnitsLines } from "@/lib/list-parser";
import {
  fetchSession,
  subscribeToSession,
  type SessionData,
  type MatchupData,
} from "@/lib/session";
import { vpToBP } from "@/lib/scoring";
import { getLayoutImage } from "@/lib/layouts";

const MY_ARMY_KEY = "wtc-my-army";

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

// Find the matchup in a session that belongs to our army (matched by faction).
function myMatchup(session: SessionData | null, faction: string): MatchupData | null {
  if (!session) return null;
  return (session.matchups || []).find((m) => m.aFaction === faction) || null;
}

export default function PlayerPage() {
  const [doc, setDoc] = useState<TournamentDoc | null>(null);
  const [opponents, setOpponents] = useState<OpponentMap>({});
  const [myIdx, setMyIdx] = useState<number | null>(null);
  const [activeSession, setActiveSession] = useState<SessionData | null>(null);
  const [pastSessions, setPastSessions] = useState<Record<string, SessionData>>({});

  useEffect(() => {
    try {
      const u1 = subscribeToTournament(TEAM_SLUG, setDoc);
      const u2 = subscribeToOpponents(setOpponents);
      return () => { u1(); u2(); };
    } catch {}
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(MY_ARMY_KEY);
    if (saved !== null) setMyIdx(Number(saved));
  }, []);

  function pickArmy(i: number) {
    setMyIdx(i);
    localStorage.setItem(MY_ARMY_KEY, String(i));
  }

  const armies = useMemo(() => doc?.roster?.armies || [], [doc]);
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

  // My results across completed rounds
  const myResults = useMemo(() => {
    const rows: { round: number; opponent: string; theirFaction: string; estimate: number | null; actual: number; delta: number | null }[] = [];
    for (const r of completedRounds) {
      const m = myMatchup(pastSessions[r.sessionId], myFaction);
      if (!m || !m.final) continue;
      const diff = (m.aVP ?? 0) - (m.bVP ?? 0);
      const bp = vpToBP(diff);
      const actual = diff >= 0 ? bp.winner : bp.loser;
      const estimate = m.estimate && m.estimate > 0 ? m.estimate + (m.tableAdj ?? 0) : null;
      rows.push({
        round: r.number,
        opponent: r.opponentName,
        theirFaction: m.bFaction,
        estimate,
        actual,
        delta: estimate !== null ? actual - estimate : null,
      });
    }
    return rows;
  }, [completedRounds, pastSessions, myFaction]);

  const calibration = useMemo(() => {
    const deltas = myResults.map((r) => r.delta).filter((d): d is number => d !== null);
    if (!deltas.length) return null;
    return {
      n: deltas.length,
      avg: deltas.reduce((a, b) => a + b, 0) / deltas.length,
      abs: deltas.reduce((a, b) => a + Math.abs(b), 0) / deltas.length,
    };
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

  // The live cluster matching a profile (best similarity ≥ threshold).
  const profileCluster = useMemo(() => {
    if (!myProfile) return null;
    const asList: OpponentList = {
      faction: myProfile.faction,
      detachments: myProfile.detachments || [],
      disposition: (myProfile.disposition ?? null) as OpponentList["disposition"],
      ...(myProfile.units?.length ? { units: myProfile.units } : {}),
    };
    let best: { c: ListCluster; sim: number } | null = null;
    for (const c of clusters) {
      const sim = listSimilarity(asList, c.rep.list);
      if (sim >= SIMILARITY_THRESHOLD && (!best || sim > best.sim)) best = { c, sim };
    }
    return best?.c ?? null;
  }, [myProfile, clusters]);

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
  async function saveProfileFromCluster(cluster: ListCluster, ownUnits?: string[]) {
    if (myIdx === null || profBusy) return;
    const profile: PlayerProfile = {
      faction: cluster.rep.list.faction,
      detachments: cluster.rep.list.detachments || [],
      disposition: cluster.rep.list.disposition ?? null,
      ...(ownUnits?.length ? { units: ownUnits } : {}),
    };
    const newDesc = profileDescriptor(profile);
    const oldDesc = myProfile ? profileDescriptor(myProfile) : null;
    const label = `${newDesc.faction} — ${newDesc.detachments.join(", ")}`;
    const ownCount = Object.keys(snapshotSlotCells(opponents, myIdx)).length;
    setProfBusy(true);
    try {
      if (oldDesc && archetypeId(oldDesc) !== archetypeId(newDesc)) {
        const bank = await fetchArchetypeBank(archetypeId(newDesc));
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
        const bank = await fetchArchetypeBank(archetypeId(newDesc));
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
      const res = await switchSlotArchetype(opponents, myIdx, oldDesc, newDesc, lockedSlugs);
      await savePlayerProfile(TEAM_SLUG, myIdx, profile);
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
      await switchSlotArchetype(opponents, myIdx, profileDescriptor(myProfile), null, lockedSlugs);
      await savePlayerProfile(TEAM_SLUG, myIdx, null);
    } catch {
      alert("Kunne ikke nulstille — tjek Firebase.");
    } finally {
      setProfBusy(false);
    }
  }

  // Paste own list → parse → must land on a field archetype (≥ threshold).
  function matchProfilePaste() {
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
    if (!best) {
      alert(
        `Ingen arketype i feltet matcher listen (≥${SIMILARITY_THRESHOLD}% lighed) — vælg den nærmeste arketype manuelt i stedet.`
      );
      return;
    }
    saveProfileFromCluster((best as { c: ListCluster }).c, parsed.units);
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
      estimate: wuEstimate,
      actual,
      ...(wuNotes.trim() ? { notes: wuNotes.trim() } : {}),
    };
    try {
      await addWarmupGame(TEAM_SLUG, myIdx, game);
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
            <span className="text-[#4ade80] ml-2 text-sm font-normal">— {TEAM_NAME}</span>
          </h1>
          {myArmy && (
            <span className="text-[12px] text-[#8888a0]">
              {myArmy.player ? `${myArmy.player} · ` : ""}{myFaction}
            </span>
          )}
        </div>
      </header>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
        {/* Army picker */}
        <div className="rounded-xl border border-white/[0.08] p-4">
          <h2 className="text-xs font-semibold text-[#8888a0] uppercase tracking-wider mb-2">Vælg din hær</h2>
          {armies.length === 0 ? (
            <p className="text-[11px] text-[#8888a0]">Intet roster endnu — bed kaptajnen opsætte holdet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {armies.map((a, i) => (
                <button
                  key={i}
                  onClick={() => pickArmy(i)}
                  className={`text-left rounded-lg border p-2 transition-colors ${myIdx === i ? "border-[#a855f7]/60 bg-[#a855f7]/10" : "border-white/[0.08] hover:border-white/[0.18]"}`}
                >
                  <div className="text-[11px] text-[#e8e8f0] font-medium truncate">{a.faction}</div>
                  <div className="text-[9px] text-[#8888a0] truncate">{a.player || "—"}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {myIdx !== null && myArmy && (
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
                        placeholder="Indsæt hele dit liste-export her (GW-app, WTC eller NewRecruit) — vi matcher den til en arketype i feltet..."
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

            {/* Warmup prep: log practice games vs archetypes, compare to estimates */}
            <div className="rounded-xl border border-white/[0.08] p-4">
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
                          <span className="text-[11px] text-[#e8e8f0] flex-1 min-w-0 truncate">
                            vs {g.faction}
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
                              if (myIdx !== null) deleteWarmupGame(TEAM_SLUG, myIdx, g.id).catch(() => {});
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
                  <span className={`text-2xl font-bold ${Math.abs(calibration.avg) <= 1 ? "text-[#4ade80]" : calibration.avg > 0 ? "text-[#facc15]" : "text-[#f87171]"}`}>
                    {calibration.avg > 0 ? "+" : ""}{calibration.avg.toFixed(1)}
                  </span>
                  <span className="text-[11px] text-[#8888a0]">snit-afvigelse (±{calibration.abs.toFixed(1)})</span>
                </div>
                <p className="text-[10px] text-[#8888a0] mt-1">
                  {calibration.avg > 1 ? "Du spiller bedre end dine estimater — vær lidt mere optimistisk." : calibration.avg < -1 ? "Dine estimater er for optimistiske — skru lidt ned." : "Godt kalibreret."}
                </p>
              </div>
            )}

            {/* Your results */}
            <div className="rounded-xl border border-white/[0.08] p-4">
              <h2 className="text-sm font-semibold text-[#e8e8f0] mb-3">Dine resultater</h2>
              {myResults.length === 0 ? (
                <p className="text-[11px] text-[#8888a0]">Ingen færdigspillede kampe endnu.</p>
              ) : (
                <div className="space-y-1">
                  {myResults.map((r) => (
                    <div key={r.round} className="flex items-center gap-2 rounded-lg border border-white/[0.05] px-2.5 py-1.5">
                      <span className="text-[10px] font-semibold text-[#8888a0] bg-[#22222e] px-1.5 py-0.5 rounded shrink-0">R{r.round}</span>
                      <span className="text-[11px] text-[#e8e8f0] flex-1 min-w-0 truncate">vs {r.opponent} · {r.theirFaction}</span>
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
      </div>
    </>
  );
}
