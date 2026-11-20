// Pure guidance for the HUD: the current objective and the keys that do
// something right now. Derived from state only; no side effects.
import type { Level } from "../level/layout";
import { areaOf, isSauna } from "../sim/zones";
import { atDryingSpot, holds, interactHint } from "./actions";
import { CHARACTER_NAME } from "./text";
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
      return "ロッカー（オレンジの棚）の前でEを押し、子どもも大人も服を着よう";
    }
    if (!both((h) => s[h].wet === "dry")) {
      const wet = (["child", "adult"] as const).filter((h) => s[h].wet === "wet").map(name).join("と");
      return `湯船から出て、浴室の出口（更衣室の扉）の前で${wet}がそれぞれEで体を拭こう（Tabで切り替え）`;
    }
    return "親子で更衣室へ（浴室の上の扉）。2人が3m以内にいれば一緒に移動できます";
  }

  if (holds(s, "key", "adult")) {
    if (areaOf(s.adult.zone) !== "bath" || areaOf(s.child.zone) !== "bath") {
      if (s.adult.clothing === "clothed" || s.child.clothing === "clothed") return "更衣室のロッカーの前でEを押して2人とも服を脱ごう";
      return "親子で浴室へ戻ろう（更衣室の下の扉）";
    }
    return `大人で子どもに鍵を渡そう：子どもの近くでE${switchTo(s, "adult")}`;
  }

  // Who still has to dry before the sauna (the door's bath side is a drying spot).
  const wetNames = (["child", "adult"] as const).filter((h) => s[h].wet === "wet").map(name).join("と");
  if (s.saunaDoor === "locked") {
    if (wetNames) return `サウナの扉（茶色）の前で${wetNames}がEを押して体を拭こう（Tabで切り替え）。そのあと子どもがEで扉を開けよう`;
    return "子どもで浴室の下側にあるサウナの扉（茶色）の前に行きEで開けよう。大人も近くへ";
  }

  if (hat.owner.kind === "node") {
    if (!isSauna(s.child.zone)) {
      if (wetNames) return `サウナの扉の前で${wetNames}がEを押して体を拭こう（Tabで切り替え）`;
      return "親子でサウナへ（扉の前で2人が3m以内）。子どもだけが人混みのすき間を通れます（押さず・静かに）";
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
    const other: HumanId = id === "child" ? "adult" : "child";
    // Both need drying: say who still has to come to the exit (Tab, then E there).
    if (h.zone === "bath" && h.wet === "wet" && !atDryingSpot(s, level, id)) {
      out.push("体が濡れています：浴室の出口かサウナの扉の前でE");
    }
    if (areaOf(h.zone) === "bath" && s[other].wet === "wet" && s[other].zone !== "bathwater") {
      out.push(`${name(other)}も濡れています（Tabで切り替えて出口の前でE）`);
    }
    if (h.zone === "bathwater" && h.towel === "head") out.push("タオルは頭の上（Qでは湯船につきません）");
    if (isSauna(h.zone)) out.push("サウナでは大声(V)・押す(F)はマナー違反");
  }
  return out;
}
