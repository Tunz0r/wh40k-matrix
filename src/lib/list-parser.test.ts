import { describe, it, expect } from "vitest";
import { parseArmyList, parseTeamLists, parseEventLists } from "./list-parser";

// These cover the real bugs we've hit (see docs/ROADMAP.md P0#2) — a parser
// regression is silent (bad data flows to pairing), so pin the behaviour down.

describe("parseArmyList — unit extraction", () => {
  const list = `Nids i Århus (1995 points)
Tyranids
Subterranean Assault (3 Detachment Points)
Disruption
Strike Force (2000 points)

CHARACTERS

Neurotyrant (140 points)
• Warlord
• 1x Neurotyrant claws and lashes

Gargoyles (75 points)
• 10x Gargoyle

Haruspex (125 points)
10x Jakhals (95 pts)
Cybernetica Datasmith [45 pts]`;
  const units = parseArmyList(list);

  it("keeps unit names and model counts", () => {
    expect(units).toContain("Neurotyrant");
    expect(units).toContain("Gargoyles");
    expect(units).toContain("Haruspex");
    expect(units).toContain("10x Jakhals"); // model count preserved
  });

  it("accepts both (paren) and [bracket] point costs", () => {
    expect(units).toContain("Cybernetica Datasmith"); // [45 pts]
  });

  it("drops army totals, detachment/faction lines, bullets and section headers", () => {
    expect(units).not.toContain("Strike Force");
    expect(units.some((u) => /Nids i Århus/.test(u))).toBe(false); // army name/total >= 700
    expect(units.some((u) => /Subterranean Assault/.test(u))).toBe(false);
    expect(units.some((u) => /Warlord|claws/.test(u))).toBe(false); // bullets
    expect(units).not.toContain("CHARACTERS");
    expect(units).not.toContain("Tyranids");
  });

  it("tolerates EU thousands separators in the army total", () => {
    const u = parseArmyList(`Mega Army (1.985 Points)\nAngron (275 points)`);
    expect(u).toContain("Angron");
    expect(u.some((x) => /Mega Army/.test(x))).toBe(false); // 1985 >= 700
  });
});

describe("parseTeamLists — splitting formats", () => {
  it("splits on the injected + PLAYER headers (event-import format)", () => {
    const team = `+ PLAYER: Anders Henze
+ FACTION KEYWORD: Tyranids
+ FORCE DISPOSITION: Disruption
Nids i Århus 1995 points
Tyranids
Disruption
Strike Force 2000 points
Neurotyrant (140 points)
Gargoyles (75 points)
Haruspex (125 points)
+ PLAYER: Christian Jensen
+ FACTION KEYWORD: Orks
+ FORCE DISPOSITION: Purge the Foe
Orks
Purge the Foe
Beastboss (110 points)
Flash Gitz (220 points)
Meganobz (265 points)`;
    const lists = parseTeamLists(team);
    expect(lists).toHaveLength(2);
    expect(lists[0].faction).toBe("Tyranids");
    expect(lists[0].disposition).toBe("Disruption");
    expect(lists[0].units.length).toBeGreaterThanOrEqual(3);
    expect(lists[1].faction).toBe("Orks");
    expect(lists[1].disposition).toBe("Purge the Foe");
  });

  it("splits a GW-app doc on bracketed army totals", () => {
    const doc = `Army One (1995 points)
Tyranids
Disruption
Strike Force (2000 points)
Neurotyrant (140 points)
Gargoyles (75 points)
Haruspex (125 points)
Army Two (2000 points)
Orks
Purge the Foe
Beastboss (110 points)
Flash Gitz (220 points)
Meganobz (265 points)`;
    expect(parseTeamLists(doc)).toHaveLength(2);
  });

  it("reads faction + disposition from a WTC-style paste (no + FACTION KEYWORD)", () => {
    const doc = `+ PLAYER: Christian Jensen
Christian Jensen
+++++++++++++++++++++++
List Name: gider ikke male
Factions Used: Orks
Army Points: 2000
Disposition: Purge the Foe
Detachment(s): Bully Boyz
+++++++++++++++++++++++
ATTACHED UNITS:
Beastboss (110 pts)
Flash Gitz (220 pts)
Meganobz (265 pts)`;
    const lists = parseTeamLists(doc);
    expect(lists).toHaveLength(1);
    expect(lists[0].faction).toBe("Orks");
    expect(lists[0].disposition).toBe("Purge the Foe");
    expect(lists[0].units.length).toBeGreaterThanOrEqual(3);
  });

  it("natively splits a list that contains two full armies (why the importer neutralises totals)", () => {
    const doc = `+ PLAYER: Andreas
Tyranids
Neurotyrant (140 points)
Gargoyles (75 points)
Second Army (2000 points)
Orks
Beastboss (110 points)`;
    // + PLAYER opens list 0; after the first units, "Second Army (2000 points)"
    // (>= 1500) opens a 2nd list. The event importer strips those parens so one
    // player stays one list.
    expect(parseTeamLists(doc)).toHaveLength(2);
  });
});

describe("parseEventLists — team splitting", () => {
  it("splits teams on a separator line; first line is the team name", () => {
    const doc = `#Keyword
+ PLAYER: A
+ FACTION KEYWORD: Tyranids
+ FORCE DISPOSITION: Disruption
Tyranids
Disruption
Neurotyrant (140 points)
Gargoyles (75 points)
Haruspex (125 points)
${"=".repeat(60)}
2nd tankshock
+ PLAYER: B
+ FACTION KEYWORD: Orks
+ FORCE DISPOSITION: Purge the Foe
Orks
Purge the Foe
Beastboss (110 points)
Flash Gitz (220 points)
Meganobz (265 points)`;
    const teams = parseEventLists(doc);
    expect(teams).toHaveLength(2);
    expect(teams[0].name).toBe("#Keyword");
    expect(teams[0].lists).toHaveLength(1);
    expect(teams[1].name).toBe("2nd tankshock");
    expect(teams[1].lists[0].faction).toBe("Orks");
  });

  it("drops blocks with no name or no parseable lists", () => {
    const doc = `${"=".repeat(60)}
Empty Team
just some prose, no units here
${"=".repeat(60)}
Real Team
+ PLAYER: A
Orks
Purge the Foe
Beastboss (110 points)
Flash Gitz (220 points)
Meganobz (265 points)`;
    const teams = parseEventLists(doc);
    expect(teams.map((t) => t.name)).toEqual(["Real Team"]);
  });
});
