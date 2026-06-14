"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  type Disposition,
  DISP_STYLES,
  MISSIONS,
} from "@/lib/data";
import {
  type RosterExport,
  type RosterArmy,
  deserializeRoster,
} from "@/lib/roster";

type Phase =
  | "setup"
  | "skirmish1-defender"
  | "skirmish1-attackers"
  | "skirmish1-choice"
  | "skirmish2-defender"
  | "skirmish2-attackers"
  | "skirmish2-choice"
  | "main-defender"
  | "main-attackers"
  | "main-choice"
  | "done";

interface Matchup {
  a: RosterArmy;
  b: RosterArmy;
  module: string;
  aIsDefender: boolean;
}

interface TeamState {
  roster: RosterExport | null;
  importText: string;
}

function DispBadge({ d }: { d: Disposition | null }) {
  if (!d) return <span className="text-[10px] text-[#8888a0]">—</span>;
  const s = DISP_STYLES[d];
  return (
    <span
      className="text-[9px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {d}
    </span>
  );
}

function ArmyCard({
  army,
  index,
  selected,
  disabled,
  paired,
  onClick,
  label,
}: {
  army: RosterArmy;
  index: number;
  selected?: boolean;
  disabled?: boolean;
  paired?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  const s = army.disposition ? DISP_STYLES[army.disposition] : null;
  return (
    <button
      onClick={onClick}
      disabled={disabled || paired}
      className={`w-full text-left rounded-lg border transition-colors p-2.5 ${
        paired
          ? "border-white/[0.04] opacity-30 cursor-default"
          : selected
            ? "border-[#a855f7]/60 bg-[#a855f7]/10"
            : disabled
              ? "border-white/[0.06] opacity-40 cursor-not-allowed"
              : "border-white/[0.08] hover:border-white/[0.18] cursor-pointer"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[#8888a0] w-4 shrink-0">{index + 1}.</span>
        {s && (
          <div
            className="w-1 self-stretch rounded-full shrink-0"
            style={{ background: s.color }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-[#e8e8f0] font-medium truncate">
            {army.faction}
          </div>
          <div className="text-[10px] text-[#8888a0] truncate">
            {army.detachments.join(", ")}
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <DispBadge d={army.disposition} />
          {label && (
            <span className="text-[9px] font-semibold text-amber-400">{label}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function MissionInfo({ a, b }: { a: Disposition; b: Disposition }) {
  const missionA = MISSIONS[a]?.vs[b];
  const missionB = MISSIONS[b]?.vs[a];
  if (!missionA || !missionB) return null;
  return (
    <div className="text-[10px] text-[#8888a0] mt-1 space-y-0.5">
      <div>
        <DispBadge d={a} /> → {missionA.name}: {missionA.scoring}
      </div>
      <div>
        <DispBadge d={b} /> → {missionB.name}: {missionB.scoring}
      </div>
    </div>
  );
}

const PHASE_LABELS: Record<Phase, string> = {
  setup: "Opsætning",
  "skirmish1-defender": "Initial Skirmish 1 — Vælg Defender",
  "skirmish1-attackers": "Initial Skirmish 1 — Vælg Attackers",
  "skirmish1-choice": "Initial Skirmish 1 — Vælg matchup",
  "skirmish2-defender": "Initial Skirmish 2 — Vælg Defender",
  "skirmish2-attackers": "Initial Skirmish 2 — Vælg Attackers",
  "skirmish2-choice": "Initial Skirmish 2 — Vælg matchup",
  "main-defender": "Main Engagement — Vælg Defender",
  "main-attackers": "Main Engagement — Vælg Attackers",
  "main-choice": "Main Engagement — Vælg matchup",
  done: "Pairings færdige",
};

export default function PairingsPage() {
  const [teamA, setTeamA] = useState<TeamState>({ roster: null, importText: "" });
  const [teamB, setTeamB] = useState<TeamState>({ roster: null, importText: "" });
  const [phase, setPhase] = useState<Phase>("setup");
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [round, setRound] = useState(1);

  // Per-module state
  const [defenderA, setDefenderA] = useState<number | null>(null);
  const [defenderB, setDefenderB] = useState<number | null>(null);
  const [attackersA, setAttackersA] = useState<number[]>([]);
  const [attackersB, setAttackersB] = useState<number[]>([]);
  const [choiceA, setChoiceA] = useState<number | null>(null);
  const [choiceB, setChoiceB] = useState<number | null>(null);
  const [revealStep, setRevealStep] = useState(0);

  const pairedA = useMemo(
    () => new Set(matchups.map((m) => teamA.roster?.armies.indexOf(m.a)).filter((i) => i !== undefined && i >= 0)),
    [matchups, teamA.roster]
  );
  const pairedB = useMemo(
    () => new Set(matchups.map((m) => teamB.roster?.armies.indexOf(m.b)).filter((i) => i !== undefined && i >= 0)),
    [matchups, teamB.roster]
  );

  const remainingA = useMemo(
    () => teamA.roster?.armies.filter((_, i) => !pairedA.has(i)).map((a, _, arr) => ({ army: a, origIdx: teamA.roster!.armies.indexOf(a) })) ?? [],
    [teamA.roster, pairedA]
  );
  const remainingB = useMemo(
    () => teamB.roster?.armies.filter((_, i) => !pairedB.has(i)).map((a, _, arr) => ({ army: a, origIdx: teamB.roster!.armies.indexOf(a) })) ?? [],
    [teamB.roster, pairedB]
  );

  function importRoster(team: "A" | "B") {
    const state = team === "A" ? teamA : teamB;
    const roster = deserializeRoster(state.importText.trim());
    if (!roster) {
      alert("Ugyldigt roster format. Kopiér eksport-koden fra Roster Builder.");
      return;
    }
    if (roster.armies.length !== 8) {
      alert(`Roster skal have 8 hære (fandt ${roster.armies.length}).`);
      return;
    }
    if (team === "A") setTeamA({ roster, importText: "" });
    else setTeamB({ roster, importText: "" });
  }

  function startPairings() {
    if (!teamA.roster || !teamB.roster) return;
    setMatchups([]);
    setPhase("skirmish1-defender");
    resetModuleState();
  }

  function resetModuleState() {
    setDefenderA(null);
    setDefenderB(null);
    setAttackersA([]);
    setAttackersB([]);
    setChoiceA(null);
    setChoiceB(null);
    setRevealStep(0);
  }

  function currentModuleName(): string {
    if (phase.startsWith("skirmish1")) return "Initial Skirmish 1";
    if (phase.startsWith("skirmish2")) return "Initial Skirmish 2";
    if (phase.startsWith("main")) return "Main Engagement";
    return "";
  }

  function confirmDefenders() {
    if (defenderA === null || defenderB === null) return;
    setRevealStep(1);
  }

  function proceedToAttackers() {
    const prefix = phase.replace("-defender", "") as string;
    setPhase(`${prefix}-attackers` as Phase);
    setRevealStep(0);
  }

  function confirmAttackers() {
    if (attackersA.length !== 2 || attackersB.length !== 2) return;
    setRevealStep(1);
  }

  function proceedToChoice() {
    const prefix = phase.replace("-attackers", "") as string;
    setPhase(`${prefix}-choice` as Phase);
    setRevealStep(0);
  }

  function confirmChoice() {
    if (choiceA === null || choiceB === null) return;
    if (!teamA.roster || !teamB.roster) return;

    const armiesA = teamA.roster.armies;
    const armiesB = teamB.roster.armies;
    const moduleName = currentModuleName();

    // Matchup 1: Team A's defender vs chosen attacker from B
    const m1: Matchup = {
      a: armiesA[defenderA!],
      b: armiesB[choiceA!],
      module: moduleName,
      aIsDefender: true,
    };
    // Matchup 2: Team B's defender vs chosen attacker from A
    const m2: Matchup = {
      a: armiesA[choiceB!],
      b: armiesB[defenderB!],
      module: moduleName,
      aIsDefender: false,
    };

    const newMatchups = [...matchups, m1, m2];

    // For Main Engagement: refused attackers play each other
    if (phase.startsWith("main")) {
      const refusedA = attackersA.find((i) => i !== choiceB!)!;
      const refusedB = attackersB.find((i) => i !== choiceA!)!;
      const m3: Matchup = {
        a: armiesA[refusedA],
        b: armiesB[refusedB],
        module: "Main Engagement (Refused)",
        aIsDefender: false,
      };
      newMatchups.push(m3);
    }

    setMatchups(newMatchups);
    resetModuleState();

    // Determine next phase
    if (phase.startsWith("skirmish1")) {
      setPhase("skirmish2-defender");
    } else if (phase.startsWith("skirmish2")) {
      setPhase("main-defender");
    } else if (phase.startsWith("main")) {
      // Champion system: remaining players
      const usedA = new Set(newMatchups.map((m) => armiesA.indexOf(m.a)));
      const usedB = new Set(newMatchups.map((m) => armiesB.indexOf(m.b)));
      const champA = armiesA.find((_, i) => !usedA.has(i));
      const champB = armiesB.find((_, i) => !usedB.has(i));
      if (champA && champB) {
        newMatchups.push({
          a: champA,
          b: champB,
          module: "Champion",
          aIsDefender: false,
        });
        setMatchups(newMatchups);
      }
      setPhase("done");
    }
  }

  function toggleAttacker(team: "A" | "B", idx: number) {
    if (team === "A") {
      setAttackersA((prev) =>
        prev.includes(idx) ? prev.filter((i) => i !== idx) : prev.length < 2 ? [...prev, idx] : prev
      );
    } else {
      setAttackersB((prev) =>
        prev.includes(idx) ? prev.filter((i) => i !== idx) : prev.length < 2 ? [...prev, idx] : prev
      );
    }
  }

  function resetAll() {
    setTeamA({ roster: null, importText: "" });
    setTeamB({ roster: null, importText: "" });
    setPhase("setup");
    setMatchups([]);
    setRound(1);
    resetModuleState();
  }

  const layoutLabel = (() => {
    const layouts = ["A", "B", "C"];
    return layouts[(round - 1) % 3];
  })();

  // --- RENDER ---

  return (
    <>
      <header className="px-4 sm:px-6 py-6 pb-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-2 text-xs text-[#8888a0] mb-2">
          <Link href="/" className="hover:text-[#e8e8f0] transition-colors">
            Matrix
          </Link>
          <span>/</span>
          <Link href="/roster" className="hover:text-[#e8e8f0] transition-colors">
            Roster
          </Link>
          <span>/</span>
          <span className="text-[#e8e8f0]">Mock Pairings</span>
        </div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-[#e8e8f0] tracking-tight">
            Mock Pairings — 8 mands hold
          </h1>
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-[#8888a0]">Runde:</label>
            <select
              value={round}
              onChange={(e) => setRound(Number(e.target.value))}
              className="bg-[#1a1a22] text-[#e8e8f0] border border-white/[0.14] rounded px-2 py-0.5 text-xs cursor-pointer outline-none"
            >
              {[1, 2, 3, 4, 5, 6].map((r) => (
                <option key={r} value={r}>
                  Runde {r}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-[#8888a0] mt-1">
          Initial Skirmish ×2 → Main Engagement → Champion · Layout{" "}
          {layoutLabel} for refused/champion matchups
        </p>
      </header>

      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        {/* Setup phase */}
        {phase === "setup" && (
          <div className="grid md:grid-cols-2 gap-6">
            {(["A", "B"] as const).map((team) => {
              const state = team === "A" ? teamA : teamB;
              const setState = team === "A" ? setTeamA : setTeamB;
              return (
                <div key={team} className="rounded-xl border border-white/[0.08] p-4">
                  <h2 className="text-sm font-semibold text-[#e8e8f0] mb-3">
                    Hold {team}
                    {state.roster && (
                      <span className="text-[#8888a0] font-normal ml-2">
                        — {state.roster.name}
                      </span>
                    )}
                  </h2>
                  {state.roster ? (
                    <>
                      <div className="space-y-1.5 mb-3">
                        {state.roster.armies.map((army, i) => (
                          <ArmyCard key={i} army={army} index={i} />
                        ))}
                      </div>
                      <button
                        onClick={() => setState({ roster: null, importText: "" })}
                        className="text-[11px] text-red-400 hover:text-red-300"
                      >
                        Fjern roster
                      </button>
                    </>
                  ) : (
                    <div>
                      <textarea
                        value={state.importText}
                        onChange={(e) =>
                          setState({ ...state, importText: e.target.value })
                        }
                        placeholder="Indsæt roster-kode her..."
                        className="w-full h-20 bg-[#1a1a22] border border-white/[0.14] rounded-lg p-3 text-xs text-[#e8e8f0] placeholder:text-[#8888a0] outline-none resize-none font-mono focus:border-[#a855f7]"
                      />
                      <button
                        onClick={() => importRoster(team)}
                        className="mt-2 text-[12px] font-medium text-[#a855f7] hover:text-[#c084fc] bg-[rgba(168,85,247,0.1)] px-3 py-1.5 rounded-md border border-[rgba(168,85,247,0.2)] transition-colors"
                      >
                        Importér roster
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {phase === "setup" && teamA.roster && teamB.roster && (
          <div className="mt-6 text-center">
            <button
              onClick={startPairings}
              className="text-sm font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-6 py-2.5 rounded-lg transition-colors"
            >
              Start pairings
            </button>
          </div>
        )}

        {/* Pairing phases */}
        {phase !== "setup" && phase !== "done" && teamA.roster && teamB.roster && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs font-semibold text-[#a855f7] bg-[rgba(168,85,247,0.1)] px-2.5 py-1 rounded-md">
                {PHASE_LABELS[phase]}
              </span>
              <span className="text-[11px] text-[#8888a0]">
                {matchups.length}/8 matchups færdige
              </span>
            </div>

            {/* Defender selection */}
            {phase.endsWith("-defender") && (
              <div>
                {revealStep === 0 ? (
                  <div className="grid md:grid-cols-2 gap-6">
                    {(["A", "B"] as const).map((team) => {
                      const roster = team === "A" ? teamA.roster! : teamB.roster!;
                      const paired = team === "A" ? pairedA : pairedB;
                      const defender = team === "A" ? defenderA : defenderB;
                      const setDef = team === "A" ? setDefenderA : setDefenderB;
                      return (
                        <div key={team}>
                          <h3 className="text-xs font-semibold text-[#8888a0] mb-2">
                            Hold {team} — vælg Defender (hemmeligt)
                          </h3>
                          <div className="space-y-1.5">
                            {roster.armies.map((army, i) => (
                              <ArmyCard
                                key={i}
                                army={army}
                                index={i}
                                selected={defender === i}
                                paired={paired.has(i)}
                                onClick={() => setDef(i)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <div className="md:col-span-2 text-center mt-2">
                      <button
                        onClick={confirmDefenders}
                        disabled={defenderA === null || defenderB === null}
                        className="text-sm font-medium text-white bg-[#a855f7] hover:bg-[#9333ea] disabled:opacity-30 disabled:cursor-not-allowed px-5 py-2 rounded-lg transition-colors"
                      >
                        Reveal Defenders
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <div className="grid md:grid-cols-2 gap-6 text-left">
                      <div>
                        <h3 className="text-xs font-semibold text-amber-400 mb-2">Hold A Defender</h3>
                        <ArmyCard army={teamA.roster!.armies[defenderA!]} index={defenderA!} selected label="DEFENDER" />
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold text-amber-400 mb-2">Hold B Defender</h3>
                        <ArmyCard army={teamB.roster!.armies[defenderB!]} index={defenderB!} selected label="DEFENDER" />
                      </div>
                    </div>
                    <button
                      onClick={proceedToAttackers}
                      className="text-sm font-medium text-white bg-[#a855f7] hover:bg-[#9333ea] px-5 py-2 rounded-lg transition-colors"
                    >
                      Videre til Attackers →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Attacker selection */}
            {phase.endsWith("-attackers") && (
              <div>
                {revealStep === 0 ? (
                  <div className="grid md:grid-cols-2 gap-6">
                    {(["A", "B"] as const).map((team) => {
                      const roster = team === "A" ? teamA.roster! : teamB.roster!;
                      const paired = team === "A" ? pairedA : pairedB;
                      const defender = team === "A" ? defenderA! : defenderB!;
                      const attackers = team === "A" ? attackersA : attackersB;
                      const oppTeam = team === "A" ? "B" : "A";
                      const oppDefender = team === "A" ? defenderB! : defenderA!;
                      const oppRoster = team === "A" ? teamB.roster! : teamA.roster!;
                      return (
                        <div key={team}>
                          <h3 className="text-xs font-semibold text-[#8888a0] mb-1">
                            Hold {team} — vælg 2 Attackers mod Hold {oppTeam}&apos;s Defender
                          </h3>
                          <div className="text-[10px] text-[#8888a0] mb-2">
                            Mål: <span className="text-[#e8e8f0]">{oppRoster.armies[oppDefender].faction}</span>
                          </div>
                          <div className="space-y-1.5">
                            {roster.armies.map((army, i) => (
                              <ArmyCard
                                key={i}
                                army={army}
                                index={i}
                                selected={attackers.includes(i)}
                                disabled={i === defender}
                                paired={paired.has(i)}
                                onClick={() => toggleAttacker(team, i)}
                                label={i === defender ? "DEFENDER" : attackers.includes(i) ? "ATTACKER" : undefined}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <div className="md:col-span-2 text-center mt-2">
                      <button
                        onClick={confirmAttackers}
                        disabled={attackersA.length !== 2 || attackersB.length !== 2}
                        className="text-sm font-medium text-white bg-[#a855f7] hover:bg-[#9333ea] disabled:opacity-30 disabled:cursor-not-allowed px-5 py-2 rounded-lg transition-colors"
                      >
                        Reveal Attackers
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <div className="grid md:grid-cols-2 gap-6 text-left">
                      {(["A", "B"] as const).map((team) => {
                        const roster = team === "A" ? teamA.roster! : teamB.roster!;
                        const attackers = team === "A" ? attackersA : attackersB;
                        return (
                          <div key={team}>
                            <h3 className="text-xs font-semibold text-amber-400 mb-2">
                              Hold {team} Attackers
                            </h3>
                            {attackers.map((i) => (
                              <div key={i} className="mb-1.5">
                                <ArmyCard army={roster.armies[i]} index={i} selected label="ATTACKER" />
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                    <button
                      onClick={proceedToChoice}
                      className="text-sm font-medium text-white bg-[#a855f7] hover:bg-[#9333ea] px-5 py-2 rounded-lg transition-colors"
                    >
                      Videre til matchup valg →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Choice: each team picks which opposing attacker their defender faces */}
            {phase.endsWith("-choice") && (
              <div>
                {revealStep === 0 ? (
                  <div className="grid md:grid-cols-2 gap-6">
                    {(["A", "B"] as const).map((team) => {
                      const defender = team === "A" ? defenderA! : defenderB!;
                      const roster = team === "A" ? teamA.roster! : teamB.roster!;
                      const oppAttackers = team === "A" ? attackersB : attackersA;
                      const oppRoster = team === "A" ? teamB.roster! : teamA.roster!;
                      const choice = team === "A" ? choiceA : choiceB;
                      const setChoice = team === "A" ? setChoiceA : setChoiceB;
                      return (
                        <div key={team}>
                          <h3 className="text-xs font-semibold text-[#8888a0] mb-1">
                            Hold {team} — hvilken modstander-attacker skal din Defender møde?
                          </h3>
                          <div className="text-[10px] text-[#8888a0] mb-2">
                            Din Defender: <span className="text-[#e8e8f0]">{roster.armies[defender].faction}</span>
                          </div>
                          <div className="space-y-1.5">
                            {oppAttackers.map((i) => (
                              <ArmyCard
                                key={i}
                                army={oppRoster.armies[i]}
                                index={i}
                                selected={choice === i}
                                onClick={() => setChoice(i)}
                                label={choice === i ? "VALGT" : undefined}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <div className="md:col-span-2 text-center mt-2">
                      <button
                        onClick={() => {
                          if (choiceA !== null && choiceB !== null) setRevealStep(1);
                        }}
                        disabled={choiceA === null || choiceB === null}
                        className="text-sm font-medium text-white bg-[#a855f7] hover:bg-[#9333ea] disabled:opacity-30 disabled:cursor-not-allowed px-5 py-2 rounded-lg transition-colors"
                      >
                        Reveal valg
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <h3 className="text-sm font-semibold text-[#e8e8f0]">Matchups fra {currentModuleName()}</h3>
                    <div className="inline-block text-left space-y-3">
                      <MatchupPreview
                        label="Matchup"
                        aArmy={teamA.roster!.armies[defenderA!]}
                        aIdx={defenderA!}
                        aRole="DEF"
                        bArmy={teamB.roster!.armies[choiceA!]}
                        bIdx={choiceA!}
                        bRole="ATK"
                      />
                      <MatchupPreview
                        label="Matchup"
                        aArmy={teamA.roster!.armies[choiceB!]}
                        aIdx={choiceB!}
                        aRole="ATK"
                        bArmy={teamB.roster!.armies[defenderB!]}
                        bIdx={defenderB!}
                        bRole="DEF"
                      />
                      {phase.startsWith("main") && (() => {
                        const refA = attackersA.find((i) => i !== choiceB!)!;
                        const refB = attackersB.find((i) => i !== choiceA!)!;
                        return (
                          <MatchupPreview
                            label="Refused Attackers"
                            aArmy={teamA.roster!.armies[refA]}
                            aIdx={refA}
                            aRole="REF"
                            bArmy={teamB.roster!.armies[refB]}
                            bIdx={refB}
                            bRole="REF"
                          />
                        );
                      })()}
                    </div>
                    <div>
                      <button
                        onClick={confirmChoice}
                        className="text-sm font-medium text-white bg-[#a855f7] hover:bg-[#9333ea] px-5 py-2 rounded-lg transition-colors"
                      >
                        Bekræft og fortsæt →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Done */}
        {phase === "done" && (
          <div>
            <h2 className="text-sm font-semibold text-[#4ade80] mb-4">
              Alle 8 matchups er færdige!
            </h2>
            <div className="space-y-3 mb-6">
              {matchups.map((m, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-white/[0.08] p-3"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-semibold text-[#8888a0] bg-[#22222e] px-1.5 py-0.5 rounded">
                      {m.module}
                    </span>
                    <span className="text-[11px] text-[#8888a0]">Bord {i + 1}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 text-right">
                      <div className="text-[12px] text-[#e8e8f0] font-medium">
                        {m.a.faction}
                      </div>
                      <div className="text-[10px] text-[#8888a0]">
                        {m.a.detachments.join(", ")}
                      </div>
                      <DispBadge d={m.a.disposition} />
                    </div>
                    <span className="text-xs font-bold text-[#8888a0]">vs</span>
                    <div className="flex-1">
                      <div className="text-[12px] text-[#e8e8f0] font-medium">
                        {m.b.faction}
                      </div>
                      <div className="text-[10px] text-[#8888a0]">
                        {m.b.detachments.join(", ")}
                      </div>
                      <DispBadge d={m.b.disposition} />
                    </div>
                  </div>
                  {m.a.disposition && m.b.disposition && (
                    <MissionInfo a={m.a.disposition} b={m.b.disposition} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setPhase("setup");
                  setMatchups([]);
                  resetModuleState();
                }}
                className="text-[12px] font-medium text-[#a855f7] hover:text-[#c084fc] bg-[rgba(168,85,247,0.1)] px-3 py-1.5 rounded-md border border-[rgba(168,85,247,0.2)] transition-colors"
              >
                Ny pairing (behold rosters)
              </button>
              <button
                onClick={resetAll}
                className="text-[12px] text-red-400 hover:text-red-300 px-3 py-1.5 transition-colors"
              >
                Reset alt
              </button>
            </div>
          </div>
        )}

        {/* Current matchups sidebar */}
        {matchups.length > 0 && phase !== "done" && (
          <div className="mt-6 border-t border-white/[0.08] pt-4">
            <h3 className="text-xs font-semibold text-[#8888a0] mb-2">
              Færdige matchups ({matchups.length}/8)
            </h3>
            <div className="space-y-2">
              {matchups.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="text-[#8888a0] w-4">{i + 1}.</span>
                  <span className="text-[#e8e8f0]">{m.a.faction}</span>
                  <DispBadge d={m.a.disposition} />
                  <span className="text-[#8888a0]">vs</span>
                  <span className="text-[#e8e8f0]">{m.b.faction}</span>
                  <DispBadge d={m.b.disposition} />
                  <span className="text-[10px] text-[#8888a0]">({m.module})</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function MatchupPreview({
  label,
  aArmy,
  aIdx,
  aRole,
  bArmy,
  bIdx,
  bRole,
}: {
  label: string;
  aArmy: RosterArmy;
  aIdx: number;
  aRole: string;
  bArmy: RosterArmy;
  bIdx: number;
  bRole: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.12] p-3 bg-[#1a1a22]">
      <div className="text-[10px] text-[#8888a0] font-semibold mb-1.5">{label}</div>
      <div className="flex items-center gap-3">
        <div className="flex-1 text-right">
          <div className="text-[11px] text-[#e8e8f0]">
            <span className="text-[9px] text-amber-400 mr-1">{aRole}</span>
            {aArmy.faction}
          </div>
          <DispBadge d={aArmy.disposition} />
        </div>
        <span className="text-[10px] font-bold text-[#8888a0]">vs</span>
        <div className="flex-1">
          <div className="text-[11px] text-[#e8e8f0]">
            {bArmy.faction}
            <span className="text-[9px] text-amber-400 ml-1">{bRole}</span>
          </div>
          <DispBadge d={bArmy.disposition} />
        </div>
      </div>
    </div>
  );
}
