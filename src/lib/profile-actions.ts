import { parseTeamLists } from "./list-parser";
import { FACTIONS } from "./data";
import {
  type OpponentMap,
  type OpponentList,
  type ListCluster,
  type ArchetypeDescriptor,
  clusterLists,
  listSimilarity,
  SIMILARITY_THRESHOLD,
  appendListToMetaTeam,
  switchSlotArchetype,
  archetypeId,
} from "./estimates-db";
import { savePlayerProfile, type PlayerProfile } from "./tournament-db";

const descOf = (p: {
  faction: string;
  detachments: string[];
  disposition: string | null;
}): ArchetypeDescriptor => ({
  faction: p.faction,
  detachments: p.detachments || [],
  disposition: p.disposition ?? null,
});

export interface UploadResult {
  status: "saved" | "cancelled" | "error";
  message?: string;
  profile?: PlayerProfile;
  matchedSize?: number; // number of field lists the matched archetype covers
  created?: boolean; // true when a new archetype was created from the list
  inherited?: number; // estimate cells inherited from the archetype bank
}

// Parse a pasted army list and set army `armyIdx`'s profile from it: match the
// list to a field archetype (≥ threshold) or CREATE the archetype when nothing
// matches, then run the same estimate attribution as /player's "Min arketype"
// (switchSlotArchetype parks the old row and inherits the new archetype's bank).
// This is the single source of truth for "my army → archetype + actual list",
// shared by /player and /tournament. `confirm` defaults to window.confirm.
export async function uploadActualList(opts: {
  opponents: OpponentMap;
  slug: string;
  armyIdx: number;
  pasteText: string;
  oldProfile: PlayerProfile | null;
  lockedSlugs: Set<string>;
  confirm?: (msg: string) => boolean;
}): Promise<UploadResult> {
  const confirm = opts.confirm ?? ((m: string) => window.confirm(m));
  const parsed = parseTeamLists(opts.pasteText.trim())[0];
  if (!parsed || !parsed.units.length) {
    return {
      status: "error",
      message:
        "Kunne ikke læse listen — indsæt et komplet liste-export (GW-app, WTC eller NewRecruit).",
    };
  }

  const asList: OpponentList = {
    faction: parsed.faction || "",
    detachments: parsed.detachments,
    disposition: parsed.disposition,
    units: parsed.units,
  };

  // Best field archetype ≥ threshold.
  let best: { c: ListCluster; sim: number } | null = null;
  for (const c of clusterLists(opts.opponents)) {
    const sim = listSimilarity(asList, c.rep.list);
    if (sim >= SIMILARITY_THRESHOLD && (!best || sim > best.sim)) best = { c, sim };
  }

  let profile: PlayerProfile;
  let matchedSize: number | undefined;
  let created = false;

  if (best) {
    const rep = best.c.rep.list;
    profile = {
      faction: rep.faction,
      detachments: rep.detachments || [],
      disposition: rep.disposition ?? null,
      units: parsed.units,
    };
    matchedSize = best.c.members.length;
  } else {
    if (!parsed.faction || !parsed.detachments.length) {
      return {
        status: "error",
        message:
          "Ingen arketype matcher listen, og faction/detachment kunne ikke læses fra den. Tjek at listen har faction- og detachment-linjer.",
      };
    }
    const disposition =
      parsed.disposition ??
      FACTIONS[parsed.faction]?.find((d) => d.n === parsed.detachments[0])?.d ??
      null;
    const label = `${parsed.faction} — ${parsed.detachments.join(", ")}`;
    if (
      !confirm(
        `Ingen arketype i feltet matcher listen (≥${SIMILARITY_THRESHOLD}% lighed).\n\nOpret "${label}" som ny arketype i biblioteket og tildel den?`
      )
    ) {
      return { status: "cancelled" };
    }
    try {
      await appendListToMetaTeam({
        faction: parsed.faction,
        detachments: parsed.detachments,
        disposition,
        units: parsed.units,
      });
    } catch {
      return { status: "error", message: "Kunne ikke oprette arketypen — tjek Firebase." };
    }
    profile = { faction: parsed.faction, detachments: parsed.detachments, disposition, units: parsed.units };
    created = true;
  }

  const oldDesc = opts.oldProfile ? descOf(opts.oldProfile) : null;
  const newDesc = descOf(profile);

  // Changing to a DIFFERENT archetype moves this army's estimates — confirm it.
  if (oldDesc && archetypeId(oldDesc) !== archetypeId(newDesc)) {
    const label = `${newDesc.faction} — ${newDesc.detachments.join(", ")}`;
    if (
      !confirm(
        `Listen matcher en anden arketype (${label}) end den nuværende.\n\nSkift? Dine estimater for denne hær gemmes på den gamle arketype og hentes frem igen hvis nogen vælger den.`
      )
    ) {
      return { status: "cancelled" };
    }
  }

  try {
    const res = await switchSlotArchetype(opts.opponents, opts.armyIdx, oldDesc, newDesc, opts.lockedSlugs, opts.slug);
    await savePlayerProfile(opts.slug, opts.armyIdx, profile);
    return { status: "saved", profile, matchedSize, created, inherited: res.inherited };
  } catch {
    return { status: "error", message: "Kunne ikke gemme — tjek Firebase." };
  }
}
