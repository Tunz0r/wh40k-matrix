import type { Disposition } from "./data";

export interface LayoutInfo {
  page: number;
  layout: "A" | "B" | "C";
  missionA: string;
  missionB: string;
}

function key(a: Disposition, b: Disposition): string {
  return `${a}|${b}`;
}

// Each matchup has 3 layouts (A, B, C) on consecutive pages
const LAYOUT_MAP: Record<string, LayoutInfo[]> = {
  [key("Take and Hold", "Take and Hold")]: [
    { page: 9, layout: "A", missionA: "Battlefield Dominance", missionB: "Battlefield Dominance" },
    { page: 10, layout: "B", missionA: "Battlefield Dominance", missionB: "Battlefield Dominance" },
    { page: 11, layout: "C", missionA: "Battlefield Dominance", missionB: "Battlefield Dominance" },
  ],
  [key("Take and Hold", "Purge the Foe")]: [
    { page: 12, layout: "A", missionA: "Immovable Object", missionB: "Unstoppable Force" },
    { page: 13, layout: "B", missionA: "Immovable Object", missionB: "Unstoppable Force" },
    { page: 14, layout: "C", missionA: "Immovable Object", missionB: "Unstoppable Force" },
  ],
  [key("Take and Hold", "Disruption")]: [
    { page: 15, layout: "A", missionA: "Determined Acquisition", missionB: "Death Trap" },
    { page: 16, layout: "B", missionA: "Determined Acquisition", missionB: "Death Trap" },
    { page: 17, layout: "C", missionA: "Determined Acquisition", missionB: "Death Trap" },
  ],
  [key("Take and Hold", "Reconnaissance")]: [
    { page: 18, layout: "A", missionA: "Purge and Secure", missionB: "Reconnaissance Sweep" },
    { page: 19, layout: "B", missionA: "Purge and Secure", missionB: "Reconnaissance Sweep" },
    { page: 20, layout: "C", missionA: "Purge and Secure", missionB: "Reconnaissance Sweep" },
  ],
  [key("Take and Hold", "Priority Assets")]: [
    { page: 21, layout: "A", missionA: "Inescapable Dominion", missionB: "Secure Asset" },
    { page: 22, layout: "B", missionA: "Inescapable Dominion", missionB: "Secure Asset" },
    { page: 23, layout: "C", missionA: "Inescapable Dominion", missionB: "Secure Asset" },
  ],
  [key("Purge the Foe", "Purge the Foe")]: [
    { page: 24, layout: "A", missionA: "Meatgrinder", missionB: "Meatgrinder" },
    { page: 25, layout: "B", missionA: "Meatgrinder", missionB: "Meatgrinder" },
    { page: 26, layout: "C", missionA: "Meatgrinder", missionB: "Meatgrinder" },
  ],
  [key("Purge the Foe", "Disruption")]: [
    { page: 27, layout: "A", missionA: "Punishment", missionB: "Delaying Action" },
    { page: 28, layout: "B", missionA: "Punishment", missionB: "Delaying Action" },
    { page: 29, layout: "C", missionA: "Punishment", missionB: "Delaying Action" },
  ],
  [key("Purge the Foe", "Reconnaissance")]: [
    { page: 30, layout: "A", missionA: "Consecrate", missionB: "Triangulation" },
    { page: 31, layout: "B", missionA: "Consecrate", missionB: "Triangulation" },
    { page: 32, layout: "C", missionA: "Consecrate", missionB: "Triangulation" },
  ],
  [key("Purge the Foe", "Priority Assets")]: [
    { page: 33, layout: "A", missionA: "Destroyer's Wrath", missionB: "Vital Link" },
    { page: 34, layout: "B", missionA: "Destroyer's Wrath", missionB: "Vital Link" },
    { page: 35, layout: "C", missionA: "Destroyer's Wrath", missionB: "Vital Link" },
  ],
  [key("Disruption", "Disruption")]: [
    { page: 36, layout: "A", missionA: "Outmanoeuvre", missionB: "Outmanoeuvre" },
    { page: 37, layout: "B", missionA: "Outmanoeuvre", missionB: "Outmanoeuvre" },
    { page: 38, layout: "C", missionA: "Outmanoeuvre", missionB: "Outmanoeuvre" },
  ],
  [key("Disruption", "Reconnaissance")]: [
    { page: 39, layout: "A", missionA: "Smoke and Mirrors", missionB: "Surveil the Foe" },
    { page: 40, layout: "B", missionA: "Smoke and Mirrors", missionB: "Surveil the Foe" },
    { page: 41, layout: "C", missionA: "Smoke and Mirrors", missionB: "Surveil the Foe" },
  ],
  [key("Disruption", "Priority Assets")]: [
    { page: 42, layout: "A", missionA: "Locate and Deny", missionB: "Extract Relic" },
    { page: 43, layout: "B", missionA: "Locate and Deny", missionB: "Extract Relic" },
    { page: 44, layout: "C", missionA: "Locate and Deny", missionB: "Extract Relic" },
  ],
  [key("Reconnaissance", "Reconnaissance")]: [
    { page: 45, layout: "A", missionA: "Gather Intel", missionB: "Gather Intel" },
    { page: 46, layout: "B", missionA: "Gather Intel", missionB: "Gather Intel" },
    { page: 47, layout: "C", missionA: "Gather Intel", missionB: "Gather Intel" },
  ],
  [key("Reconnaissance", "Priority Assets")]: [
    { page: 48, layout: "A", missionA: "Search and Scour", missionB: "Vanguard Operation" },
    { page: 49, layout: "B", missionA: "Search and Scour", missionB: "Vanguard Operation" },
    { page: 50, layout: "C", missionA: "Search and Scour", missionB: "Vanguard Operation" },
  ],
  [key("Priority Assets", "Priority Assets")]: [
    { page: 51, layout: "A", missionA: "Sabotage", missionB: "Sabotage" },
    { page: 52, layout: "B", missionA: "Sabotage", missionB: "Sabotage" },
    { page: 53, layout: "C", missionA: "Sabotage", missionB: "Sabotage" },
  ],
};

export function getLayouts(dispA: Disposition, dispB: Disposition): LayoutInfo[] | null {
  return LAYOUT_MAP[key(dispA, dispB)] ?? LAYOUT_MAP[key(dispB, dispA)] ?? null;
}

export function getLayoutImage(page: number): string {
  return `/layouts/layout-p${page}.webp`;
}
