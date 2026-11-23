import { MILK_IDS, type CoreState, type GameState, type Stage } from "./types";

const ORDER: readonly Stage[] = ["duck", "child", "adult"];

/** Returns the list of violated invariants (empty when consistent). */
export function checkInvariants(s: GameState | CoreState): string[] {
  const out: string[] = [];
  const p = s.player;
  const collected = MILK_IDS.filter((m) => s.milk[m] === "collected").length;
  if (ORDER.indexOf(p.stage) !== Math.floor(collected / 2)) out.push(`stage ${p.stage} with ${collected} bottle(s)`);
  if ((s.milk.milk3 === "collected" || s.milk.milk4 === "collected")
    && (s.milk.milk1 !== "collected" || s.milk.milk2 !== "collected")) out.push("child milk before both duck bottles");
  if (p.stage === "duck") {
    if (p.towel !== "none") out.push("duck: has a towel");
    if (p.clothing !== "unclothed") out.push("duck: clothed");
    if (p.wet !== "wet") out.push("duck: dry");
  } else if (p.towel === "none") out.push(`${p.stage}: no towel`);
  if (s.doors.frontExit === "open" && p.stage !== "adult") out.push("frontExit open before Adult");
  if (s.doors.kidsGate === "open" && p.stage !== "adult" && !s.guardian.escortRequested) out.push("kidsGate open without adult assistance");
  if (s.guardian.escortRequested && p.stage === "duck") out.push("Duck requested an escort");
  if (s.outcome.kind === "cleared" && (p.stage !== "adult" || p.zone !== "street")) out.push("cleared outside the street or not Adult");
  return out;
}
