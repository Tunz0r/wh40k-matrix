import { type Disposition, type Detachment, FACTIONS, DISPOSITIONS } from "./data";

export interface RosterArmy {
  faction: string;
  detachments: string[];
  disposition: Disposition | null;
}

export interface RosterExport {
  v: 1;
  name: string;
  armies: RosterArmy[];
}

export function serializeRoster(
  name: string,
  armies: { detachments: { detachment: Detachment; faction: string }[]; chosenDisposition: Disposition | null }[]
): string {
  const data: RosterExport = {
    v: 1,
    name,
    armies: armies
      .filter((a) => a.detachments.length > 0)
      .map((a) => ({
        faction: a.detachments[0].faction,
        detachments: a.detachments.map((d) => d.detachment.n),
        disposition: a.chosenDisposition,
      })),
  };
  return btoa(encodeURIComponent(JSON.stringify(data)));
}

export function deserializeRoster(encoded: string): RosterExport | null {
  try {
    const json = decodeURIComponent(atob(encoded));
    const data = JSON.parse(json) as RosterExport;
    if (data.v !== 1 || !Array.isArray(data.armies)) return null;
    for (const army of data.armies) {
      if (!FACTIONS[army.faction]) return null;
      const factionDets = FACTIONS[army.faction];
      for (const detName of army.detachments) {
        if (!factionDets.find((d) => d.n === detName)) return null;
      }
      if (army.disposition && !DISPOSITIONS.includes(army.disposition)) return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function rosterToArmies(
  roster: RosterExport
): { detachments: { detachment: Detachment; faction: string }[]; chosenDisposition: Disposition | null }[] {
  const armies = Array.from({ length: 8 }, () => ({
    detachments: [] as { detachment: Detachment; faction: string }[],
    chosenDisposition: null as Disposition | null,
  }));

  roster.armies.forEach((ra, i) => {
    if (i >= 8) return;
    const factionDets = FACTIONS[ra.faction];
    armies[i] = {
      detachments: ra.detachments
        .map((name) => {
          const det = factionDets.find((d) => d.n === name);
          return det ? { detachment: det, faction: ra.faction } : null;
        })
        .filter((d): d is { detachment: Detachment; faction: string } => d !== null),
      chosenDisposition: ra.disposition,
    };
  });

  return armies;
}
