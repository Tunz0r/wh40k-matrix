import { FACTIONS, type Disposition } from "./data";
import type { SeedingTier } from "./tournament-db";
import type { OpponentList } from "./estimates-db";

// Official WTC team ranking (wtc-belgium.com/team-tier-overview, "Current Team
// Ranking used to determine Seeding") split into four seeding tiers by rank.
// Teams from the selection-procedures page without a ranking go in Tier 4.
export const WTC_TIERS: SeedingTier[] = [
  {
    name: "Tier 1",
    teams: ["France", "USA", "Poland", "Sweden", "Germany", "Australia", "Austria", "England", "Belgium", "Scotland", "Canada"],
  },
  {
    name: "Tier 2",
    teams: ["Netherlands", "Italy", "Singapore", "Spain", "New Zealand", "Denmark", "Czechia", "Switzerland", "Thailand", "Ireland", "Iceland"],
  },
  {
    name: "Tier 3",
    teams: ["Portugal", "Wales", "Norway", "Greece", "Malta", "Latvia", "Finland", "China", "Slovakia", "Northern Ireland", "Israel"],
  },
  {
    name: "Tier 4",
    teams: ["Bulgaria", "Romania", "Hong Kong", "Mexico", "Slovenia", "South Africa", "Luxembourg", "South Korea", "Hungary", "Cyprus", "Croatia", "Andorra", "Argentina", "Gibraltar", "India/Pakistan", "Turkey", "Ukraine"],
  },
];

// Competitive archetypes drawn from the tournament-winning meta (listhammer,
// tabletop battles innovations columns etc.). Dispositions come from data.ts,
// and entries that don't match a real detachment are dropped at runtime.
const META_POOL_RAW: { faction: string; det: string }[] = [
  // Take and Hold cores
  { faction: "Necrons", det: "Awakened Dynasty" },
  { faction: "Orks", det: "Green Tide" },
  { faction: "Tyranids", det: "Invasion Fleet" },
  { faction: "Space Marines", det: "Anvil Siege Force" },
  { faction: "Genestealer Cults", det: "Biosanctic Broodsurge" },
  { faction: "Death Guard", det: "Virulent Vectorium" },
  { faction: "Blood Angels", det: "Liberator Assault Group" },
  { faction: "T'au Empire", det: "Kroot Hunting Pack" },
  { faction: "Leagues of Votann", det: "Brandfast Oathband" },
  { faction: "Thousand Sons", det: "Hexwarp Thrallband" },
  // Purge the Foe hammers
  { faction: "World Eaters", det: "Berzerker Warband" },
  { faction: "T'au Empire", det: "Mont'ka" },
  { faction: "Adeptus Custodes", det: "Shield Host" },
  { faction: "Orks", det: "Bully Boyz" },
  { faction: "Necrons", det: "Annihilation Legion" },
  { faction: "Adepta Sororitas", det: "Bringers of Flame" },
  { faction: "Imperial Knights", det: "Freeblade Company" },
  { faction: "Chaos Knights", det: "Traitoris Lance" },
  { faction: "Aeldari", det: "Warhost" },
  { faction: "Space Marines", det: "Ironstorm Spearhead" },
  { faction: "Emperor's Children", det: "Coterie of the Conceited" },
  { faction: "Grey Knights", det: "Warpbane Task Force" },
  { faction: "Chaos Daemons", det: "Blood Legion" },
  // Reconnaissance skirmishers
  { faction: "Necrons", det: "Hypercrypt Legion" },
  { faction: "Drukhari", det: "Skysplinter Assault" },
  { faction: "Aeldari", det: "Armoured Warhost" },
  { faction: "Tyranids", det: "Vanguard Onslaught" },
  { faction: "Thousand Sons", det: "Changehost of Deceit" },
  { faction: "Orks", det: "Speedwaaagh!" },
  { faction: "Genestealer Cults", det: "Outlander Claw" },
  { faction: "Adeptus Custodes", det: "Null Maiden Vigil" },
  { faction: "Space Marines", det: "Vanguard Spearhead" },
  { faction: "Adeptus Mechanicus", det: "Skitarii Hunter Cohort" },
  // Priority Assets scorers
  { faction: "Space Marines", det: "Gladius Task Force" },
  { faction: "T'au Empire", det: "Kauyon" },
  { faction: "Adeptus Custodes", det: "Auric Champions" },
  { faction: "Aeldari", det: "Seer Council" },
  { faction: "Necrons", det: "Starshatter Arsenal" },
  { faction: "Adepta Sororitas", det: "Hallowed Martyrs" },
  { faction: "Chaos Space Marines", det: "Pactbound Zealots" },
  { faction: "Death Guard", det: "Death Lord's Chosen" },
  { faction: "Leagues of Votann", det: "Hearthband" },
  { faction: "Drukhari", det: "Realspace Raiders" },
  { faction: "World Eaters", det: "Vessels of Wrath" },
  { faction: "Dark Angels", det: "Inner Circle Task Force" },
  { faction: "Deathwatch", det: "Black Spear Task Force" },
  // Disruption plays
  { faction: "Aeldari", det: "Aspect Host" },
  { faction: "Chaos Daemons", det: "Daemonic Incursion" },
  { faction: "Orks", det: "Kult of Speed" },
  { faction: "Space Marines", det: "Stormlance Task Force" },
  { faction: "Chaos Space Marines", det: "Deceptors" },
  { faction: "Tyranids", det: "Subterranean Assault" },
  { faction: "Chaos Knights", det: "Helhunt Lance" },
  { faction: "Adeptus Mechanicus", det: "Data-psalm Conclave" },
  { faction: "Adepta Sororitas", det: "Champions of Faith" },
  { faction: "Grey Knights", det: "Banishers" },
  { faction: "Black Templars", det: "Godhammer Assault Force" },
];

