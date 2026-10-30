export interface Mission {
  name: string;
  scoring: string;
}

export interface DispositionInfo {
  desc: string;
  color: string;
  bg: string;
  vs: Record<string, Mission>;
}

export interface Detachment {
  n: string;
  // null = GW hasn't published the Force Disposition yet (shown as "Ukendt")
  d: Disposition | null;
  // Some (3DP, generic) detachments offer a CHOICE between TWO Force Dispositions
  // — e.g. T'au Retaliation Cadre is Purge the Foe OR Reconnaissance. `d2` holds
  // the alternative; the player picks one when building the list.
  d2?: Disposition | null;
  dp: number;
  new?: boolean;
}

// All Force Dispositions a detachment can be fielded as (1 or 2).
export function detachmentDispositions(det: Detachment): Disposition[] {
  const out: Disposition[] = [];
  if (det.d) out.push(det.d);
  if (det.d2 && det.d2 !== det.d) out.push(det.d2);
  return out;
}

export type Disposition =
  | "Take and Hold"
  | "Purge the Foe"
  | "Priority Assets"
  | "Reconnaissance"
  | "Disruption";

export const DISPOSITIONS: Disposition[] = [
  "Take and Hold",
  "Purge the Foe",
  "Priority Assets",
  "Reconnaissance",
  "Disruption",
];

export const DISP_STYLES: Record<
  Disposition,
  { cls: string; color: string; bg: string }
> = {
  "Take and Hold": {
    cls: "take",
    color: "rgb(34,197,94)",
    bg: "rgba(34,197,94,0.12)",
  },
  "Purge the Foe": {
    cls: "purge",
    color: "rgb(239,68,68)",
    bg: "rgba(239,68,68,0.12)",
  },
  "Priority Assets": {
    cls: "prio",
    color: "rgb(245,158,11)",
    bg: "rgba(245,158,11,0.12)",
  },
  Reconnaissance: {
    cls: "recon",
    color: "rgb(59,130,246)",
    bg: "rgba(59,130,246,0.12)",
  },
  Disruption: {
    cls: "dis",
    color: "rgb(168,85,247)",
    bg: "rgba(168,85,247,0.12)",
  },
};

export const MISSIONS: Record<Disposition, DispositionInfo> = {
  "Take and Hold": {
    desc: "Hold the most objective markers across the battlefield.",
    color: "rgb(34,197,94)",
    bg: "rgba(34,197,94,0.12)",
    vs: {
      "Take and Hold": {
        name: "Battlefield Dominance",
        scoring: "VP for flest holdte objektiver ved rundens slutning",
      },
      "Purge the Foe": {
        name: "Immovable Object",
        scoring: "VP for holdte obj. · Fjenden scorer for dræbte enheder",
      },
      Disruption: {
        name: "Determined Acquisition",
        scoring: "VP for holdte obj. · Fjenden scorer for actions i dit territorium",
      },
      Reconnaissance: {
        name: "Purge and Secure",
        scoring: "VP for holdte obj. · Fjenden scorer for scannede zoner",
      },
      "Priority Assets": {
        name: "Inescapable Dominion",
        scoring: "VP for holdte obj. · Fjenden scorer for markerede obj.",
      },
    },
  },
  "Purge the Foe": {
    desc: "Destroy enemy units to score Victory Points.",
    color: "rgb(239,68,68)",
    bg: "rgba(239,68,68,0.12)",
    vs: {
      "Take and Hold": {
        name: "Unstoppable Force",
        scoring: "VP for destruerede enheder · Fjenden scorer for holdte obj.",
      },
      "Purge the Foe": {
        name: "Meatgrinder",
        scoring: "Begge scorer VP for destruerede fjendtlige enheder",
      },
      Disruption: {
        name: "Punishment",
        scoring: "VP for dræb · Fjenden scorer for actions + denial",
      },
      Reconnaissance: {
        name: "Consecrate",
        scoring: "VP for dræb · Fjenden scorer for scannede zoner",
      },
      "Priority Assets": {
        name: "Destroyer's Wrath",
        scoring: "VP for dræb · Fjenden scorer for markerede obj.",
      },
    },
  },
  Disruption: {
    desc: "Perform actions and deny the enemy in hostile territory.",
    color: "rgb(168,85,247)",
    bg: "rgba(168,85,247,0.12)",
    vs: {
      "Take and Hold": {
        name: "Death Trap",
        scoring: "VP for actions i fjendtligt territorium · Fjenden scorer for holdte obj.",
      },
      "Purge the Foe": {
        name: "Delaying Action",
        scoring: "VP for actions + denial · Fjenden scorer for dræb",
      },
      Disruption: {
        name: "Outmanoeuvre",
        scoring: "Begge scorer for actions i modstanderens zone + denial",
      },
      Reconnaissance: {
        name: "Smoke and Mirrors",
        scoring: "VP for actions + denial · Fjenden scorer for scans",
      },
      "Priority Assets": {
        name: "Locate and Deny",
        scoring: "VP for actions nær priority markers · Fjenden forsvarer dem",
      },
    },
  },
  Reconnaissance: {
    desc: "Move into and scan different areas of the battlefield.",
    color: "rgb(59,130,246)",
    bg: "rgba(59,130,246,0.12)",
    vs: {
      "Take and Hold": {
        name: "Reconnaissance Sweep",
        scoring: "VP for scannede board-zoner · Fjenden scorer for holdte obj.",
      },
      "Purge the Foe": {
        name: "Triangulation",
        scoring: "VP for scannede zoner · Fjenden scorer for dræb",
      },
      Disruption: {
        name: "Surveil the Foe",
        scoring: "VP for scans · Fjenden scorer for actions + denial",
      },
      Reconnaissance: {
        name: "Gather Intel",
        scoring: "Begge scorer for scannede zoner — ren speed-race",
      },
      "Priority Assets": {
        name: "Search and Scour",
        scoring: "VP for scannede zoner · Fjenden scorer for markerede obj.",
      },
    },
  },
  "Priority Assets": {
    desc: "Control and secure specifically marked objective markers.",
    color: "rgb(245,158,11)",
    bg: "rgba(245,158,11,0.12)",
    vs: {
      "Take and Hold": {
        name: "Secure Asset",
        scoring: "VP for markerede obj. · Fjenden scorer for alle obj.",
      },
      "Purge the Foe": {
        name: "Vital Link",
        scoring: "VP for markerede obj. · Fjenden scorer for dræb",
      },
      Disruption: {
        name: "Extract Relic",
        scoring: "VP for markerede obj. · Fjenden scorer for actions nær dem",
      },
      Reconnaissance: {
        name: "Vanguard Operation",
        scoring: "VP for markerede obj. · Fjenden scorer for scannede zoner",
      },
      "Priority Assets": {
        name: "Sabotage",
        scoring: "Begge scorer for de samme markerede objektiver",
      },
    },
  },
};

