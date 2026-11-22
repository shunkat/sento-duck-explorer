import type { CoreState, GameState, Stage } from "./types";

const ORDER: readonly Stage[] = ["duck", "child", "adult"];

/** Returns the list of violated invariants (empty when consistent). */
export function checkInvariants(s: GameState | CoreState): string[] {
  const out: string[] = [];
  const p = s.player;
  const collected = (["milk1", "milk2"] as const).filter((m) => s.milk[m] === "collected").length;
  // Growth is one-way and follows the bottles: Duck 0, Child 1 (milk1), Adult 2.
  if (ORDER.indexOf(p.stage) !== collected) out.push(`stage ${p.stage} with ${collected} bottle(s)`);
  if (s.milk.milk2 === "collected" && s.milk.milk1 !== "collected") out.push("milk2 before milk1");
  if (p.stage === "duck") {
    if (p.towel !== "none") out.push("duck: has a towel");
    if (p.clothing !== "unclothed") out.push("duck: clothed");
    if (p.wet !== "wet") out.push("duck: dry");
  } else if (p.towel === "none") out.push(`${p.stage}: no towel`);
  for (const d of ["kidsGate", "frontExit"] as const) {
    if (s.doors[d] === "open" && p.stage !== "adult") out.push(`${d} open before Adult`);
  }
  if (s.outcome.kind === "cleared" && (p.stage !== "adult" || p.zone !== "street")) out.push("cleared outside the street or not Adult");
  return out;
}
