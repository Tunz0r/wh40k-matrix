export interface Mission {
  name: string;
  desc: string;
}

export interface DispositionInfo {
  desc: string;
  color: string;
  bg: string;
  vs: Record<string, Mission>;
}

export interface Detachment {
  n: string;
  d: Disposition;
  dp: number;
  new?: boolean;
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
    color: "rgb(59,130,246)",
    bg: "rgba(59,130,246,0.12)",
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
    color: "rgb(34,197,94)",
    bg: "rgba(34,197,94,0.12)",
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
    color: "rgb(59,130,246)",
    bg: "rgba(59,130,246,0.12)",
    vs: {
      "Take and Hold": {
        name: "Battlefield Dominance",
        desc: "Klassisk symmetrisk kamp — score VP for at holde flest markers ved slutningen af hvert battle round.",
      },
      "Purge the Foe": {
        name: "Immovable Object",
        desc: "Hold objectives mens modstanderen forsøger at destruere dine styrker. Overlev angrebet og bevar boardcontrol.",
      },
      Disruption: {
        name: "Determined Acquisition",
        desc: "Race om at låse markers ned inden fjenden kan udføre actions i nærheden af dem.",
      },
      Reconnaissance: {
        name: "Purge and Secure",
        desc: "Hold objectives mens Recon-fjenden ranger frit. Kontrol skifter konstant — dynamisk og krævende.",
      },
      "Priority Assets": {
        name: "Inescapable Dominion",
        desc: "Begge sider tiltrækkes til de samme hotspots — hold dine objectives og benægt fjenden Priority Markers.",
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
        desc: "Jagt og destruer fjenden mens de forsøger at holde objectives. Klassisk angriber vs. forsvarer.",
      },
      "Purge the Foe": {
        name: "Meatgrinder",
        desc: "Begge sider scorer for at destruere enheder. Brutal symmetrisk tilintetgørelseskamp — den hårdeste vinder.",
      },
      Disruption: {
        name: "Punishment",
        desc: "Jagt den undvigende Disruption-fjend mens de forsøger at udføre actions. Spind dem ned.",
      },
      Reconnaissance: {
        name: "Consecrate",
        desc: "Dræb enheder mens Recon-fjenden forsøger at nå alle zoner. Mobil og attritional kamp over hele bordet.",
      },
      "Priority Assets": {
        name: "Destroyer's Wrath",
        desc: "Bryd igennem og destruer forsvarernes enheder, der klynger sig om Priority Assets.",
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
        desc: "Infiltrer fjendtligt holdt territorium og udfør actions mens fjenden scorer for objectives. Høj risiko, høj belønning.",
      },
      "Purge the Foe": {
        name: "Delaying Action",
        desc: "Overlev og udfør actions mens en aggressiv fjend jager dig. Bliv mobil og levende.",
      },
      Disruption: {
        name: "Outmanoeuvre",
        desc: "Begge sider scorer for actions og denial. Positionering og action economy afgør vinderen.",
      },
      Reconnaissance: {
        name: "Smoke and Mirrors",
        desc: "Disruption udfører actions; Recon scanner zoner. En duel om hurtighed og snedighed.",
      },
      "Priority Assets": {
        name: "Locate and Deny",
        desc: "Act near or deny priority markers while the defender protects them. Specific terrain is decisive.",
      },
    },
  },
  Reconnaissance: {
    desc: "Move into and scan different areas of the battlefield.",
    color: "rgb(34,197,94)",
    bg: "rgba(34,197,94,0.12)",
    vs: {
      "Take and Hold": {
        name: "Reconnaissance Sweep",
        desc: "Scan zoner og range frit over et board fjenden forsøger at låse ned. Spred dig og skor.",
      },
      "Purge the Foe": {
        name: "Triangulation",
        desc: "Scan kvadranter mens en fjend jager dine enheder. Scouts skal overleve en ubarmhjertig jæger.",
      },
      Disruption: {
        name: "Surveil the Foe",
        desc: "Begge er mobile og hurtige — scanner og udfører actions. Afgjort af hvem der afslutter sine opgaver først.",
      },
      Reconnaissance: {
        name: "Gather Intel",
        desc: "Symmetrisk race over bordet — speed og boarddækning vinder. Scan mest, skor mest.",
      },
      "Priority Assets": {
        name: "Search and Scour",
        desc: "Sweep hele bordet mens Priority-fjenden forsvarer markers. Nå alle hjørner mens de klynger sig.",
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
        desc: "Scorer for markerede objectives mens fjenden scorer for alle. Contested markers er afgørende hotspots.",
      },
      "Purge the Foe": {
        name: "Vital Link",
        desc: "Forsvar Priority Assets mod en destruktiv fjend. Hold linjen og beskyt dine prized objectives.",
      },
      Disruption: {
        name: "Extract Relic",
        desc: "Forsvar markers mod en fjend der forsøger at act near dem. Spændt defensivt mission.",
      },
      Reconnaissance: {
        name: "Vanguard Operation",
        desc: "Forankr om assets mens Recon-fjenden ranger frit og scorer andre steder på bordet.",
      },
      "Priority Assets": {
        name: "Sabotage",
        desc: "Begge kæmper om de samme markerede objectives. High-stakes symmetrisk kamp om nøglepunkter.",
      },
    },
  },
};

