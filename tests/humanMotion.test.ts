import { describe, expect, it } from "vitest";
import { Bone, Group, Object3D, Quaternion, Vector3 } from "three";
import { bindHumanMotion, HUMAN_WALK_BONES, HumanMotion } from "../src/view/humanMotion";

// Non-identity parent/rest rotations exercise the exported Blender bone axes.
function rig(tilted = false) {
  const root = new Group();
  const armature = new Group(); root.add(armature);
  if (tilted) armature.rotation.z = .31;
  const add = (name: string, parent: Object3D, x: number, y: number, z = 0) => {
    const bone = new Bone(); bone.name = name; bone.position.set(x, y, z); parent.add(bone); return bone;
  };
  const hips = add("hips", armature, 0, .8);
  const spine = add("spine", hips, 0, .2);
  add("head", spine, 0, .35);
  for (const [side, x] of [["r", -.12], ["l", .12]] as const) {
    const thigh = add(`thigh_${side}`, hips, x, -.05);
    const shin = add(`shin_${side}`, thigh, 0, -.38);
    add(`foot_${side}`, shin, 0, -.32);
    const arm = add(`upper_arm_${side}`, spine, x * 2, .1);
    if (tilted) arm.rotation.z = side === "r" ? -.2 : .2;
    const forearm = add(`forearm_${side}`, arm, 0, -.22);
    const hand = new Object3D(); hand.name = side === "r" ? "socket_hand_r" : "hand_l";
    hand.position.y = -.24; forearm.add(hand);
  }
  root.updateWorldMatrix(true, true);
  return { root, motion: bindHumanMotion(root, 1.7)! };
}
const at = (root: Object3D, name: string) => root.getObjectByName(name)!.getWorldPosition(new Vector3());
const local = (root: Object3D, name: string) => root.worldToLocal(at(root, name));
function walk(motion: HumanMotion, distance = 1.7 * .9 * 1.25, steps = 120) {
  motion.update({ position: { x: 0, z: 0 }, time: 0 });
  for (let i = 1; i <= steps; i++) motion.update({ position: { x: 0, z: distance * i / steps }, time: i / 60 });
}

describe("human gait from resolved movement", () => {
  it("moves opposing legs/arms and folds the trailing knee while the stance foot stays grounded", () => {
    const { root, motion } = rig();
    const head = local(root, "head");
    const feet = { r: at(root, "foot_r").y, l: at(root, "foot_l").y };
    walk(motion);
    expect(at(root, "foot_r").z).toBeGreaterThan(.1);
    expect(at(root, "foot_l").z).toBeLessThan(-.1);
    expect(at(root, "socket_hand_r").z).toBeLessThan(-.05);
    expect(at(root, "hand_l").z).toBeGreaterThan(.05);
    expect(root.getObjectByName("shin_l")!.rotation.x).toBeGreaterThan(.4);
    expect(local(root, "head").distanceTo(head)).toBeLessThan(1e-10);
    expect(Math.min(at(root, "foot_r").y - feet.r, at(root, "foot_l").y - feet.l)).toBeCloseTo(0, 10);
  });

  it("does not animate stationary/blocked characters and eases a moving pose to rest", () => {
    const { root, motion } = rig();
    for (let i = 0; i <= 60; i++) motion.update({ position: { x: 0, z: 0 }, time: i / 60 });
    for (const name of HUMAN_WALK_BONES) expect(root.getObjectByName(name)!.quaternion.angleTo(new Quaternion())).toBe(0);
    walk(motion);
    for (let i = 1; i <= 90; i++) motion.update({ position: { x: 0, z: 1.7 * .9 * 1.25 }, time: 2 + i / 60 });
    for (const name of HUMAN_WALK_BONES) expect(root.getObjectByName(name)!.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-5);
  });

  it("holds the occupied arm at its authored pose while legs and the free arm keep moving", () => {
    const { root, motion } = rig(true);
    const hand = local(root, "socket_hand_r");
    const left = local(root, "hand_l");
    motion.update({ position: { x: 0, z: 0 }, time: 0, holdRight: true });
    for (let i = 1; i <= 120; i++) motion.update({ position: { x: 0, z: i * .016 }, time: i / 60, holdRight: true });
    expect(local(root, "socket_hand_r").distanceTo(hand)).toBeLessThan(1e-10);
    expect(local(root, "hand_l").distanceTo(left)).toBeGreaterThan(.05);
    expect(root.getObjectByName("thigh_r")!.quaternion.angleTo(new Quaternion())).toBeGreaterThan(.2);
    motion.update({ position: { x: 0, z: 1.936 }, time: 121 / 60, holdRight: true, holdLeft: true });
    expect(local(root, "socket_hand_r").distanceTo(hand)).toBeLessThan(1e-10);
    expect(local(root, "hand_l").distanceTo(left)).toBeLessThan(1e-10);
  });

  it("rotates in model X even when an exported parent/bone has a different rest axis", () => {
    const { root, motion } = rig(true);
    const arm = root.getObjectByName("upper_arm_r")!;
    const rest = arm.getWorldQuaternion(new Quaternion());
    walk(motion);
    const delta = arm.getWorldQuaternion(new Quaternion()).multiply(rest.invert());
    expect(Math.abs(delta.x)).toBeGreaterThan(.08);
    expect(Math.abs(delta.y)).toBeLessThan(1e-10);
    expect(Math.abs(delta.z)).toBeLessThan(1e-10);
  });

  it("resets on relocation, a suspended tab or a backwards clock without accumulating rotation", () => {
    for (const frame of [
      { position: { x: 20, z: 20 }, time: 2 + 1 / 60 },
      { position: { x: 0, z: 1.7 * .9 * 1.25 }, time: 20 },
      { position: { x: 0, z: 1.7 * .9 * 1.25 }, time: 1 },
    ]) {
      const { root, motion } = rig(); walk(motion); motion.update(frame);
      for (const name of HUMAN_WALK_BONES) expect(root.getObjectByName(name)!.quaternion.angleTo(new Quaternion())).toBe(0);
    }
  });

  it("keeps stride phase tied to distance at 60/120 Hz, including repeated simulation positions", () => {
    const a = rig(); const b = rig();
    for (let i = 0; i <= 240; i++) {
      const z = Math.floor(i / 2) * .016;
      b.motion.update({ position: { x: 0, z }, time: i / 120 });
      if (i % 2 === 0) a.motion.update({ position: { x: 0, z }, time: i / 120 });
    }
    for (const name of HUMAN_WALK_BONES) {
      expect(a.root.getObjectByName(name)!.quaternion.angleTo(b.root.getObjectByName(name)!.quaternion)).toBeLessThan(.005);
    }
  });

  it("leaves an older static fallback model valid without a partial gait", () => {
    expect(bindHumanMotion(new Group(), 1.7)).toBeUndefined();
    const { root } = rig(); root.getObjectByName("shin_l")!.removeFromParent();
    expect(bindHumanMotion(root, 1.7)).toBeUndefined();
  });
});
