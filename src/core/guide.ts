// Pure guidance for the HUD: the current objective and the keys that do
// something right now. Derived from state only; no side effects.
import type { Level } from "../level/layout";
import { distance } from "../sim/geometry";
import { areaOf, isSauna } from "../sim/zones";
import { holds, interactHint } from "./actions";
import { CHARACTER_NAME } from "./text";
import { REACH } from "./tuning";
import type { CharacterId, GameState, HumanId } from "./types";

const name = (id: CharacterId) => CHARACTER_NAME[id];
const switchTo = (s: GameState, id: CharacterId) =>
  s.active === id ? "" : `（Tabで${name(id)}に切り替え）`;

/** One-line objective for the current progress. */
export function objective(s: GameState): string {
  const { coin, key, hat } = s.items;
  if (s.outcome.kind === "cleared") return "クリア！帽子を被ったアヒルが池の奥に着きました";

  if (coin.owner.kind === "node" && coin.owner.id === "narrow_hole_coin") {
    return `アヒルで浴室の左の壁にある小さな穴（紫の床）に入り、奥の500円玉を拾おう${switchTo(s, "duck")}`;
  }
  if (holds(s, "coin", "duck")) return `アヒルで大人に500円玉を渡そう：大人の近くでE${switchTo(s, "duck")}`;

  if (coin.status !== "paid") {
    const both = (f: (h: HumanId) => boolean) => f("child") && f("adult");
    const inArea = (a: string) => both((h) => areaOf(s[h].zone) === a);
    if (inArea("reception")) return `大人で受付台の前に立ち、Eでサウナ代を払おう${switchTo(s, "adult")}`;
    if (inArea("changing")) {
      if (both((h) => s[h].clothing === "clothed")) return "親子で受付へ行こう（更衣室の上の扉）";
      return "ロッカー（オレンジの棚）の前でGを押し、子どもも大人も服を着よう";
    }
    if (!both((h) => s[h].wet === "dry")) return "湯船から出て、子どもと大人それぞれTで体を拭こう（Tabで切り替え）";
    return "親子で更衣室へ（浴室の上の扉）。2人が3m以内にいれば一緒に移動できます";
  }

  if (holds(s, "key", "adult")) {
    if (areaOf(s.adult.zone) !== "bath" || areaOf(s.child.zone) !== "bath") {
      if (s.adult.clothing === "clothed" || s.child.clothing === "clothed") return "更衣室のロッカーでGを押して2人とも服を脱ごう";
      return "親子で浴室へ戻ろう（更衣室の下の扉）";
    }
    return `大人で子どもに鍵を渡そう：子どもの近くでE${switchTo(s, "adult")}`;
  }

  if (s.saunaDoor === "locked") {
    return "子どもで浴室の下側にあるサウナの扉（茶色）の前に行きEで開けよう。体を拭いた大人も近くへ";
  }

  if (hat.owner.kind === "node") {
    if (!isSauna(s.child.zone)) {
      return "体を拭いてから親子でサウナへ。子どもだけが人混みのすき間を通れます（押さず・静かに）";
    }
    return "子どもで人混みのすき間を縫って、奥の棚の帽子を取ろう（E）";
  }
  if (holds(s, "hat", "child")) return `子どもでサウナを出て、アヒルの近くでEを押して帽子を被せよう${switchTo(s, "child")}`;

  if (s.duck.inPond) return `流れに乗ってアヒルを池の奥の金色のゴールへ。WASDで向きを調整${switchTo(s, "duck")}`;
  if (s.duck.carriedBy === "adult") {
    return "子どもと一緒に右の露天風呂を通って池の入口へ。入口でEを押すとアヒルを池に置けます（2人は3m以内で）";
  }
  return `大人でアヒルの近くに行き、Eで抱えよう${switchTo(s, "adult")}`;
}

/** Keys that currently do something for the active character, e.g. "E: 500円玉を拾う". */
export function nearbyHints(s: GameState, level: Level): string[] {
  if (s.outcome.kind !== "playing") return [];
  if (s.dialog) return ["E / Enter: 渡す", "Esc: やめる"];
  const out: string[] = [];
  const e = interactHint(s, level);
  if (e) out.push(`E: ${e}`);
  const id = s.active;
  if (id !== "duck") {
    const h = s[id];
    const inWater = h.zone === "bathwater" || h.zone === "splash";
    if (h.wet === "wet" && !inWater) out.push("T: タオルで体を拭く");
    else if (
      h.wet === "dry" &&
      s.duck.wet === "wet" &&
      !s.duck.inPond &&
      s.duck.carriedBy === null &&
      distance(h.pos, s.duck.pos) <= REACH.dryDuck
    ) {
      out.push("T: アヒルを拭く");
    }
    if (h.zone === "changing" && distance(h.pos, level.locker) <= REACH.locker) {
      out.push(`G: ${h.clothing === "clothed" ? "服を脱ぐ" : "服を着る"}`);
    }
    if (isSauna(h.zone)) out.push("サウナでは大声(V)・押す(F)はマナー違反");
  }
  return out;
}
