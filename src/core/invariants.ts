import type { CoreState, GameState, ItemId, Owner } from "./types";

const ALLOWED_OWNERS: Record<ItemId, readonly string[]> = {
  coin: ["node:narrow_hole_coin", "character:duck", "character:adult", "node:reception_register"],
  key: ["node:reception_desk", "character:adult", "character:child"],
  hat: ["node:sauna_hat_shelf", "character:child", "character:duck"],
};

const tag = (o: Owner) => `${o.kind}:${o.id}`;

/** Returns the list of violated invariants (empty when consistent). */
export function checkInvariants(s: GameState | CoreState): string[] {
  const out: string[] = [];
  const { coin, key, hat } = s.items;

  for (const id of ["coin", "key", "hat"] as const) {
    if (!ALLOWED_OWNERS[id].includes(tag(s.items[id].owner))) out.push(`${id}: unexpected owner ${tag(s.items[id].owner)}`);
  }
  const coinPaid = coin.status === "paid";
  if (coinPaid !== (tag(coin.owner) === "node:reception_register")) out.push("coin: paid ⇔ owner reception_register");
  if (coin.status === "equipped") out.push("coin: invalid status equipped");
  if (key.status !== "available") out.push("key: invalid status");
  if ((tag(key.owner) === "node:reception_desk") === coinPaid) out.push("key: at desk ⇔ coin not paid");
  if (s.saunaDoor === "unlocked" && !coinPaid) out.push("door unlocked ⇒ coin paid");
  if (hat.status === "paid") out.push("hat: invalid status paid");
  if ((hat.status === "equipped") !== (tag(hat.owner) === "character:duck")) out.push("hat: equipped ⇔ owner duck");

  if (s.duck.carriedBy !== null) {
    if (s.duck.carriedBy !== "adult") out.push("duck: carrier must be adult");
    if (s.duck.inPond) out.push("duck: carried while in pond");
    if (s.duck.pos.x !== s.adult.pos.x || s.duck.pos.z !== s.adult.pos.z) out.push("duck: not at carrier anchor");
  }
  if (s.dialog && !(["coin", "key"] as string[]).includes(s.dialog.item)) out.push("dialog: non-allowlisted item");

  if ("checkpoints" in s && s.lastCheckpoint === "duckInPond") {
    const snap = s.checkpoints.duckInPond;
    if (!snap || snap.adult.zone !== "pond_entrance" || snap.child.zone !== "pond_entrance" || !snap.duck.inPond) {
      out.push("duckInPond checkpoint without both humans on the shore");
    }
  }
  return out;
}
