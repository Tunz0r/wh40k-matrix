import { FACTIONS, type Disposition } from "./data";
import type { RosterArmy } from "./roster";
import type { SeedingTier } from "./tournament-db";

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

interface MetaEntry {
  faction: string;
  det: string;
  disposition: Disposition;
}

const META_POOL: MetaEntry[] = META_POOL_RAW.flatMap(({ faction, det }) => {
  const found = FACTIONS[faction]?.find((d) => d.n === det);
  return found ? [{ faction, det, disposition: found.d }] : [];
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
export function generateComposition(country: string): RosterArmy[] {
  const rand = mulberry32(hashString(country));
  const pool = [...META_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const armies: RosterArmy[] = [];
  const usedFactions = new Set<string>();
  const dispCount = new Map<Disposition, number>();

  const take = (entry: MetaEntry) => {
    armies.push({
      faction: entry.faction,
      detachments: [entry.det],
      disposition: entry.disposition,
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