// Representative unit content for the top archetypes, transcribed from
// publicly published tournament-winning lists (Goonhammer Competitive
// Innovations, listhammer GT data). Keyed by `faction|detachment`.
// Model counts are kept so content-based similarity (unit overlap) activates
// on the test data — all of this is deleted once real WTC lists are imported.
const META_UNITS: Record<string, string[]> = {
  "World Eaters|Berzerker Warband": [
    "Angron", "Khorne Lord of Skulls", "10x Jakhals", "10x Jakhals",
    "6x Exalted Eightbound", "6x Exalted Eightbound", "3x Eightbound", "8x Khorne Berzerkers",
  ],
  "Orks|Green Tide": [
    "Ghazghkull Thraka", "Beastboss", "Warboss", "20x Boyz", "20x Boyz",
    "10x Gretchin", "5x Meganobz", "Gorkanaut", "3x Deffkoptas",
  ],
  "Orks|Bully Boyz": [
    "Ghazghkull Thraka", "Zodgrod Wortsnag", "10x Beast Snagga Boyz", "6x Nobz",
    "5x Meganobz", "5x Meganobz", "3x Squighog Boyz", "Battlewagon",
  ],
  "Aeldari|Warhost": [
    "Avatar of Khaine", "Farseer Skyrunner", "Autarch", "10x Guardian Defenders",
    "10x Guardian Defenders", "5x Rangers", "5x Wraithguard", "3x Fire Prisms", "Wraithknight",
  ],
  "Aeldari|Aspect Host": [
    "Yvraine", "Autarch Wayleaper", "10x Dire Avengers", "10x Howling Banshees",
    "5x Fire Dragons", "5x Warp Spiders", "3x Shining Spears", "Wave Serpent",
  ],
  "Necrons|Awakened Dynasty": [
    "Overlord", "Technomancer", "Orikan the Diviner", "20x Warriors", "10x Warriors",
    "5x Lokhust Heavy Destroyers", "3x Canoptek Doomstalkers", "6x Canoptek Wraiths",
  ],
  "Necrons|Hypercrypt Legion": [
    "Imotekh the Stormlord", "Technomancer", "10x Immortals", "10x Immortals",
    "20x Warriors", "Monolith", "3x Canoptek Doomstalkers", "6x Canoptek Scarab Swarms",
  ],
  "Space Marines|Gladius Task Force": [
    "Captain in Terminator Armour", "Lieutenant with Combi-weapon", "Apothecary Biologis",
    "5x Terminators", "10x Intercessors", "5x Infernus Squad", "2x Ballistus Dreadnought",
    "3x Eradicators", "Repulsor",
  ],
  "Space Marines|Ironstorm Spearhead": [
    "Captain on Bike", "Techmarine", "2x Ballistus Dreadnought", "2x Gladiator Lancer",
    "Repulsor Executioner", "5x Scouts", "10x Infernus Squad", "Land Raider",
  ],
  "Adeptus Custodes|Shield Host": [
    "Trajann Valoris", "Blade Champion", "Shield-Captain", "5x Custodian Guard",
    "5x Custodian Guard", "6x Prosecutors", "3x Allarus Custodians", "Caladius Grav-tank",
  ],
  "T'au Empire|Kauyon": [
    "Commander Farsight", "Commander in Enforcer Battlesuit", "3x Crisis Fireknife Battlesuits",
    "3x Crisis Fireknife Battlesuits", "10x Fire Warriors", "Riptide Battlesuit",
    "2x Broadside Battlesuits", "10x Kroot Carnivores",
  ],
  "T'au Empire|Mont'ka": [
    "Commander in Coldstar Battlesuit", "Darkstrider", "3x Crisis Sunforge Battlesuits",
    "3x Crisis Sunforge Battlesuits", "10x Fire Warriors", "2x Hammerhead Gunship", "Riptide Battlesuit",
  ],
  "Death Guard|Virulent Vectorium": [
    "Mortarion", "Lord of Virulence", "Biologus Putrifier", "10x Plague Marines",
    "10x Plague Marines", "3x Deathshroud Terminators", "5x Blightlord Terminators", "Plagueburst Crawler",
  ],
  "Tyranids|Invasion Fleet": [
    "Hive Tyrant", "Neurotyrant", "Winged Tyranid Prime", "20x Termagants",
    "20x Gargoyles", "3x Von Ryan's Leapers", "Norn Emissary", "6x Tyranid Warriors",
  ],
  "Chaos Space Marines|Pactbound Zealots": [
    "Chaos Lord", "Master of Possession", "10x Legionaries", "10x Cultists",
    "10x Cultists", "Forgefiend", "2x Vindicator", "5x Chosen", "Chaos Land Raider",
  ],
  "Grey Knights|Warpbane Task Force": [
    "Grand Master Voldus", "Brotherhood Chaplain", "10x Strike Squad", "5x Terminators",
    "5x Paladins", "3x Nemesis Dreadknight", "5x Purgation Squad",
  ],
  "Adepta Sororitas|Hallowed Martyrs": [
    "Morvenn Vahl", "Canoness", "Palatine", "10x Battle Sisters", "10x Battle Sisters",
    "5x Zephyrim", "2x Castigator", "5x Paragon Warsuits",
  ],
  "Drukhari|Skysplinter Assault": [
    "Archon", "Haemonculus", "10x Kabalite Warriors", "10x Kabalite Warriors",
    "2x Raider", "3x Ravager", "5x Incubi", "10x Wracks",
  ],
  "Thousand Sons|Hexwarp Thrallband": [
    "Magnus the Red", "Infernal Master", "10x Rubric Marines", "10x Rubric Marines",
    "10x Tzaangors", "Mutalith Vortex Beast", "5x Scarab Occult Terminators",
  ],
  "Chaos Daemons|Blood Legion": [
    "Bloodthirster", "Skulltaker", "Karanak", "10x Bloodletters", "10x Bloodletters",
    "10x Flesh Hounds", "3x Bloodcrushers", "Skull Cannon",
  ],
  "Genestealer Cults|Outlander Claw": [
    "Patriarch", "Primus", "Kelermorph", "10x Acolyte Hybrids", "10x Neophyte Hybrids",
    "5x Aberrants", "3x Atalan Jackals", "2x Achilles Ridgerunner",
  ],
  "Leagues of Votann|Hearthband": [
    "Kahl", "Einhyr Champion", "Grimnyr", "20x Hearthkyn Warriors", "10x Hearthkyn Warriors",
    "5x Einhyr Hearthguard", "3x Hernkyn Pioneers", "Sagitaur",
  ],
  "Imperial Knights|Freeblade Company": [
    "Knight Preceptor", "Knight Paladin", "Knight Errant", "3x Armiger Warglaives", "2x Armiger Helverins",
  ],
  "Chaos Knights|Traitoris Lance": [
    "Knight Desecrator", "Knight Rampager", "War Dog Karnivore", "War Dog Karnivore",
    "3x War Dog Stalkers", "2x War Dog Executioners",
  ],
  "Adeptus Custodes|Auric Champions": [
    "Valerian", "Aleya", "5x Custodian Wardens", "4x Custodian Guard",
    "5x Prosecutors", "2x Venerable Land Raider",
  ],
  "Dark Angels|Inner Circle Task Force": [
    "Azrael", "Lieutenant with Combi-weapon", "5x Deathwing Knights", "5x Deathwing Knights",
    "10x Intercessors", "3x Eradicators", "Land Raider", "5x Infernus Squad",
  ],
  "Aeldari|Armoured Warhost": [
    "Farseer Skyrunner", "Autarch", "10x Guardian Defenders", "3x Fire Prisms",
    "3x Vypers", "5x Rangers", "Wave Serpent", "Falcon",
  ],
};

