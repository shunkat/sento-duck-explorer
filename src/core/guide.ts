// Pure guidance for the HUD: the current objective and the keys that do
// something right now. Derived from state only; no side effects.
import type { Level } from "../level/layout";
import { inBathWater, isSauna } from "../sim/zones";
import { atDryingSpot, interactHint } from "./actions";
import type { GameState } from "./types";

/** One-line objective for the current progress. */
export function objective(s: GameState): string {
  const p = s.player;
  if (s.outcome.kind === "cleared") return "クリア！大人に育って、銭湯の玄関から外へ出ました";
  if (p.stage === "duck") {
    return "湯船の奥（左の壁ぞい）の細い水路を泳いで浅い湯だまりへ。牛乳びんの近くでEを押して飲もう（子どもに育つ）。アヒルは水の上だけ泳げます";
  }
  if (p.stage === "child") {
    return "湯だまりの横の、子どもだけが通れるせまい通り道を通って広い休憩所へ。牛乳びんをEで飲もう（大人に育つ）";
  }
  if (s.doors.kidsGate === "closed" && (p.zone === "kids_room" || p.zone === "kids_passage" || p.zone === "kids_pool")) {
    return "休憩所の戸の高い掛け金をEで外して、浴室へ出よう";
  }
  if (p.clothing === "unclothed") {
    if (p.zone === "changing") return "更衣室の左の壁のロッカー（オレンジの棚）の前でEを押して服を着よう";
    if (p.wet === "wet") return "浴室の出口（更衣室の扉）の前のマットでEを押して体を拭こう";
    return "体を拭いたら、浴室の左上の扉から更衣室へ入ろう";
  }
  if (s.doors.frontExit === "closed") return "ついたての奥の扉から受付を通って玄関（下足箱）へ。外へ出る戸の高い取っ手をEで開けよう";
  return "開いた玄関の戸を通って外へ出よう（クリア）";
}

/** Keys that currently do something for the player, e.g. "E: 牛乳びんを飲む". */
export function nearbyHints(s: GameState, level: Level): string[] {
  if (s.outcome.kind !== "playing") return [];
  const out: string[] = [];
  const e = interactHint(s, level);
  if (e) out.push(`E: ${e}`);
  const p = s.player;
  if (p.stage === "duck") {
    out.push("アヒルは水の上だけ泳げます");
    return out;
  }
  if (p.zone === "bath" && p.wet === "wet" && !atDryingSpot(s, level)) out.push("体が濡れています：浴室の出口かサウナの扉の前でE");
  if (inBathWater(level, p.pos) && p.towel === "head") out.push("タオルは頭の上（Qでは湯につきません）");
  if (isSauna(p.zone)) out.push("サウナでは大声(V)・押す(F)はマナー違反");
  return out;
}
