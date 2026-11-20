// Pure state → view model. The renderer only applies this, so what is drawn
// (e.g. the hat on Duck) is testable without WebGL (Req 10.6).
import { CHARACTER_NAME, CHECKPOINT_NAME, ITEM_NAME, NODE_NAME, ZONE_NAME } from "../core/text";
import type { CharacterId, GameState, ItemId, Owner } from "../core/types";
import { CHARACTER_RADIUS, type Level } from "../level/layout";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CharacterView {
  id: CharacterId;
  /** Center of the mesh. */
  pos: Vec3;
  radius: number;
  height: number;
  active: boolean;
  carried: boolean;
  /** Humans only: picks the outfit variant of a human model. Duck is always "unclothed". */
  clothing: "clothed" | "unclothed";
  /** Humans only: where the towel is. Duck never has one. */
  towel?: "held" | "head";
  /** Standing in the bathwater or the splash (view: hold the towel up). */
  inWater: boolean;
}

export interface View {
  characters: Record<CharacterId, CharacterView>;
  items: Record<ItemId, { pos: Vec3; visible: boolean; owner: Owner }>;
  hatAttachedToDuck: boolean;
  saunaDoorLocked: boolean;
  active: CharacterId;
  /** Point the camera looks at. */
  focus: Vec3;
}

export const BODY_HEIGHT: Record<CharacterId, number> = { duck: 0.3, child: 1.2, adult: 1.7 };
const DESK_TOP = 0.9;

function characterView(s: GameState, id: CharacterId): CharacterView {
  const c = s[id];
  const r = CHARACTER_RADIUS[id];
  const h = BODY_HEIGHT[id];
  let y = h / 2;
  let carried = false;
  if (id === "duck") {
    if (s.duck.carriedBy === "adult") {
      carried = true;
      y = 1.05; // in Adult's arms
    } else if (s.duck.inPond) {
      y = 0.1; // floating
    } else {
      y = r;
    }
  }
  const clothing = id === "duck" ? "unclothed" : s[id].clothing;
  const towel = id === "duck" ? undefined : s[id].towel;
  return { id, pos: { x: c.pos.x, y, z: c.pos.z }, radius: r, height: h, active: s.active === id, carried, clothing, towel, inWater: c.zone === "bathwater" || c.zone === "splash" };
}

function topOf(v: CharacterView): number {
  return v.id === "duck" ? v.pos.y + v.radius : v.pos.y + v.height / 2;
}

function itemPos(level: Level, chars: Record<CharacterId, CharacterView>, item: ItemId, owner: Owner, equipped: boolean): Vec3 {
  if (owner.kind === "node") {
    const p = level.nodes[owner.id];
    const onDesk = owner.id === "reception_desk" || owner.id === "reception_register";
    return { x: p.x, y: onDesk ? DESK_TOP + 0.05 : 0.12, z: p.z };
  }
  const c = chars[owner.id];
  if (item === "hat" && equipped) return { x: c.pos.x, y: topOf(c) + 0.06, z: c.pos.z };
  return { x: c.pos.x + 0.15, y: topOf(c) + 0.15, z: c.pos.z };
}

export function deriveView(s: GameState, level: Level): View {
  const characters = {
    duck: characterView(s, "duck"),
    child: characterView(s, "child"),
    adult: characterView(s, "adult"),
  };
  const hat = s.items.hat;
  const hatAttachedToDuck = hat.owner.kind === "character" && hat.owner.id === "duck" && hat.status === "equipped";
  const items = {
    coin: { pos: itemPos(level, characters, "coin", s.items.coin.owner, false), visible: true, owner: s.items.coin.owner },
    key: { pos: itemPos(level, characters, "key", s.items.key.owner, false), visible: true, owner: s.items.key.owner },
    hat: { pos: itemPos(level, characters, "hat", hat.owner, hatAttachedToDuck), visible: true, owner: hat.owner },
  };
  const a = characters[s.active];
  return {
    characters,
    items,
    hatAttachedToDuck,
    saunaDoorLocked: s.saunaDoor === "locked",
    active: s.active,
    focus: { x: a.pos.x, y: a.pos.y, z: a.pos.z },
  };
}

const ownerText = (o: Owner) => (o.kind === "node" ? NODE_NAME[o.id] : `${CHARACTER_NAME[o.id]}が持っている`);

/** Always-visible state panel lines (Req 9.6). */
export function statusLines(s: GameState): string[] {
  const wet = (w: "wet" | "dry") => (w === "wet" ? "濡れ" : "乾き");
  const clothes = (c: "clothed" | "unclothed") => (c === "clothed" ? "服あり" : "入浴中");
  const hat = s.items.hat;
  return [
    `操作中：${CHARACTER_NAME[s.active]}（${ZONE_NAME[s[s.active].zone]}）`,
    `アヒル：${ZONE_NAME[s.duck.zone]}・${wet(s.duck.wet)}${s.duck.carriedBy ? "・大人が抱えている" : ""}${s.items.hat.status === "equipped" ? "・帽子あり" : ""}`,
    `子ども：${ZONE_NAME[s.child.zone]}・${wet(s.child.wet)}・${clothes(s.child.clothing)}`,
    `大人　：${ZONE_NAME[s.adult.zone]}・${wet(s.adult.wet)}・${clothes(s.adult.clothing)}`,
    `${ITEM_NAME.coin}：${s.items.coin.status === "paid" ? "支払い済み" : ownerText(s.items.coin.owner)}`,
    `${ITEM_NAME.key}：${ownerText(s.items.key.owner)}／扉${s.saunaDoor === "locked" ? "は施錠中" : "は開いている"}`,
    `${ITEM_NAME.hat}：${hat.status === "equipped" ? "アヒルが被っている" : ownerText(hat.owner)}`,
    `再開地点：${CHECKPOINT_NAME[s.lastCheckpoint]}`,
  ];
}
