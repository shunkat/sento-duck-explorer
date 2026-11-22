// Controls available at the current player position. Facility manners are
// communicated by physical signs in the scene, not by a permanent HUD guide.
import type { Level } from "../level/layout";
import { inBathWater, isSauna } from "../sim/zones";
import { interactHint } from "./actions";
import { npcWithinPushReach } from "./rules";
import type { GameState } from "./types";

/** Keep key hints aligned with the actions accepted by core/tick.ts. */
export function nearbyHints(s: GameState, level: Level): string[] {
  if (s.outcome.kind !== "playing") return [];
  const out: string[] = [];
  const e = interactHint(s, level);
  if (e) out.push(`E: ${e}`);
  const p = s.player;
  if (p.stage === "duck") return out;
  if (p.towel === "held" && inBathWater(level, p.pos)) out.push("Q: タオルを湯につける");
  if (isSauna(p.zone)) out.push("V: 大声を出す");
  if (npcWithinPushReach(level, p.stage, p.pos, p.zone)) out.push("F: 押す");
  return out;
}
