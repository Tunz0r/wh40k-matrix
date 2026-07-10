// Parses a raw army list export (GW app, WTC submission format, NewRecruit,
// BattleScribe) into a compact unit summary: one entry per unit, model count
// kept ("10x Jakhals"), everything else (player names, wargear, points,
// enhancements) stripped.

// Unit lines carry a points cost: "(415 points)", "(70 pts)" or "[70 pts]"
const POINTS_RE = /[([]\s*(\d+)\s*(?:points|pts?)\s*[)\]]/i;

// Lines that carry a cost but aren't units
const NON_UNIT_RE =
  /^(strike force|incursion|onslaught|combat patrol|boarding patrol|army roster|total|enhancement)/i;

// Nothing WTC-legal costs this much — lines at or above are army names/totals
const ARMY_TOTAL_THRESHOLD = 700;

export function parseArmyList(text: string): string[] {
  const units: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // Bullets/indented detail lines are wargear or model breakdowns; "+"-lines
    // are WTC metadata (player name, faction, ...)
    if (/^[•◦▪‣*+·-]/.test(line) || /^\s{2,}/.test(raw)) continue;
    const match = line.match(POINTS_RE);
    if (!match || match.index === undefined) continue;
    if (Number(match[1]) >= ARMY_TOTAL_THRESHOLD) continue;

    // Keep only the text BEFORE the cost — anything after is wargear
    let name = line.slice(0, match.index).trim();
    // Strip slot labels: "Char1:", "HQ2:", "Troop 3:", leading numbering
    name = name.replace(/^(char\w*|hq\w*|troops?\w*|elites?\w*|fast attack\w*|heavy support\w*|dt\w*|lo[wc]\w*|\d+)\s*[:.\-]\s*/i, "");
    // Trailing separators
    name = name.replace(/\s*[:\-–,]\s*$/, "").trim();
    if (!name || NON_UNIT_RE.test(name)) continue;
    if (/enhancement/i.test(name)) continue;
    // Normalise "1x Name" → "Name", keep bigger model counts
    name = name.replace(/^1\s*x\s+/i, "");
    units.push(name);
  }
  return units;
}

// Aggregate duplicate units for display: ["10x Jakhals","10x Jakhals","Angron"]
// → "10x Jakhals (x2) · Angron"
export function formatUnits(units: string[]): string {
  const counts = new Map<string, number>();
  for (const u of units) counts.set(u, (counts.get(u) || 0) + 1);
  return [...counts.entries()]
    .map(([u, n]) => (n > 1 ? `${u} (x${n})` : u))
    .join(" · ");
}
