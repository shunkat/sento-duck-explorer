// Gameplay tuning (meters, seconds). Provisional values for the prototype.

export const DT = 1 / 60;

export const WALK_SPEED = { duck: 1.5, child: 2.5, adult: 2.5 } as const;
export const RUN_SPEED = 4.5; // humans only; Duck cannot run

/** Interaction distances. */
export const REACH = {
  /** E drinks a milk bottle within this distance (clear straight line). */
  milk: 0.6,
  /** Talk to the adult, including across the kids gate when they are beside it. */
  guardian: 1.35,
  /** E opens a high-handle door within this distance of its handle (Adult only). */
  handle: 1.0,
  locker: 1.0,
  /** E dries a wet human on the bath side within this distance of the changing-room or sauna door. */
  dryAtExit: 2.0,
  /** F7: push counts only with an NPC body this close. */
  push: 0.8,
} as const;

/** The guardian walks at the Adult's walking speed. */
export const GUARDIAN_SPEED = WALK_SPEED.adult;
