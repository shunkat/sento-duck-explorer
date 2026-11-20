import type { Vec2, ZoneId } from "../core/types";
import type { Level } from "../level/layout";
import { containsPoint } from "./geometry";

/** Most specific zone containing `p`, or null when outside every zone. */
export function zoneAt(level: Level, p: Vec2): ZoneId | null {
  for (const z of level.zones) {
    if (containsPoint(z.box, p)) return z.id;
  }
  return null;
}

/** Zone lookup that keeps the previous zone when `p` lies outside all zones. */
export function zoneAtOr(level: Level, p: Vec2, previous: ZoneId): ZoneId {
  return zoneAt(level, p) ?? previous;
}

const SAUNA: ReadonlySet<ZoneId> = new Set(["sauna_entry", "sauna_crowd"]);
const WET_SOURCES: ReadonlySet<ZoneId> = new Set(["bathwater", "splash", "pond", "pond_goal"]);

/**
 * The room a zone belongs to. Sub-zones inside the bath (bathwater, splash,
 * narrow hole) count as the bath; the goal counts as the pond. Pair doors and
 * entry rules compare areas, not raw zones.
 */
export type AreaId =
  | "bath" | "changing" | "reception" | "common" | "exterior"
  | "sauna_entry" | "sauna_crowd" | "open_air" | "pond_entrance" | "pond";

export function areaOf(z: ZoneId): AreaId {
  switch (z) {
    case "bathwater":
    case "splash":
    case "narrow_hole":
      return "bath";
    case "pond_goal":
      return "pond";
    default:
      return z;
  }
}

export const isSauna = (z: ZoneId): boolean => SAUNA.has(z);

/** On the bath water (tub, channel or hole: `LEVEL.duckWater`). Wets anyone; a held towel dipped here is F1. */
export const inBathWater = (level: Level, p: Vec2): boolean => level.duckWater.some((w) => containsPoint(w, p));
export const isWetSource = (z: ZoneId): boolean => WET_SOURCES.has(z);