interface MetaEntry {
  faction: string;
  det: string;
  disposition: Disposition;
  units?: string[];
}

const META_POOL: MetaEntry[] = META_POOL_RAW.flatMap(({ faction, det }) => {
  const found = FACTIONS[faction]?.find((d) => d.n === det);
  if (!found) return [];
  const units = META_UNITS[`${faction}|${det}`];
  return [{ faction, det, disposition: found.d, ...(units ? { units } : {}) }];
});

const ALL_DISPOSITIONS: Disposition[] = [
  "Take and Hold",
  "Purge the Foe",
  "Priority Assets",
  "Reconnaissance",
  "Disruption",
];

// Deterministic PRNG seeded by country name — re-running test data yields
// the same compositions.
function hashString(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Legal WTC composition: 8 lists, unique factions, one of each of the five
// dispositions plus three repeats, never more than two of the same.
export function generateComposition(country: string): OpponentList[] {
  const rand = mulberry32(hashString(country));
  const pool = [...META_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const armies: OpponentList[] = [];
  const usedFactions = new Set<string>();
  const dispCount = new Map<Disposition, number>();

  const take = (entry: MetaEntry) => {
    armies.push({
      faction: entry.faction,
      detachments: [entry.det],
      disposition: entry.disposition,
      ...(entry.units ? { units: entry.units } : {}),
    });
    usedFactions.add(entry.faction);
    dispCount.set(entry.disposition, (dispCount.get(entry.disposition) || 0) + 1);
  };

  for (const d of ALL_DISPOSITIONS) {
    const pick = pool.find((e) => e.disposition === d && !usedFactions.has(e.faction));
    if (pick) take(pick);
  }
  for (const entry of pool) {
    if (armies.length >= 8) break;
    if (usedFactions.has(entry.faction)) continue;
    if ((dispCount.get(entry.disposition) || 0) >= 2) continue;
    take(entry);
  }
  return armies;
}