export const FACTIONS: Record<string, Detachment[]> = {
  "Space Marines": [
    { n: "Fulguris Task Force", d: "Disruption", dp: 1, new: true },
    { n: "Librarius Conclave", d: "Reconnaissance", dp: 1, new: true },
    { n: "Subversion Assets", d: "Reconnaissance", dp: 1, new: true },
    { n: "1st Company Task Force", d: "Priority Assets", dp: 2 },
    { n: "Anvil Siege Force", d: "Take and Hold", dp: 2 },
    { n: "Armoured Speartip", d: "Take and Hold", dp: 3 },
    { n: "Bastion Task Force", d: "Take and Hold", dp: 2 },
    { n: "Blade of Ultramar", d: "Priority Assets", dp: 3 },
    { n: "Ceramite Sentinels", d: "Take and Hold", dp: 3 },
    { n: "Emperor's Shield", d: "Priority Assets", dp: 2 },
    { n: "Firestorm Assault Force", d: "Purge the Foe", dp: 2 },
    { n: "Forgefather's Seekers", d: "Purge the Foe", dp: 2 },
    { n: "Gladius Task Force", d: "Priority Assets", dp: 3 },
    { n: "Hammer of Avernii", d: "Priority Assets", dp: 2 },
    { n: "Headhunter Task Force", d: "Priority Assets", dp: 2 },
    { n: "Ironstorm Spearhead", d: "Purge the Foe", dp: 2 },
    { n: "Orbital Assault Force", d: "Take and Hold", dp: 2 },
    { n: "Reclamation Force", d: "Take and Hold", dp: 2 },
    { n: "Shadowmark Talon", d: "Disruption", dp: 2 },
    { n: "Spearpoint Task Force", d: "Disruption", dp: 2 },
    { n: "Stormlance Task Force", d: "Disruption", dp: 3 },
    { n: "Vanguard Spearhead", d: "Reconnaissance", dp: 2 },
  ],
  "Dark Angels": [
    { n: "Dark Age Arsenal", d: "Priority Assets", dp: 1, new: true },
    { n: "Darkflight Pursuit", d: "Reconnaissance", dp: 1, new: true },
    { n: "Interrogation Conclave", d: "Purge the Foe", dp: 1, new: true },
    { n: "Company of Hunters", d: "Disruption", dp: 2 },
    { n: "Inner Circle Task Force", d: "Priority Assets", dp: 2 },
    { n: "Lion's Blade Task Force", d: "Purge the Foe", dp: 2 },
    { n: "Unforgiven Task Force", d: "Take and Hold", dp: 2 },
    { n: "Wrath of the Rock", d: "Priority Assets", dp: 3 },
  ],
  "Blood Angels": [
    { n: "Encarmine Speartip", d: "Disruption", dp: 1, new: true },
    { n: "Legacy of Grace", d: "Priority Assets", dp: 1, new: true },
    { n: "Wrath of the Doomed", d: "Purge the Foe", dp: 1, new: true },
    { n: "Angelic Inheritors", d: "Priority Assets", dp: 3 },
    { n: "Liberator Assault Group", d: "Take and Hold", dp: 3 },
    { n: "Rage-cursed Onslaught", d: "Purge the Foe", dp: 3 },
    { n: "The Angelic Host", d: "Disruption", dp: 2 },
    { n: "The Lost Brethren", d: "Purge the Foe", dp: 2 },
  ],
  "Space Wolves": [
    { n: "Champions of Fenris", d: "Purge the Foe", dp: 1, new: true },
    { n: "Legends of Saga and Song", d: "Take and Hold", dp: 1, new: true },
    { n: "Veterans of the Fang", d: "Disruption", dp: 1, new: true },
    { n: "Saga of the Beastslayer", d: "Purge the Foe", dp: 2 },
    { n: "Saga of the Bold", d: "Priority Assets", dp: 2 },
    { n: "Saga of the Great Wolf", d: "Take and Hold", dp: 2 },
    { n: "Saga of the Hunter", d: "Disruption", dp: 2 },
  ],
  "Black Templars": [
    { n: "Marshal's Household", d: "Priority Assets", dp: 1, new: true },
    { n: "The Living Miracle", d: "Purge the Foe", dp: 1, new: true },
    { n: "Wrathful Procession", d: "Take and Hold", dp: 1, new: true },
    { n: "Companions of Vehemence", d: "Purge the Foe", dp: 2 },
    { n: "Godhammer Assault Force", d: "Disruption", dp: 2 },
    { n: "Vindication Task Force", d: "Priority Assets", dp: 2 },
  ],
  "Grey Knights": [
    { n: "Argent Assault", d: "Purge the Foe", dp: 1, new: true },
    { n: "Fires of Purgation", d: "Disruption", dp: 1, new: true },
    { n: "Immaterial Interdiction", d: "Priority Assets", dp: 1, new: true },
    { n: "Augurium Task Force", d: "Reconnaissance", dp: 2 },
    { n: "Banishers", d: "Disruption", dp: 2 },
    { n: "Brotherhood Strike", d: "Purge the Foe", dp: 2 },
    { n: "Hallowed Conclave", d: "Take and Hold", dp: 2 },
    { n: "Sanctic Spearhead", d: "Priority Assets", dp: 2 },
    { n: "Warpbane Task Force", d: "Purge the Foe", dp: 3 },
  ],
  Deathwatch: [{ n: "Black Spear Task Force", d: "Priority Assets", dp: 3 }],
  "Astra Militarum": [
    { n: "Abhuman Auxiliaries", d: "Take and Hold", dp: 1, new: true },
    { n: "Bridgehead Strike", d: "Priority Assets", dp: 1, new: true },
    { n: "Designation Force", d: "Reconnaissance", dp: 1, new: true },
    { n: "Armoured Infantry", d: "Take and Hold", dp: 2 },
    { n: "Combined Arms", d: "Take and Hold", dp: 3 },
    { n: "Grizzled Company", d: "Priority Assets", dp: 3 },
    { n: "Hammer of the Emperor", d: "Purge the Foe", dp: 2 },
    { n: "Mechanised Assault", d: "Purge the Foe", dp: 2 },
    { n: "Recon Element", d: "Reconnaissance", dp: 3 },
    { n: "Siege Regiment", d: "Disruption", dp: 2 },
    { n: "Steel Hammer", d: "Purge the Foe", dp: 2 },
  ],
  "Adepta Sororitas": [
    { n: "Chorus of Condemnation", d: "Reconnaissance", dp: 1, new: true },
    { n: "Sacred Champions", d: "Take and Hold", dp: 1, new: true },
    { n: "Sanctified Orators", d: "Purge the Foe", dp: 1, new: true },
    { n: "Army of Faith", d: "Take and Hold", dp: 2 },
    { n: "Bringers of Flame", d: "Purge the Foe", dp: 3 },
    { n: "Champions of Faith", d: "Disruption", dp: 2 },
    { n: "Hallowed Martyrs", d: "Priority Assets", dp: 3 },
    { n: "Penitent Host", d: "Take and Hold", dp: 2 },
  ],
  "Adeptus Mechanicus": [
    { n: "Cohort Acquisitus", d: "Reconnaissance", dp: 1, new: true },
    { n: "Lords of the Forge", d: "Priority Assets", dp: 1, new: true },
    { n: "Luminen Auto-Choir", d: "Disruption", dp: 1, new: true },
    { n: "Cohort Cybernetica", d: "Take and Hold", dp: 2 },
    { n: "Data-psalm Conclave", d: "Disruption", dp: 2 },
    { n: "Eradication Cohort", d: "Purge the Foe", dp: 3 },
    { n: "Explorator Maniple", d: "Priority Assets", dp: 2 },
    { n: "Haloscreed Battle Clade", d: "Purge the Foe", dp: 3 },
    { n: "Rad-zone Corps", d: "Take and Hold", dp: 2 },
    { n: "Skitarii Hunter Cohort", d: "Reconnaissance", dp: 2 },
  ],
  "Imperial Knights": [
    { n: "Dominus Foebreakers", d: "Purge the Foe", dp: 1, new: true },
    { n: "Questor Forgepact", d: "Disruption", dp: 1, new: true },
    { n: "Throne-bonded Outriders", d: "Reconnaissance", dp: 1, new: true },
    { n: "Freeblade Company", d: "Purge the Foe", dp: 3 },
    { n: "Gate Warden Lance", d: "Priority Assets", dp: 2 },
    { n: "Questoris Companions", d: "Take and Hold", dp: 3 },
    { n: "Spearhead-at-arms", d: "Reconnaissance", dp: 2 },
    { n: "Valourstrike Lance", d: "Purge the Foe", dp: 2 },
  ],
  "Adeptus Custodes": [
    { n: "Might of the Moritoi", d: "Purge the Foe", dp: 1, new: true },
    { n: "Silent Hunters", d: "Reconnaissance", dp: 1, new: true },
    { n: "Tharanatoi Hammerblow", d: "Priority Assets", dp: 1, new: true },
    { n: "Auric Champions", d: "Priority Assets", dp: 2 },
    { n: "Lions of the Emperor", d: "Disruption", dp: 2 },
    { n: "Null Maiden Vigil", d: "Reconnaissance", dp: 2 },
    { n: "Shield Host", d: "Purge the Foe", dp: 2 },
    { n: "Solar Spearhead", d: "Take and Hold", dp: 2 },
    { n: "Talons of the Emperor", d: "Take and Hold", dp: 3 },
  ],
  "Imperial Agents": [
    { n: "Imperialis Fleet", d: "Disruption", dp: 3 },
    { n: "Ordo Hereticus, Purgation Force", d: "Priority Assets", dp: 3 },
    { n: "Ordo Malleus, Daemon Hunters", d: "Reconnaissance", dp: 3 },
    { n: "Ordo Xenos, Alien Hunters", d: "Purge the Foe", dp: 3 },
    { n: "Veiled Blade Elimination Force", d: "Purge the Foe", dp: 3 },
  ],
  "Chaos Space Marines": [
    { n: "Cabal of Chaos", d: "Disruption", dp: 1, new: true },
    { n: "Devotees of Destruction", d: "Priority Assets", dp: 1, new: true },
    { n: "Murdertalon Raiders", d: "Purge the Foe", dp: 1, new: true },
    { n: "Chaos Cult", d: "Priority Assets", dp: 2 },
    { n: "Creations of Bile", d: "Purge the Foe", dp: 3 },
    { n: "Cult of the Arkifane", d: "Priority Assets", dp: 2 },
    { n: "Deceptors", d: "Disruption", dp: 2 },
    { n: "Dread Talons", d: "Disruption", dp: 2 },
    { n: "Fellhammer Siege-host", d: "Take and Hold", dp: 2 },
    { n: "Huron's Marauders", d: "Disruption", dp: 3 },
    { n: "Nightmare Hunt", d: "Disruption", dp: 2 },
    { n: "Pactbound Zealots", d: "Priority Assets", dp: 3 },
    { n: "Renegade Raiders", d: "Reconnaissance", dp: 3 },
    { n: "Renegade Warband", d: "Priority Assets", dp: 2 },
    { n: "Soulforged Warpack", d: "Purge the Foe", dp: 2 },
    { n: "Veterans of the Long War", d: "Take and Hold", dp: 2 },
    { n: "Warpstrike Champions", d: "Disruption", dp: 2 },
  ],
  "World Eaters": [
    { n: "Butchers of Khorne", d: "Disruption", dp: 1, new: true },
    { n: "Brazen Engines", d: "Purge the Foe", dp: 1, new: true },
    { n: "Vessels of Wrath", d: "Priority Assets", dp: 1, new: true },
    { n: "Berzerker Warband", d: "Purge the Foe", dp: 3 },
    { n: "Cult of Blood", d: "Priority Assets", dp: 2 },
    { n: "Goretrack Onslaught", d: "Take and Hold", dp: 2 },
    { n: "Khorne Daemonkin", d: "Reconnaissance", dp: 2 },
    { n: "Possessed Slaughterband", d: "Purge the Foe", dp: 2 },
  ],
  "Emperor's Children": [
    { n: "Elegant Brutes", d: "Take and Hold", dp: 1, new: true },
    { n: "Frenzied Host", d: "Disruption", dp: 1, new: true },
    { n: "Spectacle of Slaughter", d: "Purge the Foe", dp: 1, new: true },
    { n: "Carnival of Excess", d: "Priority Assets", dp: 2 },
    { n: "Coterie of the Conceited", d: "Purge the Foe", dp: 3 },
    { n: "Court of the Phoenician", d: "Purge the Foe", dp: 2 },
    { n: "Mercurial Host", d: "Reconnaissance", dp: 2 },
    { n: "Peerless Bladesmen", d: "Priority Assets", dp: 2 },
    { n: "Rapid Evisceration", d: "Disruption", dp: 2 },
    { n: "Slaanesh's Chosen", d: "Purge the Foe", dp: 2 },
  ],
  "Death Guard": [
    { n: "Paragons of Putrescence", d: "Priority Assets", dp: 1, new: true },
    { n: "Contagion Engines", d: "Purge the Foe", dp: 1, new: true },
    { n: "Flyblown Host", d: "Reconnaissance", dp: 1, new: true },
    { n: "Champions of Contagion", d: "Take and Hold", dp: 2 },
    { n: "Death Lord's Chosen", d: "Priority Assets", dp: 2 },
    { n: "Mortarion's Hammer", d: "Purge the Foe", dp: 2 },
    { n: "Shamblerot Vectorium", d: "Disruption", dp: 2 },
    { n: "Tallyband Summoners", d: "Disruption", dp: 2 },
    { n: "Virulent Vectorium", d: "Take and Hold", dp: 3 },
  ],
  "Thousand Sons": [
    { n: "Ritual of Regeneration", d: "Purge the Foe", dp: 1, new: true },
    { n: "Sekhetar Cohort", d: "Priority Assets", dp: 1, new: true },
    { n: "Servants of Change", d: "Reconnaissance", dp: 1, new: true },
    { n: "Changehost of Deceit", d: "Reconnaissance", dp: 2 },
    { n: "Grand Coven", d: "Priority Assets", dp: 3 },
    { n: "Hexwarp Thrallband", d: "Take and Hold", dp: 2 },
    { n: "Rubricae Phalanx", d: "Take and Hold", dp: 3 },
    { n: "Warpforged Cabal", d: "Disruption", dp: 2 },
    { n: "Warpmeld Pact", d: "Purge the Foe", dp: 2 },
  ],
  "Chaos Knights": [
    { n: "Bastions of Tyranny", d: "Disruption", dp: 1, new: true },
    { n: "Hunting Warpack", d: "Reconnaissance", dp: 1, new: true },
    { n: "Iconoclast Fiefdom", d: "Take and Hold", dp: 1, new: true },
    { n: "Helhunt Lance", d: "Disruption", dp: 2 },
    { n: "Houndpack Lance", d: "Reconnaissance", dp: 2 },
    { n: "Infernal Lance", d: "Purge the Foe", dp: 3 },
    { n: "Lords of Dread", d: "Priority Assets", dp: 2 },
    { n: "Traitoris Lance", d: "Purge the Foe", dp: 2 },
  ],
  "Chaos Daemons": [
    { n: "Cavalcade of Chaos", d: "Disruption", dp: 1, new: true },
    { n: "Lords of the Warp", d: "Purge the Foe", dp: 1, new: true },
    { n: "Warptide", d: "Reconnaissance", dp: 1, new: true },
    { n: "Blood Legion", d: "Purge the Foe", dp: 2 },
    { n: "Daemonic Incursion", d: "Disruption", dp: 3 },
    { n: "Legion of Excess", d: "Priority Assets", dp: 2 },
    { n: "Plague Legion", d: "Take and Hold", dp: 2 },
    { n: "Scintillating Legion", d: "Priority Assets", dp: 2 },
    { n: "Shadow Legion", d: "Purge the Foe", dp: 2 },
  ],
  Orks: [
    { n: "More Dakka!", d: "Purge the Foe", dp: 1, new: true },
    { n: "Rollin' Deff", d: "Priority Assets", dp: 1, new: true },
    { n: "Taktikal Brigade", d: "Disruption", dp: 1, new: true },
    { n: "Blitz Brigade", d: "Reconnaissance", dp: 2 },
    { n: "Bully Boyz", d: "Purge the Foe", dp: 2 },
    { n: "Da Big Hunt", d: "Purge the Foe", dp: 2 },
    { n: "Dread Mob", d: "Purge the Foe", dp: 2 },
    { n: "Freebooter Krew", d: "Take and Hold", dp: 2 },
    { n: "Green Tide", d: "Take and Hold", dp: 2 },
    { n: "Kult of Speed", d: "Disruption", dp: 2 },
    { n: "Speedwaaagh!", d: "Reconnaissance", dp: 2 },
    { n: "War Horde", d: "Take and Hold", dp: 3 },
  ],
  Aeldari: [
    { n: "Armoured Warhost", d: "Reconnaissance", dp: 1, new: true },
    { n: "Fateful Performance", d: "Disruption", dp: 1, new: true },
    { n: "Path of the Outcast", d: "Reconnaissance", dp: 1, new: true },
    { n: "Twilight Flickers", d: "Take and Hold", dp: 1, new: true },
    { n: "Aspect Host", d: "Disruption", dp: 3 },
    { n: "Corsair Coterie", d: "Priority Assets", dp: 2 },
    { n: "Devoted of Ynnead", d: "Priority Assets", dp: 2 },
    { n: "Eldritch Raiders", d: "Disruption", dp: 2 },
    { n: "Ghosts of the Webway", d: "Disruption", dp: 2 },
    { n: "Guardian Battlehost", d: "Take and Hold", dp: 2 },
    { n: "Seer Council", d: "Priority Assets", dp: 2 },
    { n: "Serpent's Brood", d: "Purge the Foe", dp: 2 },
    { n: "Spirit Conclave", d: "Take and Hold", dp: 2 },
    { n: "Warhost", d: "Purge the Foe", dp: 3 },
    { n: "Windrider Host", d: "Disruption", dp: 2 },
  ],
  Drukhari: [
    { n: "Exhibition of Slaughter", d: "Disruption", dp: 1, new: true },
    { n: "Kabalite Agonysts", d: "Purge the Foe", dp: 1, new: true },
    { n: "Tools of Torment", d: "Take and Hold", dp: 1, new: true },
    { n: "Covenite Coterie", d: "Purge the Foe", dp: 2 },
    { n: "Kabalite Cartel", d: "Disruption", dp: 2 },
    { n: "Realspace Raiders", d: "Priority Assets", dp: 2 },
    { n: "Reaper's Wager", d: "Purge the Foe", dp: 3 },
    { n: "Skysplinter Assault", d: "Reconnaissance", dp: 2 },
    { n: "Spectacle of Spite", d: "Purge the Foe", dp: 2 },
  ],
  Tyranids: [
    { n: "Ambush Predators", d: "Disruption", dp: 1, new: true },
    { n: "Talons of the Norn Queen", d: "Take and Hold", dp: 1, new: true },
    { n: "Warrior Bioform Onslaught", d: "Take and Hold", dp: 1, new: true },
    { n: "Assimilation Swarm", d: "Priority Assets", dp: 2 },
    { n: "Crusher Stampede", d: "Purge the Foe", dp: 2 },
    { n: "Invasion Fleet", d: "Take and Hold", dp: 3 },
    { n: "Subterranean Assault", d: "Disruption", dp: 3 },
    { n: "Synaptic Nexus", d: "Disruption", dp: 2 },
    { n: "Unending Swarm", d: "Take and Hold", dp: 2 },
    { n: "Vanguard Onslaught", d: "Reconnaissance", dp: 2 },
  ],
  "Genestealer Cults": [
    { n: "Heroes of the Uprising", d: "Purge the Foe", dp: 1, new: true },
    { n: "Purestrain Broodswarm", d: "Priority Assets", dp: 1, new: true },
    { n: "Xenocult Masses", d: "Disruption", dp: 1, new: true },
    { n: "Biosanctic Broodsurge", d: "Take and Hold", dp: 2 },
    { n: "Brood Brothers Auxillia", d: "Take and Hold", dp: 2 },
    { n: "Final Day", d: "Purge the Foe", dp: 2 },
    { n: "Host of Ascension", d: "Take and Hold", dp: 3 },
    { n: "Outlander Claw", d: "Reconnaissance", dp: 2 },
    { n: "Xenocreed Congregation", d: "Priority Assets", dp: 2 },
  ],
  Necrons: [
    { n: "Hand of the Dynasty", d: "Take and Hold", dp: 1, new: true },
    { n: "Skyshroud Spearhead", d: "Reconnaissance", dp: 1, new: true },
    { n: "The Phaeron's Armoury", d: "Priority Assets", dp: 1, new: true },
    { n: "Annihilation Legion", d: "Purge the Foe", dp: 2 },
    { n: "Awakened Dynasty", d: "Take and Hold", dp: 3 },
    { n: "Canoptek Court", d: "Take and Hold", dp: 3 },
    { n: "Cryptek Conclave", d: "Priority Assets", dp: 2 },
    { n: "Cursed Legion", d: "Purge the Foe", dp: 2 },
    { n: "Hypercrypt Legion", d: "Reconnaissance", dp: 2 },
    { n: "Obeisance Phalanx", d: "Disruption", dp: 2 },
    { n: "Pantheon of Woe", d: "Purge the Foe", dp: 2 },
    { n: "Starshatter Arsenal", d: "Priority Assets", dp: 3 },
  ],
  "Leagues of Votann": [
    { n: "Armoured Trailblazers", d: "Disruption", dp: 1, new: true },
    { n: "Farseekers", d: "Reconnaissance", dp: 1, new: true },
    { n: "Hearthguard Covenant", d: "Priority Assets", dp: 1, new: true },
    { n: "Brandfast Oathband", d: "Take and Hold", dp: 2 },
    {
      n: "Dêlve Assault Shift",
      d: "Purge the Foe",
      dp: 2,
    },
    { n: "Hearthband", d: "Priority Assets", dp: 3 },
    { n: "Hearthfyre Arsenal", d: "Priority Assets", dp: 2 },
    { n: "Mercenary Oathband", d: "Take and Hold", dp: 2 },
    {
      n: "Needgaârd Oathband",
      d: "Purge the Foe",
      dp: 2,
    },
    { n: "Persecution Prospect", d: "Disruption", dp: 2 },
  ],
  "T'au Empire": [
    {
      n: "Advanced Acquisition Cadre",
      d: "Reconnaissance",
      dp: 1,
      new: true,
    },
    { n: "Auxillary Cadre", d: "Disruption", dp: 1, new: true },
    {
      n: "Experimental Prototype Cadre",
      d: "Priority Assets",
      dp: 1,
      new: true,
    },
    { n: "Kauyon", d: "Priority Assets", dp: 2 },
    { n: "Kroot Hunting Pack", d: "Take and Hold", dp: 2 },
    { n: "Mont'ka", d: "Purge the Foe", dp: 3 },
    { n: "Retaliation Cadre", d: "Purge the Foe", dp: 2 },
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
