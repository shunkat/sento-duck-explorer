// Pair doors (provisional): Adult and Child cross these zone boundaries together,
// so Child is never left alone in the bath (Req 4.9–4.12).
import { CHARACTER_RADIUS, type Door, type Level } from "../level/layout";
import { resolveCircle } from "../sim/collision";
import { distance } from "../sim/geometry";
import { type AreaId, areaOf, zoneAtOr } from "../sim/zones";
import type { Ctx } from "./actions";
import { entryViolation } from "./rules";
import { MSG } from "./text";
import { COMPANION_OFFSET, JOIN_RADIUS } from "./tuning";
import type { HumanId, Vec2 } from "./types";
import { wallsFor } from "../sim/movement";

export function findPairDoor(level: Level, from: AreaId, to: AreaId): Door | null {
  return (
    level.doors.find((d) => d.pair && ((d.a === from && d.b === to) || (d.a === to && d.b === from))) ?? null
  );
}

/** A point just past the door center, on the side of `towards`. */
function pastDoor(door: Door, towards: Vec2): Vec2 {
  const c = { x: (door.box.minX + door.box.maxX) / 2, z: (door.box.minZ + door.box.maxZ) / 2 };
  const thinX = door.box.maxX - door.box.minX < door.box.maxZ - door.box.minZ;
  if (thinX) return { x: c.x + Math.sign(towards.x - c.x) * COMPANION_OFFSET, z: c.z };
  return { x: c.x, z: c.z + Math.sign(towards.z - c.z) * COMPANION_OFFSET };
}

const other = (id: HumanId): HumanId => (id === "adult" ? "child" : "adult");

/**
 * Apply a proposed move of the active human. Handles pair doors and the
 * active human's entry rules. Returns without moving when the crossing is blocked.
 */
export function applyHumanMove(c: Ctx, id: HumanId, next: Vec2): void {
  const { s, level } = c;
  const h = s[id];
  const fromArea = areaOf(h.zone);
  const nextZone = zoneAtOr(level, next, h.zone);
  const toArea = areaOf(nextZone);

  const door = fromArea !== toArea ? findPairDoor(level, fromArea, toArea) : null;
  if (door) {
    const compId = other(id);
    const comp = s[compId];
    if (areaOf(comp.zone) !== fromArea || distance(comp.pos, h.pos) > JOIN_RADIUS) {
      c.events.push({ kind: "prompt", text: MSG.moveTogether(compId) });
      return;
    }
    // The player chose this move: the active human's own violation ends the game.
    const own = entryViolation(h, fromArea, toArea);
    if (own) {
      c.pending.push(own);
    } else {
      // A companion that would break a rule waits instead (no game over).
      const compV = entryViolation(comp, fromArea, toArea);
      if (compV === "F2" || compV === "F5") {
        c.events.push({ kind: "prompt", text: MSG.companionDry(compId) });
        return;
      }
      if (compV === "F4") {
        c.events.push({ kind: "prompt", text: MSG.companionDress(compId) });
        return;
      }
    }
    const walls = wallsFor(level, s.saunaDoor);
    comp.pos = resolveCircle(pastDoor(door, next), CHARACTER_RADIUS[compId], walls);
    comp.zone = zoneAtOr(level, comp.pos, nextZone);
    afterAreaChange(c, compId, fromArea);
  } else {
    const own = entryViolation(h, fromArea, toArea);
    if (own) c.pending.push(own);
  }

  h.pos = next;
  h.zone = nextZone;
  if (fromArea !== toArea) afterAreaChange(c, id, fromArea);
}

/** Leaving the sauna makes a human sweaty (wet) (Req 6.3, provisional). */
function afterAreaChange(c: Ctx, id: HumanId, fromArea: AreaId): void {
  const h = c.s[id];
  const toArea = areaOf(h.zone);
  if ((fromArea === "sauna_entry" || fromArea === "sauna_crowd") && toArea !== "sauna_entry" && toArea !== "sauna_crowd") {
    h.wet = "wet";
  }
}
