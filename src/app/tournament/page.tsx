"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
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
import { getLayouts, getLayoutImage } from "@/lib/layouts";
import { createSession, type MatchupData } from "@/lib/session";

// --- Types ---

type PairingPhase =
  | "skirmish1-defender"
  | "skirmish1-attackers"
  | "skirmish1-choice"
  | "skirmish2-defender"
  | "skirmish2-attackers"
  | "skirmish2-choice"
  | "main-defender"
  | "main-attackers"
  | "main-choice";

type TournamentView =
  | "setup"
  | "overview"
  | "round-opponent"
  | "round-pairing"
  | "round-done";

interface Matchup {
  a: RosterArmy;
  b: RosterArmy;
  module: string;
  aIsDefender: boolean;
  layoutPage: number | null;
}

interface CompletedRound {
  number: number;
  opponentName: string;
  opponentRoster: RosterExport;
  matchups: Matchup[];
  sessionId: string | null;
  sessionUrl: string | null;
}

interface SeedingTier {
  name: string;
  teams: string[];
}

interface TournamentState {
  teamName: string;
  roster: RosterExport | null;
  seedingTiers: SeedingTier[];
  rounds: CompletedRound[];
}

const STORAGE_KEY = "wtc-tournament";

function loadTournament(): TournamentState {
  if (typeof window === "undefined") return { teamName: "", roster: null, seedingTiers: [], rounds: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { teamName: "", roster: null, seedingTiers: [], rounds: [] };
}

function saveTournament(state: TournamentState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

// --- Shared Components ---

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
  highlight,
}: {
  army: RosterArmy;
  index: number;
  selected?: boolean;
  disabled?: boolean;
  paired?: boolean;
  onClick?: () => void;
  label?: string;
  highlight?: boolean;
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
            : highlight
              ? "border-[rgba(74,222,128,0.3)] bg-[rgba(74,222,128,0.05)]"
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

function LayoutPicker({
  label,
  dispA,
  dispB,
  selected,
  onSelect,
}: {
  label: string;
  dispA: Disposition | null;
  dispB: Disposition | null;
  selected: "A" | "B" | "C" | null;
  onSelect: (layout: "A" | "B" | "C") => void;
}) {
  const layouts = dispA && dispB ? getLayouts(dispA, dispB) : null;
  if (!layouts) {
    return (
      <div className="text-[11px] text-[#8888a0]">{label}: Ingen layouts fundet</div>
    );
  }

  return (
    <div>
      <h4 className="text-[11px] font-semibold text-[#e8e8f0] mb-2">{label}</h4>
      <div className="grid grid-cols-3 gap-2">
        {layouts.map((l) => (
          <button
            key={l.layout}
            onClick={() => onSelect(l.layout)}
            className={`rounded-lg border overflow-hidden transition-colors ${
              selected === l.layout
                ? "border-[#a855f7] ring-2 ring-[#a855f7]/30"
                : "border-white/[0.08] hover:border-white/[0.18]"
            }`}
          >
            <img
              src={getLayoutImage(l.page)}
              alt={`Layout ${l.layout}`}
              className="w-full aspect-[3/4] object-cover object-top"
            />
            <div className="px-2 py-1.5 bg-[#1a1a22] text-center">
              <span className={`text-[11px] font-semibold ${selected === l.layout ? "text-[#a855f7]" : "text-[#8888a0]"}`}>
                Layout {l.layout}
              </span>
            </div>
          </button>
        ))}
      </div>
      {selected && (
        <div className="mt-2">
          <img
            src={getLayoutImage(layouts.find((l) => l.layout === selected)!.page)}
            alt={`Layout ${selected} preview`}
            className="w-full rounded-lg border border-white/[0.08]"
          />
        </div>
      )}
    </div>
  );
}

const PHASE_LABELS: Record<PairingPhase, string> = {
  "skirmish1-defender": "Initial Skirmish 1 — Vælg Defender",
  "skirmish1-attackers": "Initial Skirmish 1 — Vælg Attackers",
  "skirmish1-choice": "Initial Skirmish 1 — Vælg matchup",
  "skirmish2-defender": "Initial Skirmish 2 — Vælg Defender",
  "skirmish2-attackers": "Initial Skirmish 2 — Vælg Attackers",
  "skirmish2-choice": "Initial Skirmish 2 — Vælg matchup",
  "main-defender": "Main Engagement — Vælg Defender",
  "main-attackers": "Main Engagement — Vælg Attackers",
  "main-choice": "Main Engagement — Vælg matchup",
};

// --- Main Component ---

export default function TournamentPage() {
  const [tournament, setTournament] = useState<TournamentState>(() => loadTournament());
  const [view, setView] = useState<TournamentView>("setup");
  const [initialized, setInitialized] = useState(false);

  // Active round state
  const [opponentImportText, setOpponentImportText] = useState("");
  const [opponentRoster, setOpponentRoster] = useState<RosterExport | null>(null);
  const [pairingPhase, setPairingPhase] = useState<PairingPhase>("skirmish1-defender");
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessionUrl, setSessionUrl] = useState<string | null>(null);

  // Pairing module state
  const [defenderA, setDefenderA] = useState<number | null>(null);
  const [defenderB, setDefenderB] = useState<number | null>(null);
  const [attackersA, setAttackersA] = useState<number[]>([]);
  const [attackersB, setAttackersB] = useState<number[]>([]);
  const [choiceA, setChoiceA] = useState<number | null>(null);
  const [choiceB, setChoiceB] = useState<number | null>(null);
  const [layoutChoiceA, setLayoutChoiceA] = useState<"A" | "B" | "C" | null>(null);
  const [layoutChoiceB, setLayoutChoiceB] = useState<"A" | "B" | "C" | null>(null);
  const [revealStep, setRevealStep] = useState(0);

  // Seeding edit state
  const [editingSeeding, setEditingSeeding] = useState(false);
  const [seedingText, setSeedingText] = useState("");

  // Setup state
  const [setupImportText, setSetupImportText] = useState("");
  const [setupTeamName, setSetupTeamName] = useState("");

  // Initialize from localStorage
  useEffect(() => {
    const saved = loadTournament();
    setTournament(saved);
    if (saved.roster) {
      setView("overview");
      setSetupTeamName(saved.teamName);
    }
    setInitialized(true);
  }, []);

  // Persist tournament state
  useEffect(() => {
    if (initialized) saveTournament(tournament);
  }, [tournament, initialized]);

  const currentRoundNumber = tournament.rounds.length + 1;
  const roundLayout = (["A", "B", "C"] as const)[(currentRoundNumber - 1) % 3];

  const pairedA = useMemo(
    () => new Set(matchups.map((m) => tournament.roster?.armies.indexOf(m.a)).filter((i) => i !== undefined && i >= 0)),
    [matchups, tournament.roster]
  );
  const pairedB = useMemo(
    () => new Set(matchups.map((m) => opponentRoster?.armies.indexOf(m.b)).filter((i) => i !== undefined && i >= 0)),
    [matchups, opponentRoster]
  );

  // --- Tournament actions ---

  function updateTournament(updates: Partial<TournamentState>) {
    setTournament((prev) => ({ ...prev, ...updates }));
  }

  function completeSetup() {
    const name = setupTeamName.trim();
    if (!name) { alert("Indtast holdnavn"); return; }
    const roster = deserializeRoster(setupImportText.trim());
    if (!roster) { alert("Ugyldigt roster format"); return; }
    if (roster.armies.length !== 8) { alert(`Roster skal have 8 hære (fandt ${roster.armies.length})`); return; }
    roster.name = name;
    updateTournament({ teamName: name, roster });
    setView("overview");
  }

  function parseSeedingText(text: string): SeedingTier[] {
    const tiers: SeedingTier[] = [];
    let current: SeedingTier | null = null;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.endsWith(":")) {
        current = { name: trimmed.slice(0, -1), teams: [] };
        tiers.push(current);
      } else if (current) {
        current.teams.push(...trimmed.split(",").map((t) => t.trim()).filter(Boolean));
      }
    }
    return tiers;
  }

  function saveSeedingTiers() {
    const tiers = parseSeedingText(seedingText);
    updateTournament({ seedingTiers: tiers });
    setEditingSeeding(false);
  }

  function seedingToText(tiers: SeedingTier[]): string {
    return tiers.map((t) => `${t.name}:\n${t.teams.join(", ")}`).join("\n\n");
  }

  function startNewRound() {
    setOpponentRoster(null);
    setOpponentImportText("");
    setMatchups([]);
    setSessionUrl(null);
    setCreatingSession(false);
    resetModuleState();
    setView("round-opponent");
  }

  function importOpponent() {
    const roster = deserializeRoster(opponentImportText.trim());
    if (!roster) { alert("Ugyldigt roster format"); return; }
    if (roster.armies.length !== 8) { alert(`Roster skal have 8 hære (fandt ${roster.armies.length})`); return; }
    setOpponentRoster(roster);
  }

  function startPairings() {
    setMatchups([]);
    setPairingPhase("skirmish1-defender");
    resetModuleState();
    setView("round-pairing");
  }

  function resetModuleState() {
    setDefenderA(null);
    setDefenderB(null);
    setAttackersA([]);
    setAttackersB([]);
    setChoiceA(null);
    setChoiceB(null);
    setLayoutChoiceA(null);
    setLayoutChoiceB(null);
    setRevealStep(0);
  }

  function currentModuleName(): string {
    if (pairingPhase.startsWith("skirmish1")) return "Initial Skirmish 1";
    if (pairingPhase.startsWith("skirmish2")) return "Initial Skirmish 2";
    if (pairingPhase.startsWith("main")) return "Main Engagement";
    return "";
  }

  function confirmDefenders() {
    if (defenderA === null || defenderB === null) return;
    setRevealStep(1);
  }

  function proceedToAttackers() {
    const prefix = pairingPhase.replace("-defender", "") as string;
    setPairingPhase(`${prefix}-attackers` as PairingPhase);
    setRevealStep(0);
  }

  function confirmAttackers() {
    if (attackersA.length !== 2 || attackersB.length !== 2) return;
    setRevealStep(1);
  }

  function proceedToChoice() {
    const prefix = pairingPhase.replace("-attackers", "") as string;
    setPairingPhase(`${prefix}-choice` as PairingPhase);
    setRevealStep(0);
  }

  function getLayoutPage(dispA: Disposition | null, dispB: Disposition | null, layout: "A" | "B" | "C"): number | null {
    if (!dispA || !dispB) return null;
    const layouts = getLayouts(dispA, dispB);
    if (!layouts) return null;
    const found = layouts.find((l) => l.layout === layout);
    return found?.page ?? null;
  }

  function confirmChoice() {
    if (choiceA === null || choiceB === null) return;
    if (layoutChoiceA === null || layoutChoiceB === null) return;
    if (!tournament.roster || !opponentRoster) return;

    const armiesA = tournament.roster.armies;
    const armiesB = opponentRoster.armies;
    const moduleName = currentModuleName();

    const m1: Matchup = {
      a: armiesA[defenderA!],
      b: armiesB[choiceA!],
      module: moduleName,
      aIsDefender: true,
      layoutPage: getLayoutPage(armiesA[defenderA!].disposition, armiesB[choiceA!].disposition, layoutChoiceA),
    };
    const m2: Matchup = {
      a: armiesA[choiceB!],
      b: armiesB[defenderB!],
      module: moduleName,
      aIsDefender: false,
      layoutPage: getLayoutPage(armiesA[choiceB!].disposition, armiesB[defenderB!].disposition, layoutChoiceB),
    };

    const newMatchups = [...matchups, m1, m2];

    if (pairingPhase.startsWith("main")) {
      const refusedA = attackersA.find((i) => i !== choiceB!)!;
      const refusedB = attackersB.find((i) => i !== choiceA!)!;
      const m3: Matchup = {
        a: armiesA[refusedA],
        b: armiesB[refusedB],
        module: "Main Engagement (Refused)",
        aIsDefender: false,
        layoutPage: getLayoutPage(armiesA[refusedA].disposition, armiesB[refusedB].disposition, roundLayout),
      };
      newMatchups.push(m3);
    }

    setMatchups(newMatchups);
    resetModuleState();

    if (pairingPhase.startsWith("skirmish1")) {
      setPairingPhase("skirmish2-defender");
    } else if (pairingPhase.startsWith("skirmish2")) {
      setPairingPhase("main-defender");
    } else if (pairingPhase.startsWith("main")) {
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
          layoutPage: getLayoutPage(champA.disposition, champB.disposition, roundLayout),
        });
        setMatchups(newMatchups);
      }
      setView("round-done");
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

  const startCoachingSession = useCallback(async () => {
    if (!tournament.roster || !opponentRoster || matchups.length === 0) return;
    setCreatingSession(true);
    try {
      const matchupData: MatchupData[] = matchups.map((m) => ({
        aFaction: m.a.faction,
        aDetachments: m.a.detachments,
        aDisposition: m.a.disposition,
        bFaction: m.b.faction,
        bDetachments: m.b.detachments,
        bDisposition: m.b.disposition,
        module: m.module,
        layoutPage: m.layoutPage,
        estimate: 0,
        aVP: 0,
        bVP: 0,
        round: 1,
        notes: "",
        final: false,
      }));
      const id = await createSession({
        teamAName: tournament.teamName,
        teamBName: opponentRoster.name || "Modstander",
        createdAt: Date.now(),
        matchups: matchupData,
      });
      const url = `/coaching/${id}`;
      setSessionUrl(url);

      // Save round to tournament
      const completedRound: CompletedRound = {
        number: currentRoundNumber,
        opponentName: opponentRoster.name || "Modstander",
        opponentRoster,
        matchups,
        sessionId: id,
        sessionUrl: url,
      };
      updateTournament({ rounds: [...tournament.rounds, completedRound] });
    } catch (e) {
      console.error("Failed to create session:", e);
      alert("Kunne ikke oprette coaching session. Tjek Firebase-konfigurationen.");
    } finally {
      setCreatingSession(false);
    }
  }, [tournament, opponentRoster, matchups, currentRoundNumber]);

  function resetTournament() {
    if (!confirm("Er du sikker? Alt turneringsdata slettes.")) return;
    const empty: TournamentState = { teamName: "", roster: null, seedingTiers: [], rounds: [] };
    setTournament(empty);
    saveTournament(empty);
    setView("setup");
    setOpponentRoster(null);
    setMatchups([]);
    setSessionUrl(null);
    setSetupImportText("");
    setSetupTeamName("");
  }

  function backToOverview() {
    setView("overview");
    setOpponentRoster(null);
    setMatchups([]);
    setSessionUrl(null);
    resetModuleState();
  }

  function loadTestData() {
    const testRoster: RosterExport = {
      v: 1,
      name: "Team Denmark",
      armies: [
        { faction: "Space Marines", detachments: ["Gladius Task Force"], disposition: "Take and Hold" },
        { faction: "Dark Angels", detachments: ["Inner Circle Task Force"], disposition: "Purge the Foe" },
        { faction: "Aeldari", detachments: ["Battle Host"], disposition: "Priority Assets" },
        { faction: "Orks", detachments: ["Waaagh! Tribe"], disposition: "Reconnaissance" },
        { faction: "Necrons", detachments: ["Awakened Dynasty"], disposition: "Disruption" },
        { faction: "Tyranids", detachments: ["Invasion Fleet"], disposition: "Take and Hold" },
        { faction: "T'au Empire", detachments: ["Kauyon"], disposition: "Purge the Foe" },
        { faction: "Adeptus Custodes", detachments: ["Shield Host"], disposition: "Priority Assets" },
      ],
    };
    const oppRoster: RosterExport = {
      v: 1,
      name: "Team Sweden",
      armies: [
        { faction: "World Eaters", detachments: ["Berzerker Warband"], disposition: "Purge the Foe" },
        { faction: "Death Guard", detachments: ["Plague Company"], disposition: "Take and Hold" },
        { faction: "Thousand Sons", detachments: ["Cult of Magic"], disposition: "Reconnaissance" },
        { faction: "Drukhari", detachments: ["Realspace Raiders"], disposition: "Disruption" },
        { faction: "Leagues of Votann", detachments: ["Oathband"], disposition: "Priority Assets" },
        { faction: "Adepta Sororitas", detachments: ["Hallowed Martyrs"], disposition: "Purge the Foe" },
        { faction: "Chaos Knights", detachments: ["War Dog Lance"], disposition: "Take and Hold" },
        { faction: "Imperial Knights", detachments: ["Noble Lance"], disposition: "Priority Assets" },
      ],
    };
    const testSeeding: SeedingTier[] = [
      { name: "Tier 1", teams: ["England", "Poland", "Germany", "France"] },
      { name: "Tier 2", teams: ["Denmark", "Sweden", "Finland", "Spain"] },
      { name: "Tier 3", teams: ["Norway", "Belgium", "Netherlands", "Italy"] },
      { name: "Tier 4", teams: ["Austria", "Czech Republic", "Portugal", "Ireland"] },
    ];
    updateTournament({ teamName: "Team Denmark", roster: testRoster, seedingTiers: testSeeding });
    setOpponentRoster(oppRoster);
    setMatchups([]);
    setView("round-opponent");
  }

  if (!initialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-[#8888a0] text-sm">Indlæser...</div>
      </div>
    );
  }

  // --- RENDER ---
  return (
    <>
      <header className="px-4 sm:px-6 py-4 pb-3 border-b border-white/[0.08] sticky top-0 bg-[#0f0f13] z-20">
        <div className="flex items-center gap-2 text-xs text-[#8888a0] mb-1">
          <Link href="/" className="hover:text-[#e8e8f0] transition-colors">
            Matrix
          </Link>
          <span>/</span>
          <Link href="/roster" className="hover:text-[#e8e8f0] transition-colors">
            Roster
          </Link>
          <span>/</span>
          <span className="text-[#e8e8f0]">WTC Turnering</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-[#e8e8f0] tracking-tight">
            WTC Turnering
            {tournament.teamName && (
              <span className="text-[#4ade80] ml-2 text-sm font-normal">
                — {tournament.teamName}
              </span>
            )}
          </h1>
          {view !== "setup" && (
            <div className="ml-auto flex items-center gap-2">
              {view !== "overview" && (
                <button
                  onClick={backToOverview}
                  className="text-[11px] text-[#8888a0] hover:text-[#e8e8f0] transition-colors"
                >
                  ← Oversigt
                </button>
              )}
              <button
                onClick={resetTournament}
                className="text-[11px] text-red-400 hover:text-red-300 transition-colors"
              >
                Start forfra
              </button>
            </div>
          )}
        </div>
        {view === "round-pairing" && (
          <p className="text-xs text-[#8888a0] mt-1">
            Runde {currentRoundNumber} · Initial Skirmish ×2 → Main Engagement → Champion · Layout{" "}
            {roundLayout} for refused/champion
          </p>
        )}
      </header>

      <div className="p-4 sm:p-6 max-w-6xl mx-auto">

        {/* ===== SETUP ===== */}
        {view === "setup" && (
          <div className="max-w-lg mx-auto space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-[#e8e8f0] mb-3">Opsæt dit hold</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] text-[#8888a0] block mb-1">Holdnavn</label>
                  <input
                    type="text"
                    value={setupTeamName}
                    onChange={(e) => setSetupTeamName(e.target.value)}
                    placeholder="f.eks. Team Denmark"
                    className="w-full bg-[#1a1a22] border border-white/[0.14] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] placeholder:text-[#8888a0] outline-none focus:border-[#a855f7]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#8888a0] block mb-1">Roster-kode (fra Roster Builder)</label>
                  <textarea
                    value={setupImportText}
                    onChange={(e) => setSetupImportText(e.target.value)}
                    placeholder="Indsæt roster-kode her..."
                    className="w-full h-20 bg-[#1a1a22] border border-white/[0.14] rounded-lg p-3 text-xs text-[#e8e8f0] placeholder:text-[#8888a0] outline-none resize-none font-mono focus:border-[#a855f7]"
                  />
                </div>
                <button
                  onClick={completeSetup}
                  className="w-full text-sm font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-6 py-2.5 rounded-lg transition-colors"
                >
                  Start turnering
                </button>
              </div>
            </div>
            <div className="text-center border-t border-white/[0.08] pt-4">
              <button
                onClick={loadTestData}
                className="text-[11px] text-[#8888a0] hover:text-[#a855f7] border border-dashed border-white/[0.08] hover:border-[rgba(168,85,247,0.3)] px-3 py-1.5 rounded-md transition-colors"
              >
                Indlæs testdata
              </button>
            </div>
          </div>
        )}

        {/* ===== OVERVIEW ===== */}
        {view === "overview" && tournament.roster && (
          <div className="space-y-6">
            {/* Our roster */}
            <div className="rounded-xl border border-[rgba(74,222,128,0.2)] bg-[rgba(74,222,128,0.03)] p-4">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-[#4ade80]">{tournament.teamName}</h2>
                <span className="text-[10px] text-[#8888a0]">({tournament.roster.armies.length} hære)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {tournament.roster.armies.map((army, i) => (
                  <ArmyCard key={i} army={army} index={i} highlight />
                ))}
              </div>
            </div>

            {/* Seeding */}
            <div className="rounded-xl border border-white/[0.08] p-4">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-[#e8e8f0]">Seeding</h2>
                <button
                  onClick={() => {
                    setSeedingText(seedingToText(tournament.seedingTiers));
                    setEditingSeeding(true);
                  }}
                  className="text-[10px] text-[#a855f7] hover:text-[#c084fc] ml-auto transition-colors"
                >
                  {tournament.seedingTiers.length > 0 ? "Redigér" : "Tilføj seeding"}
                </button>
              </div>

              {editingSeeding ? (
                <div className="space-y-2">
                  <textarea
                    value={seedingText}
                    onChange={(e) => setSeedingText(e.target.value)}
                    placeholder={"Tier 1:\nEngland, Poland, Germany\n\nTier 2:\nDenmark, Sweden, Finland"}
                    className="w-full h-40 bg-[#1a1a22] border border-white/[0.14] rounded-lg p-3 text-xs text-[#e8e8f0] placeholder:text-[#8888a0] outline-none resize-none font-mono focus:border-[#a855f7]"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveSeedingTiers}
                      className="text-[11px] font-medium text-white bg-[#a855f7] hover:bg-[#9333ea] px-3 py-1.5 rounded-md transition-colors"
                    >
                      Gem
                    </button>
                    <button
                      onClick={() => setEditingSeeding(false)}
                      className="text-[11px] text-[#8888a0] hover:text-[#e8e8f0] px-3 py-1.5 transition-colors"
                    >
                      Annullér
                    </button>
                  </div>
                </div>
              ) : tournament.seedingTiers.length > 0 ? (
                <div className="space-y-3">
                  {tournament.seedingTiers.map((tier, i) => (
                    <div key={i}>
                      <div className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold mb-1">
                        {tier.name}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {tier.teams.map((team, j) => {
                          const isUs = team.toLowerCase().includes(tournament.teamName.toLowerCase().replace("team ", ""));
                          const isPlayed = tournament.rounds.some(
                            (r) => r.opponentName.toLowerCase().includes(team.toLowerCase())
                          );
                          return (
                            <span
                              key={j}
                              className={`text-[11px] px-2 py-0.5 rounded border ${
                                isUs
                                  ? "border-[rgba(74,222,128,0.3)] bg-[rgba(74,222,128,0.1)] text-[#4ade80] font-medium"
                                  : isPlayed
                                    ? "border-white/[0.06] bg-white/[0.02] text-[#8888a0] line-through"
                                    : "border-white/[0.08] text-[#e8e8f0]"
                              }`}
                            >
                              {team}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-[#8888a0]">
                  Ingen seeding tilføjet endnu. Klik &quot;Tilføj seeding&quot; for at indtaste hold per tier.
                </p>
              )}
            </div>

            {/* Rounds */}
            <div className="rounded-xl border border-white/[0.08] p-4">
              <h2 className="text-sm font-semibold text-[#e8e8f0] mb-3">Runder</h2>

              {tournament.rounds.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {tournament.rounds.map((r) => (
                    <div
                      key={r.number}
                      className="flex items-center gap-3 rounded-lg border border-white/[0.08] p-3"
                    >
                      <span className="text-[12px] font-bold text-[#a855f7] w-16 shrink-0">
                        Runde {r.number}
                      </span>
                      <span className="text-[12px] text-[#e8e8f0] flex-1 min-w-0 truncate">
                        vs {r.opponentName}
                      </span>
                      {r.sessionUrl && (
                        <Link
                          href={r.sessionUrl}
                          className="text-[10px] text-[#4ade80] hover:text-[#22c55e] shrink-0 transition-colors"
                        >
                          Coaching →
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-[#8888a0] mb-4">Ingen runder spillet endnu.</p>
              )}

              <button
                onClick={startNewRound}
                className="text-sm font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-5 py-2.5 rounded-lg transition-colors"
              >
                Start runde {currentRoundNumber}
              </button>
            </div>
          </div>
        )}

        {/* ===== ROUND: OPPONENT IMPORT ===== */}
        {view === "round-opponent" && tournament.roster && (
          <div>
            <h2 className="text-sm font-semibold text-[#e8e8f0] mb-1">
              Runde {currentRoundNumber} — Importér modstander
            </h2>
            <p className="text-[11px] text-[#8888a0] mb-4">
              Importér modstanderens roster for at starte pairing-processen.
            </p>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Our roster (read-only) */}
              <div className="rounded-xl border border-[rgba(74,222,128,0.2)] bg-[rgba(74,222,128,0.03)] p-4">
                <h3 className="text-xs font-semibold text-[#4ade80] mb-2">{tournament.teamName}</h3>
                <div className="space-y-1.5">
                  {tournament.roster.armies.map((army, i) => (
                    <ArmyCard key={i} army={army} index={i} highlight />
                  ))}
                </div>
              </div>

              {/* Opponent import */}
              <div className="rounded-xl border border-white/[0.08] p-4">
                <h3 className="text-xs font-semibold text-[#8888a0] mb-2">
                  Modstander
                  {opponentRoster && (
                    <span className="text-[#e8e8f0] font-normal ml-2">— {opponentRoster.name}</span>
                  )}
                </h3>
                {opponentRoster ? (
                  <>
                    <div className="space-y-1.5 mb-3">
                      {opponentRoster.armies.map((army, i) => (
                        <ArmyCard key={i} army={army} index={i} />
                      ))}
                    </div>
                    <button
                      onClick={() => setOpponentRoster(null)}
                      className="text-[11px] text-red-400 hover:text-red-300"
                    >
                      Fjern roster
                    </button>
                  </>
                ) : (
                  <div>
                    <textarea
                      value={opponentImportText}
                      onChange={(e) => setOpponentImportText(e.target.value)}
                      placeholder="Indsæt modstanderens roster-kode..."
                      className="w-full h-20 bg-[#1a1a22] border border-white/[0.14] rounded-lg p-3 text-xs text-[#e8e8f0] placeholder:text-[#8888a0] outline-none resize-none font-mono focus:border-[#a855f7]"
                    />
                    <button
                      onClick={importOpponent}
                      className="mt-2 text-[12px] font-medium text-[#a855f7] hover:text-[#c084fc] bg-[rgba(168,85,247,0.1)] px-3 py-1.5 rounded-md border border-[rgba(168,85,247,0.2)] transition-colors"
                    >
                      Importér roster
                    </button>
                  </div>
                )}
              </div>
            </div>

            {opponentRoster && (
              <div className="mt-6 text-center">
                <button
                  onClick={startPairings}
                  className="text-sm font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-6 py-2.5 rounded-lg transition-colors"
                >
                  Start pairings
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== ROUND: PAIRING FLOW ===== */}
        {view === "round-pairing" && tournament.roster && opponentRoster && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs font-semibold text-[#a855f7] bg-[rgba(168,85,247,0.1)] px-2.5 py-1 rounded-md">
                {PHASE_LABELS[pairingPhase]}
              </span>
              <span className="text-[11px] text-[#8888a0]">
                {matchups.length}/8 matchups færdige
              </span>
            </div>

            {/* Defender selection */}
            {pairingPhase.endsWith("-defender") && (
              <div>
                {revealStep === 0 ? (
                  <div className="grid md:grid-cols-2 gap-6">
                    {(["A", "B"] as const).map((team) => {
                      const roster = team === "A" ? tournament.roster! : opponentRoster;
                      const paired = team === "A" ? pairedA : pairedB;
                      const defender = team === "A" ? defenderA : defenderB;
                      const setDef = team === "A" ? setDefenderA : setDefenderB;
                      const teamName = team === "A" ? tournament.teamName : opponentRoster.name || "Modstander";
                      return (
                        <div key={team}>
                          <h3 className={`text-xs font-semibold mb-2 ${team === "A" ? "text-[#4ade80]" : "text-[#8888a0]"}`}>
                            {teamName} — vælg Defender (hemmeligt)
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
                        <h3 className="text-xs font-semibold text-[#4ade80] mb-2">{tournament.teamName} Defender</h3>
                        <ArmyCard army={tournament.roster!.armies[defenderA!]} index={defenderA!} selected label="DEFENDER" />
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold text-amber-400 mb-2">{opponentRoster.name || "Modstander"} Defender</h3>
                        <ArmyCard army={opponentRoster.armies[defenderB!]} index={defenderB!} selected label="DEFENDER" />
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
            {pairingPhase.endsWith("-attackers") && (
              <div>
                {revealStep === 0 ? (
                  <div className="grid md:grid-cols-2 gap-6">
                    {(["A", "B"] as const).map((team) => {
                      const roster = team === "A" ? tournament.roster! : opponentRoster;
                      const paired = team === "A" ? pairedA : pairedB;
                      const defender = team === "A" ? defenderA! : defenderB!;
                      const attackers = team === "A" ? attackersA : attackersB;
                      const oppDefender = team === "A" ? defenderB! : defenderA!;
                      const oppRoster = team === "A" ? opponentRoster : tournament.roster!;
                      const teamName = team === "A" ? tournament.teamName : opponentRoster.name || "Modstander";
                      const oppName = team === "A" ? (opponentRoster.name || "Modstander") : tournament.teamName;
                      return (
                        <div key={team}>
                          <h3 className={`text-xs font-semibold mb-1 ${team === "A" ? "text-[#4ade80]" : "text-[#8888a0]"}`}>
                            {teamName} — vælg 2 Attackers mod {oppName}&apos;s Defender
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
                        const roster = team === "A" ? tournament.roster! : opponentRoster;
                        const attackers = team === "A" ? attackersA : attackersB;
                        const teamName = team === "A" ? tournament.teamName : opponentRoster.name || "Modstander";
                        return (
                          <div key={team}>
                            <h3 className={`text-xs font-semibold mb-2 ${team === "A" ? "text-[#4ade80]" : "text-amber-400"}`}>
                              {teamName} Attackers
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

            {/* Choice */}
            {pairingPhase.endsWith("-choice") && (
              <div>
                {revealStep === 0 ? (
                  <div className="grid md:grid-cols-2 gap-6">
                    {(["A", "B"] as const).map((team) => {
                      const defender = team === "A" ? defenderA! : defenderB!;
                      const roster = team === "A" ? tournament.roster! : opponentRoster;
                      const oppAttackers = team === "A" ? attackersB : attackersA;
                      const oppRoster = team === "A" ? opponentRoster : tournament.roster!;
                      const choice = team === "A" ? choiceA : choiceB;
                      const setChoice = team === "A" ? setChoiceA : setChoiceB;
                      const teamName = team === "A" ? tournament.teamName : opponentRoster.name || "Modstander";
                      return (
                        <div key={team}>
                          <h3 className={`text-xs font-semibold mb-1 ${team === "A" ? "text-[#4ade80]" : "text-[#8888a0]"}`}>
                            {teamName} — hvilken modstander-attacker skal din Defender møde?
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
                  <div className="space-y-6">
                    <h3 className="text-sm font-semibold text-[#e8e8f0] text-center">Matchups fra {currentModuleName()}</h3>
                    <div className="max-w-xl mx-auto space-y-3">
                      <MatchupPreview
                        label="Matchup"
                        aArmy={tournament.roster!.armies[defenderA!]}
                        aIdx={defenderA!}
                        aRole="DEF"
                        bArmy={opponentRoster.armies[choiceA!]}
                        bIdx={choiceA!}
                        bRole="ATK"
                      />
                      <MatchupPreview
                        label="Matchup"
                        aArmy={tournament.roster!.armies[choiceB!]}
                        aIdx={choiceB!}
                        aRole="ATK"
                        bArmy={opponentRoster.armies[defenderB!]}
                        bIdx={defenderB!}
                        bRole="DEF"
                      />
                      {pairingPhase.startsWith("main") && (() => {
                        const refA = attackersA.find((i) => i !== choiceB!)!;
                        const refB = attackersB.find((i) => i !== choiceA!)!;
                        return (
                          <MatchupPreview
                            label={`Refused Attackers (Layout ${roundLayout})`}
                            aArmy={tournament.roster!.armies[refA]}
                            aIdx={refA}
                            aRole="REF"
                            bArmy={opponentRoster.armies[refB]}
                            bIdx={refB}
                            bRole="REF"
                          />
                        );
                      })()}
                    </div>

                    <div className="border-t border-white/[0.08] pt-4">
                      <h4 className="text-xs font-semibold text-[#8888a0] text-center mb-3 uppercase tracking-wider">
                        Defenders vælger layout
                      </h4>
                      <div className="grid md:grid-cols-2 gap-6">
                        <LayoutPicker
                          label={`${tournament.teamName} Defender — ${tournament.roster!.armies[defenderA!].faction}`}
                          dispA={tournament.roster!.armies[defenderA!].disposition}
                          dispB={opponentRoster.armies[choiceA!].disposition}
                          selected={layoutChoiceA}
                          onSelect={setLayoutChoiceA}
                        />
                        <LayoutPicker
                          label={`${opponentRoster.name || "Modstander"} Defender — ${opponentRoster.armies[defenderB!].faction}`}
                          dispA={tournament.roster!.armies[choiceB!].disposition}
                          dispB={opponentRoster.armies[defenderB!].disposition}
                          selected={layoutChoiceB}
                          onSelect={setLayoutChoiceB}
                        />
                      </div>
                    </div>

                    <div className="text-center">
                      <button
                        onClick={confirmChoice}
                        disabled={layoutChoiceA === null || layoutChoiceB === null}
                        className="text-sm font-medium text-white bg-[#a855f7] hover:bg-[#9333ea] disabled:opacity-30 disabled:cursor-not-allowed px-5 py-2 rounded-lg transition-colors"
                      >
                        Bekræft og fortsæt →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Current matchups sidebar */}
            {matchups.length > 0 && (
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
        )}

        {/* ===== ROUND DONE ===== */}
        {view === "round-done" && (
          <div>
            <h2 className="text-sm font-semibold text-[#4ade80] mb-4">
              Runde {currentRoundNumber} — Alle 8 matchups er færdige!
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
                      <div className="text-[12px] text-[#4ade80] font-medium">
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
                  {m.layoutPage && (
                    <details className="mt-2">
                      <summary className="text-[10px] text-[#a855f7] cursor-pointer hover:text-[#c084fc]">
                        Vis layout
                      </summary>
                      <img
                        src={getLayoutImage(m.layoutPage)}
                        alt={`Layout for ${m.a.faction} vs ${m.b.faction}`}
                        className="mt-2 rounded-lg border border-white/[0.08] w-full max-w-md"
                      />
                    </details>
                  )}
                </div>
              ))}
            </div>

            {/* Coaching session */}
            <div className="rounded-lg border border-[rgba(74,222,128,0.2)] bg-[rgba(74,222,128,0.05)] p-4 mb-4">
              {sessionUrl ? (
                <div className="space-y-2">
                  <p className="text-[12px] text-[#4ade80] font-medium">
                    Coaching session oprettet!
                  </p>
                  <Link
                    href={sessionUrl}
                    className="inline-block text-[12px] font-semibold text-[#0f0f13] bg-[#4ade80] hover:bg-[#22c55e] px-4 py-2 rounded-md transition-colors"
                  >
                    Åbn coaching dashboard
                  </Link>
                  <button
                    onClick={() => navigator.clipboard.writeText(window.location.origin + sessionUrl)}
                    className="ml-2 text-[11px] text-[#4ade80] hover:text-[#22c55e] transition-colors"
                  >
                    Kopiér link
                  </button>
                </div>
              ) : (
                <button
                  onClick={startCoachingSession}
                  disabled={creatingSession}
                  className="text-[12px] font-semibold text-[#0f0f13] bg-[#4ade80] hover:bg-[#22c55e] disabled:opacity-50 px-4 py-2 rounded-md transition-colors"
                >
                  {creatingSession ? "Opretter session..." : "Start coaching session"}
                </button>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={backToOverview}
                className="text-[12px] font-medium text-[#a855f7] hover:text-[#c084fc] bg-[rgba(168,85,247,0.1)] px-3 py-1.5 rounded-md border border-[rgba(168,85,247,0.2)] transition-colors"
              >
                ← Tilbage til oversigt
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
