// Gameplay tuning (meters, seconds). Provisional values for the prototype.

export const DT = 1 / 60;

export const WALK_SPEED = { duck: 1.5, child: 2.5, adult: 2.5 } as const;
export const RUN_SPEED = 4.5; // humans only; Duck cannot run

/** Interaction distances. */
export const REACH = {
  coin: 0.5,
  give: 1.0,
  desk: 1.0,
  saunaDoor: 1.0,
  hat: 0.6,
  equip: 1.0,
  pickUpDuck: 1.0,
  dryDuck: 1.0,
  locker: 1.0,
  /** E dries a wet human on the bath side within this distance of the changing-room or sauna door. */
  dryAtExit: 2.0,
  /** F7: push counts only with an NPC body this close. */
  push: 0.8,
} as const;

/** Pair doors: the companion must be within this distance of the active human. */
export const JOIN_RADIUS = 3.0;
/** Companion is placed this far past the door center, into the new area. */
export const COMPANION_OFFSET = 0.9;
/** Where Adult puts Duck down, relative to Adult. */
export const DROP_OFFSET = { x: 0.5, z: 0 } as const;

/** Pond: current pushes toward the goal (+x); input steers. */
export const POND = {
  current: { x: 1.2, z: 0 },
  inputAccel: 3.0,
  damping: 0.97, // per tick
  maxSpeed: 2.5,
} as const;