export const FACTIONS: Record<string, Detachment[]> = {
  "Space Marines": [
    { n: "Assault Brethren", d: "Take and Hold", dp: 1 },
    { n: "Blade of Ultramar", d: "Take and Hold", d2: "Priority Assets", dp: 3 },
    { n: "Ceramite Sentinels", d: "Take and Hold", dp: 2 },
    { n: "Deathwatch Support", d: "Disruption", dp: 1 },
    { n: "Devastator Brethren", d: "Purge the Foe", dp: 1 },
    { n: "Forgefather's Seekers", d: "Priority Assets", dp: 2 },
    { n: "Gauntlet Task Force", d: "Reconnaissance", dp: 1 },
    { n: "Gladius Task Force", d: "Take and Hold", d2: "Priority Assets", dp: 3 },
    { n: "Gravis Linebreaker Force", d: "Take and Hold", dp: 1 },
    { n: "Gravis Siege Force", d: "Take and Hold", dp: 1 },
    { n: "Ironclad Champions", d: "Priority Assets", dp: 1 },
    { n: "Ironstorm Spearhead", d: "Purge the Foe", dp: 1 },
    { n: "Medusa's Wrath", d: "Purge the Foe", dp: 2 },
    { n: "Phobos Shadow Force", d: "Disruption", dp: 1 },
    { n: "Phobos Shock Force", d: "Disruption", dp: 1 },
    { n: "Shadowmark Talon", d: "Disruption", dp: 2 },
    { n: "Spearpoint Task Force", d: "Reconnaissance", dp: 2 },
    { n: "Stormlance Task Force", d: "Reconnaissance", dp: 1 },
    { n: "Tactical Brethren", d: "Priority Assets", dp: 1 },
    { n: "Tacticus Attack Force", d: "Take and Hold", dp: 1 },
    { n: "Tacticus Firestorm Force", d: "Priority Assets", dp: 1 },
    { n: "Terminator Storm Force", d: "Priority Assets", dp: 1 },
  ],
  "Dark Angels": [
    { n: "Assault Brethren", d: "Take and Hold", dp: 1 },
    { n: "Darkflight Pursuit", d: "Reconnaissance", dp: 1 },
    { n: "Deathwatch Support", d: "Disruption", dp: 1 },
    { n: "Devastator Brethren", d: "Purge the Foe", dp: 1 },
    { n: "Gauntlet Task Force", d: "Reconnaissance", dp: 1 },
    { n: "Gladius Task Force", d: "Take and Hold", d2: "Priority Assets", dp: 3 },
    { n: "Gravis Linebreaker Force", d: "Take and Hold", dp: 1 },
    { n: "Gravis Siege Force", d: "Take and Hold", dp: 1 },
    { n: "Inner Circle Task Force", d: "Priority Assets", dp: 1 },
    { n: "Ironclad Champions", d: "Priority Assets", dp: 1 },
    { n: "Ironstorm Spearhead", d: "Purge the Foe", dp: 1 },
    { n: "Phobos Shadow Force", d: "Disruption", dp: 1 },
    { n: "Phobos Shock Force", d: "Disruption", dp: 1 },
    { n: "Stormlance Task Force", d: "Reconnaissance", dp: 1 },
    { n: "Tactical Brethren", d: "Priority Assets", dp: 1 },
    { n: "Tacticus Attack Force", d: "Take and Hold", dp: 1 },
    { n: "Tacticus Firestorm Force", d: "Priority Assets", dp: 1 },
    { n: "Terminator Storm Force", d: "Priority Assets", dp: 1 },
    { n: "Wrath of the Rock", d: "Take and Hold", dp: 2 },
  ],
  "Blood Angels": [
    { n: "Angelic Inheritors", d: "Priority Assets", d2: "Purge the Foe", dp: 3 },
    { n: "Assault Brethren", d: "Take and Hold", dp: 1 },
    { n: "Deathwatch Support", d: "Disruption", dp: 1 },
    { n: "Devastator Brethren", d: "Purge the Foe", dp: 1 },
    { n: "Encarmine Speartip", d: "Disruption", dp: 1 },
    { n: "Gauntlet Task Force", d: "Reconnaissance", dp: 1 },
    { n: "Gladius Task Force", d: "Take and Hold", d2: "Priority Assets", dp: 3 },
    { n: "Gravis Linebreaker Force", d: "Take and Hold", dp: 1 },
    { n: "Gravis Siege Force", d: "Take and Hold", dp: 1 },
    { n: "Ironclad Champions", d: "Priority Assets", dp: 1 },
    { n: "Ironstorm Spearhead", d: "Purge the Foe", dp: 1 },
    { n: "Phobos Shadow Force", d: "Disruption", dp: 1 },
    { n: "Phobos Shock Force", d: "Disruption", dp: 1 },
    { n: "Stormlance Task Force", d: "Reconnaissance", dp: 1 },
    { n: "Tactical Brethren", d: "Priority Assets", dp: 1 },
    { n: "Tacticus Attack Force", d: "Take and Hold", dp: 1 },
    { n: "Tacticus Firestorm Force", d: "Priority Assets", dp: 1 },
    { n: "Terminator Storm Force", d: "Priority Assets", dp: 1 },
    { n: "Wrath of the Doomed", d: "Purge the Foe", dp: 1 },
  ],
  "Space Wolves": [
    { n: "Assault Brethren", d: "Take and Hold", dp: 1 },
    { n: "Champions of Fenris", d: "Priority Assets", dp: 1 },
    { n: "Deathwatch Support", d: "Disruption", dp: 1 },
    { n: "Devastator Brethren", d: "Purge the Foe", dp: 1 },
    { n: "Gauntlet Task Force", d: "Reconnaissance", dp: 1 },
    { n: "Gladius Task Force", d: "Take and Hold", d2: "Priority Assets", dp: 3 },
    { n: "Gravis Linebreaker Force", d: "Take and Hold", dp: 1 },
    { n: "Gravis Siege Force", d: "Take and Hold", dp: 1 },
    { n: "Ironclad Champions", d: "Priority Assets", dp: 1 },
    { n: "Ironstorm Spearhead", d: "Purge the Foe", dp: 1 },
    { n: "Phobos Shadow Force", d: "Disruption", dp: 1 },
    { n: "Phobos Shock Force", d: "Disruption", dp: 1 },
    { n: "Saga of the Beastslayer", d: "Purge the Foe", dp: 1 },
    { n: "Saga of the Great Wolf", d: "Take and Hold", dp: 2 },
    { n: "Stormlance Task Force", d: "Reconnaissance", dp: 1 },
    { n: "Tactical Brethren", d: "Priority Assets", dp: 1 },
    { n: "Tacticus Attack Force", d: "Take and Hold", dp: 1 },
    { n: "Tacticus Firestorm Force", d: "Priority Assets", dp: 1 },
    { n: "Terminator Storm Force", d: "Priority Assets", dp: 1 },
  ],
  "Black Templars": [
    { n: "Assault Brethren", d: "Take and Hold", dp: 1 },
    { n: "Deathwatch Support", d: "Disruption", dp: 1 },
    { n: "Devastator Brethren", d: "Purge the Foe", dp: 1 },
    { n: "Fist of the God-Emperor", d: "Take and Hold", dp: 1 },
    { n: "Gauntlet Task Force", d: "Reconnaissance", dp: 1 },
    { n: "Gravis Linebreaker Force", d: "Take and Hold", dp: 1 },
    { n: "Gravis Siege Force", d: "Take and Hold", dp: 1 },
    { n: "Ironclad Champions", d: "Priority Assets", dp: 1 },
    { n: "Ironstorm Spearhead", d: "Purge the Foe", dp: 1 },
    { n: "Marshal's Household", d: "Priority Assets", dp: 1 },
    { n: "Phobos Shadow Force", d: "Disruption", dp: 1 },
    { n: "Phobos Shock Force", d: "Disruption", dp: 1 },
    { n: "Stormlance Task Force", d: "Reconnaissance", dp: 1 },
    { n: "Tactical Brethren", d: "Priority Assets", dp: 1 },
    { n: "Tacticus Attack Force", d: "Take and Hold", dp: 1 },
    { n: "Tacticus Firestorm Force", d: "Priority Assets", dp: 1 },
    { n: "Terminator Storm Force", d: "Priority Assets", dp: 1 },
    { n: "Vow-Sworn Crusaders", d: "Purge the Foe", dp: 2 },
  ],
  "Grey Knights": [
    { n: "Argent Assault", d: "Priority Assets", dp: 1, new: true },
    { n: "Fires of Purgation", d: "Disruption", dp: 1, new: true },
    { n: "Immaterial Interdiction", d: "Reconnaissance", dp: 1, new: true },
    { n: "Augurium Task Force", d: "Reconnaissance", dp: 2 },
    { n: "Banishers", d: "Disruption", dp: 2 },
    { n: "Brotherhood Strike", d: "Purge the Foe", dp: 2 },
    { n: "Hallowed Conclave", d: "Take and Hold", dp: 2 },
    { n: "Sanctic Spearhead", d: "Priority Assets", dp: 2 },
    { n: "Warpbane Task Force", d: "Take and Hold", d2: "Purge the Foe", dp: 3 },
  ],
  Deathwatch: [
    { n: "Assault Brethren", d: "Take and Hold", dp: 1 },
    { n: "Black Spear Task Force", d: "Priority Assets", d2: "Purge the Foe", dp: 3 },
    { n: "Devastator Brethren", d: "Purge the Foe", dp: 1 },
    { n: "Gauntlet Task Force", d: "Reconnaissance", dp: 1 },
    { n: "Gladius Task Force", d: "Take and Hold", d2: "Priority Assets", dp: 3 },
    { n: "Gravis Linebreaker Force", d: "Take and Hold", dp: 1 },
    { n: "Gravis Siege Force", d: "Take and Hold", dp: 1 },
    { n: "Ironclad Champions", d: "Priority Assets", dp: 1 },
    { n: "Ironstorm Spearhead", d: "Purge the Foe", dp: 1 },
    { n: "Phobos Shadow Force", d: "Disruption", dp: 1 },
    { n: "Phobos Shock Force", d: "Disruption", dp: 1 },
    { n: "Stormlance Task Force", d: "Reconnaissance", dp: 1 },
    { n: "Tactical Brethren", d: "Priority Assets", dp: 1 },
    { n: "Tacticus Attack Force", d: "Take and Hold", dp: 1 },
    { n: "Tacticus Firestorm Force", d: "Priority Assets", dp: 1 },
    { n: "Terminator Storm Force", d: "Priority Assets", dp: 1 },
  ],
  "Astra Militarum": [
    { n: "Abhuman Auxiliaries", d: "Take and Hold", dp: 1, new: true },
    { n: "Bridgehead Strike", d: "Priority Assets", dp: 1, new: true },
    { n: "Designation Force", d: "Reconnaissance", dp: 1, new: true },
    { n: "Armoured Infantry", d: "Take and Hold", dp: 2 },
    { n: "Combined Arms", d: "Take and Hold", dp: 2 },
    { n: "Grizzled Company", d: "Priority Assets", d2: "Purge the Foe", dp: 3 },
    { n: "Hammer of the Emperor", d: "Purge the Foe", dp: 2 },
    { n: "Mechanised Assault", d: "Reconnaissance", dp: 2 },
    { n: "Recon Element", d: "Reconnaissance", dp: 2 },
    { n: "Siege Regiment", d: "Disruption", dp: 2 },
    { n: "Steel Hammer", d: "Purge the Foe", dp: 2 },
  ],
  "Adepta Sororitas": [
    { n: "Army of Faith", d: "Take and Hold", dp: 2 },
    { n: "Bringers of Flame", d: "Priority Assets", dp: 2 },
    { n: "Champions of Faith", d: "Disruption", dp: 2 },
    { n: "Chorus of Condemnation", d: "Reconnaissance", dp: 1 },
    { n: "Hallowed Martyrs", d: "Take and Hold", d2: "Priority Assets", dp: 3 },
    { n: "Penitent Host", d: "Purge the Foe", dp: 2 },
    { n: "Sacred Champions", d: "Take and Hold", dp: 1 },
    { n: "Sanctified Orators", d: "Disruption", dp: 1 },
  ],
  "Adeptus Mechanicus": [
    { n: "Cohort Acquisitus", d: "Reconnaissance", dp: 1 },
    { n: "Cohort Cybernetica", d: "Take and Hold", dp: 1 },
    { n: "Data-Psalm Conclave", d: "Disruption", dp: 2 },
    { n: "Eradication Cohort", d: "Purge the Foe", dp: 2 },
    { n: "Explorator Maniple", d: "Priority Assets", dp: 2 },
    { n: "Haloscreed Battle Clade", d: "Priority Assets", d2: "Purge the Foe", dp: 3 },
    { n: "Lords of the Forge", d: "Priority Assets", dp: 2 },
    { n: "Luminen Auto-Choir", d: "Disruption", dp: 1 },
    { n: "Rad-Zone Corps", d: "Take and Hold", dp: 2 },
    { n: "Skitarii Hunter Cohort", d: "Reconnaissance", dp: 2 },
  ],
  "Imperial Knights": [
    { n: "Dominus Foebreakers", d: "Priority Assets", dp: 1, new: true },
    { n: "Questor Forgepact", d: "Disruption", dp: 1, new: true },
    { n: "Throne-bonded Outriders", d: "Reconnaissance", dp: 1, new: true },
    { n: "Freeblade Company", d: "Priority Assets", d2: "Purge the Foe", dp: 3 },
    { n: "Gate Warden Lance", d: "Take and Hold", dp: 2 },
    { n: "Questoris Companions", d: "Take and Hold", d2: "Reconnaissance", dp: 3 },
    { n: "Spearhead-at-arms", d: "Reconnaissance", dp: 2 },
    { n: "Valourstrike Lance", d: "Purge the Foe", dp: 2 },
  ],
  "Adeptus Custodes": [
    { n: "Aquilan Shield", d: "Take and Hold", dp: 1 },
    { n: "Auric Champions", d: "Purge the Foe", dp: 1 },
    { n: "Dread Host", d: "Purge the Foe", dp: 1 },
    { n: "Emissaries Imperatus", d: "Priority Assets", dp: 1 },
    { n: "Emperor's Chosen", d: "Priority Assets", dp: 1 },
    { n: "Grav-Assault Force", d: "Reconnaissance", dp: 1 },
    { n: "Guardians of the Throne", d: "Priority Assets", d2: "Purge the Foe", dp: 3 },
    { n: "Honoured Companions", d: "Take and Hold", dp: 1 },
    { n: "Lions of the Emperor", d: "Disruption", dp: 1 },
    { n: "Might of the Moritoi", d: "Take and Hold", dp: 1 },
    { n: "Null Maiden Vigil", d: "Disruption", dp: 1 },
    { n: "Shadowkeepers", d: "Purge the Foe", dp: 1 },
    { n: "Solar Watch", d: "Reconnaissance", dp: 1 },
  ],
  "Imperial Agents": [
    { n: "Imperialis Fleet", d: "Reconnaissance", dp: 2 },
    { n: "Ordo Hereticus, Purgation Force", d: "Take and Hold", dp: 2 },
    { n: "Ordo Malleus, Daemon Hunters", d: "Priority Assets", dp: 2 },
    { n: "Ordo Xenos, Alien Hunters", d: "Purge the Foe", dp: 2 },
    { n: "Veiled Blade Elimination Force", d: "Disruption", dp: 1 },
  ],
  "Chaos Space Marines": [
    { n: "Cabal of Chaos", d: "Disruption", dp: 1 },
    { n: "Chaos Cult", d: "Priority Assets", dp: 2 },
    { n: "Creations of Bile", d: "Take and Hold", d2: "Purge the Foe", dp: 3 },
    { n: "Cult of the Arkifane", d: "Priority Assets", dp: 2 },
    { n: "Deceptors", d: "Disruption", dp: 2 },
    { n: "Devotees of Destruction", d: "Priority Assets", dp: 1 },
    { n: "Dread Talons", d: "Disruption", dp: 2 },
    { n: "Fellhammer Siege-Host", d: "Take and Hold", dp: 2 },
    { n: "Huron's Marauders", d: "Disruption", d2: "Purge the Foe", dp: 3 },
    { n: "Murdertalon Raiders", d: "Reconnaissance", dp: 1 },
    { n: "Nightmare Hunt", d: "Disruption", dp: 2 },
    { n: "Pactbound Zealots", d: "Disruption", d2: "Priority Assets", dp: 3 },
    { n: "Renegade Raiders", d: "Priority Assets", d2: "Reconnaissance", dp: 3 },
    { n: "Renegade Warband", d: "Priority Assets", dp: 2 },
    { n: "Soulforged Warpack", d: "Take and Hold", dp: 2 },
    { n: "Veterans of the Long War", d: "Take and Hold", dp: 2 },
    { n: "Warpstrike Champions", d: "Disruption", dp: 2 },
  ],
  "World Eaters": [
    { n: "Berzerker Warband", d: "Purge the Foe", dp: 2 },
    { n: "Brazen Engines", d: "Disruption", dp: 1 },
    { n: "Butchers of Khorne", d: "Take and Hold", dp: 1 },
    { n: "Cult of Blood", d: "Priority Assets", dp: 2 },
    { n: "Goretrack Onslaught", d: "Take and Hold", dp: 2 },
    { n: "Khorne Daemonkin", d: "Reconnaissance", dp: 2 },
    { n: "Possessed Slaughterband", d: "Purge the Foe", dp: 2 },
    { n: "Vessels of Wrath", d: "Priority Assets", dp: 1 },
  ],
  "Emperor's Children": [
    { n: "Carnival of Excess", d: "Disruption", d2: "Priority Assets", dp: 3 },
    { n: "Coterie of the Conceited", d: "Priority Assets", d2: "Purge the Foe", dp: 3 },
    { n: "Court of the Phoenician", d: "Purge the Foe", dp: 2 },
    { n: "Elegant Brutes", d: "Take and Hold", dp: 1 },
    { n: "Frenzied Host", d: "Reconnaissance", dp: 1 },
    { n: "Mercurial Host", d: "Reconnaissance", dp: 2 },
    { n: "Peerless Bladesmen", d: "Priority Assets", dp: 2 },
    { n: "Rapid Evisceration", d: "Disruption", dp: 2 },
    { n: "Slaanesh's Chosen", d: "Purge the Foe", dp: 1 },
    { n: "Spectacle of Slaughter", d: "Disruption", dp: 1 },
  ],
  "Death Guard": [
    { n: "Paragons of Putrescence", d: "Priority Assets", dp: 1, new: true },
    { n: "Contagion Engines", d: "Reconnaissance", dp: 1, new: true },
    { n: "Flyblown Host", d: "Reconnaissance", dp: 1, new: true },
    { n: "Champions of Contagion", d: "Take and Hold", dp: 2 },
    { n: "Death Lord's Chosen", d: "Priority Assets", dp: 2 },
    { n: "Mortarion's Hammer", d: "Purge the Foe", dp: 2 },
    { n: "Shamblerot Vectorium", d: "Disruption", dp: 2 },
    { n: "Tallyband Summoners", d: "Disruption", dp: 2 },
    { n: "Virulent Vectorium", d: "Take and Hold", d2: "Purge the Foe", dp: 3 },
  ],
  "Thousand Sons": [
    { n: "Changehost of Deceit", d: "Reconnaissance", dp: 2 },
    { n: "Grand Coven", d: "Disruption", d2: "Priority Assets", dp: 3 },
    { n: "Hexwarp Thrallband", d: "Take and Hold", d2: "Reconnaissance", dp: 3 },
    { n: "Ritual of Regeneration", d: "Take and Hold", dp: 1 },
    { n: "Rubricae Phalanx", d: "Take and Hold", d2: "Priority Assets", dp: 3 },
    { n: "Sekhetar Cohort", d: "Disruption", dp: 1 },
    { n: "Servants of Change", d: "Reconnaissance", dp: 1 },
    { n: "Warpforged Cabal", d: "Priority Assets", dp: 2 },
    { n: "Warpmeld Pact", d: "Purge the Foe", dp: 2 },
  ],
  "Chaos Knights": [
    { n: "Bastions of Tyranny", d: "Priority Assets", dp: 1, new: true },
    { n: "Hunting Warpack", d: "Reconnaissance", dp: 1, new: true },
    { n: "Iconoclast Fiefdom", d: "Take and Hold", dp: 1, new: true },
    { n: "Helhunt Lance", d: "Disruption", dp: 2 },
    { n: "Houndpack Lance", d: "Reconnaissance", dp: 2 },
    { n: "Infernal Lance", d: "Priority Assets", d2: "Purge the Foe", dp: 3 },
    { n: "Lords of Dread", d: "Take and Hold", dp: 2 },
    { n: "Traitoris Lance", d: "Purge the Foe", dp: 2 },
  ],
  "Chaos Daemons": [
    { n: "Cavalcade of Chaos", d: "Disruption", dp: 1, new: true },
    { n: "Lords of the Warp", d: "Take and Hold", dp: 1, new: true },
    { n: "Warptide", d: "Reconnaissance", dp: 1, new: true },
    { n: "Blood Legion", d: "Purge the Foe", dp: 2 },
    { n: "Daemonic Incursion", d: "Take and Hold", d2: "Disruption", dp: 3 },
    { n: "Legion of Excess", d: "Priority Assets", dp: 2 },
    { n: "Plague Legion", d: "Take and Hold", dp: 2 },
    { n: "Scintillating Legion", d: "Priority Assets", dp: 2 },
    { n: "Shadow Legion", d: "Purge the Foe", dp: 2 },
  ],
  Orks: [
    { n: "Brute Bosses", d: "Purge the Foe", dp: 1, new: true },
    { n: "Flyboyz", d: "Reconnaissance", dp: 1, new: true },
    { n: "Madcap Meks", d: "Disruption", dp: 1, new: true },
    { n: "Runt Swarm", d: "Priority Assets", dp: 1, new: true },
    { n: "Shoota Boyz", d: "Purge the Foe", dp: 1, new: true },
    { n: "Wreckas", d: "Priority Assets", dp: 1, new: true },
    { n: "Wurrband", d: "Disruption", dp: 1, new: true },
    { n: "Blitz Brigade", d: "Take and Hold", dp: 1 },
    { n: "Bully Boyz", d: "Purge the Foe", dp: 1 },
    { n: "Da Big Hunt", d: "Purge the Foe", dp: 1 },
    { n: "Dread Mob", d: "Purge the Foe", dp: 1 },
    { n: "Green Tide", d: "Take and Hold", dp: 1 },
    { n: "Kult of Speed", d: "Reconnaissance", dp: 1 },
    { n: "Taktikal Brigade", d: "Take and Hold", dp: 1 },
    { n: "War Horde", d: "Take and Hold", d2: "Purge the Foe", dp: 3 },
  ],
  Aeldari: [
    { n: "Armoured Warhost", d: "Reconnaissance", dp: 1 },
    { n: "Aspect Host", d: "Priority Assets", d2: "Reconnaissance", dp: 3 },
    { n: "Corsair Coterie", d: "Priority Assets", dp: 2 },
    { n: "Devoted of Ynnead", d: "Priority Assets", dp: 2 },
    { n: "Eldritch Raiders", d: "Purge the Foe", dp: 2 },
    { n: "Fateful Performance", d: "Disruption", dp: 1 },
    { n: "Ghosts of the Webway", d: "Disruption", dp: 2 },
    { n: "Guardian Battlehost", d: "Take and Hold", dp: 2 },
    { n: "Path of the Outcast", d: "Reconnaissance", dp: 1 },
    { n: "Seer Council", d: "Priority Assets", dp: 2 },
    { n: "Serpent's Brood", d: "Purge the Foe", dp: 2 },
    { n: "Spirit Conclave", d: "Take and Hold", dp: 2 },
    { n: "Twilight Flickers", d: "Take and Hold", dp: 1 },
    { n: "Warhost", d: "Reconnaissance", dp: 2 },
    { n: "Windrider Host", d: "Disruption", dp: 2 },
  ],
  Drukhari: [
    { n: "Covenite Coterie", d: "Take and Hold", dp: 2 },
    { n: "Exhibition of Slaughter", d: "Reconnaissance", dp: 1 },
    { n: "Kabalite Agonysts", d: "Disruption", dp: 1 },
    { n: "Kabalite Cartel", d: "Disruption", dp: 2 },
    { n: "Realspace Raiders", d: "Priority Assets", dp: 2 },
    { n: "Reaper's Wager", d: "Priority Assets", d2: "Purge the Foe", dp: 3 },
    { n: "Skysplinter Assault", d: "Reconnaissance", dp: 2 },
    { n: "Spectacle of Spite", d: "Purge the Foe", dp: 2 },
    { n: "Tools of Torment", d: "Take and Hold", dp: 1 },
  ],
  Tyranids: [
    { n: "Ambush Predators", d: "Disruption", dp: 1, new: true },
    { n: "Talons of the Norn Queen", d: "Take and Hold", dp: 1, new: true },
    { n: "Warrior Bioform Onslaught", d: "Take and Hold", dp: 1, new: true },
    { n: "Assimilation Swarm", d: "Priority Assets", dp: 2 },
    { n: "Crusher Stampede", d: "Purge the Foe", dp: 2 },
    { n: "Invasion Fleet", d: "Take and Hold", d2: "Priority Assets", dp: 3 },
    { n: "Subterranean Assault", d: "Disruption", d2: "Reconnaissance", dp: 3 },
    { n: "Synaptic Nexus", d: "Disruption", dp: 2 },
    { n: "Unending Swarm", d: "Take and Hold", dp: 2 },
    { n: "Vanguard Onslaught", d: "Reconnaissance", dp: 2 },
  ],
  "Genestealer Cults": [
    { n: "Heroes of the Uprising", d: "Disruption", dp: 1, new: true },
    { n: "Purestrain Broodswarm", d: "Priority Assets", dp: 1, new: true },
    { n: "Xenocult Masses", d: "Reconnaissance", dp: 1, new: true },
    { n: "Biosanctic Broodsurge", d: "Take and Hold", dp: 2 },
    { n: "Brood Brothers Auxilia", d: "Take and Hold", dp: 2 },
    { n: "Final Day", d: "Purge the Foe", dp: 2 },
    { n: "Host of Ascension", d: "Take and Hold", d2: "Reconnaissance", dp: 3 },
    { n: "Outlander Claw", d: "Reconnaissance", dp: 2 },
    { n: "Xenocreed Congregation", d: "Priority Assets", dp: 2 },
  ],
  Necrons: [
    { n: "Annihilation Legion", d: "Purge the Foe", dp: 2 },
    { n: "Awakened Dynasty", d: "Take and Hold", d2: "Priority Assets", dp: 3 },
    { n: "Canoptek Court", d: "Take and Hold", dp: 2 },
    { n: "Cryptek Conclave", d: "Priority Assets", dp: 2 },
    { n: "Cursed Legion", d: "Purge the Foe", dp: 2 },
    { n: "Hand of the Dynasty", d: "Take and Hold", dp: 1 },
    { n: "Hypercrypt Legion", d: "Reconnaissance", dp: 2 },
    { n: "Obeisance Phalanx", d: "Disruption", dp: 2 },
    { n: "Pantheon of Woe", d: "Disruption", dp: 2 },
    { n: "Skyshroud Spearhead", d: "Reconnaissance", dp: 1 },
    { n: "Starshatter Arsenal", d: "Priority Assets", d2: "Purge the Foe", dp: 3 },
    { n: "The Phaeron's Armoury", d: "Priority Assets", dp: 1 },
  ],
  "Leagues of Votann": [
    { n: "Armoured Trailblazers", d: "Disruption", dp: 1, new: true },
    { n: "Farseekers", d: "Reconnaissance", dp: 1, new: true },
    { n: "Hearthguard Covenant", d: "Priority Assets", dp: 1, new: true },
    { n: "Brandfast Oathband", d: "Take and Hold", dp: 2 },
    { n: "Dêlve Assault Shift", d: "Purge the Foe", dp: 2 },
    { n: "Hearthband", d: "Priority Assets", d2: "Reconnaissance", dp: 3 },
    { n: "Hearthfyre Arsenal", d: "Priority Assets", dp: 2 },
    { n: "Mercenary Oathband", d: "Take and Hold", dp: 2 },
    { n: "Needgaârd Oathband", d: "Purge the Foe", dp: 2 },
    { n: "Persecution Prospect", d: "Disruption", dp: 2 },
  ],
  "T'au Empire": [
    { n: "Advanced Acquisition Cadre", d: "Reconnaissance", dp: 1 },
    { n: "Auxiliary Cadre", d: "Disruption", dp: 1 },
    { n: "Experimental Prototype Cadre", d: "Priority Assets", dp: 1 },
    { n: "Kauyon", d: "Reconnaissance", dp: 2 },
    { n: "Kroot Hunting Pack", d: "Take and Hold", dp: 2 },
    { n: "Mont'ka", d: "Take and Hold", d2: "Priority Assets", dp: 3 },
    { n: "Retaliation Cadre", d: "Purge the Foe", d2: "Reconnaissance", dp: 3 },
  ],
};

export const GROUPS: Record<string, string[]> = {
  "Space Marines": [
    "Space Marines",
    "Dark Angels",
    "Blood Angels",
    "Space Wolves",
    "Black Templars",
    "Grey Knights",
    "Deathwatch",
  ],
  Imperial: [
    "Astra Militarum",
    "Adepta Sororitas",
    "Adeptus Mechanicus",
    "Imperial Knights",
    "Adeptus Custodes",
    "Imperial Agents",
  ],
  Chaos: [
    "Chaos Space Marines",
    "World Eaters",
    "Emperor's Children",
    "Death Guard",
    "Thousand Sons",
    "Chaos Knights",
    "Chaos Daemons",
  ],
  Xenos: [
    "Orks",
    "Aeldari",
    "Drukhari",
    "Tyranids",
    "Genestealer Cults",
    "Necrons",
    "Leagues of Votann",
    "T'au Empire",
  ],
};

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function getFactionBySlug(slug: string): string | undefined {
  return Object.keys(FACTIONS).find((f) => slugify(f) === slug);
}

export function getGroupForFaction(faction: string): string | undefined {
  return Object.entries(GROUPS).find(([, facs]) =>
    facs.includes(faction)
  )?.[0];
}
