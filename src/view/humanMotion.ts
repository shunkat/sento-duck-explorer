// View-only gait on the shared human rig. Distance comes from the resolved
// character positions, so a blocked input never makes someone walk in place.
import { Bone, Quaternion, SkinnedMesh, Vector3, type Object3D } from "three";
import type { Vec2 } from "../core/types";

export const HUMAN_WALK_BONES = [
  "thigh_r", "shin_r", "foot_r", "thigh_l", "shin_l", "foot_l",
  "upper_arm_r", "forearm_r", "upper_arm_l", "forearm_l",
] as const;
type WalkBone = (typeof HUMAN_WALK_BONES)[number];
interface Joint { bone: Bone; rest: Quaternion; axis: Vector3 }

export interface HumanMotionFrame {
  position: Vec2;
  time: number;
  /** Keep an occupied right hand (for example a held towel) at its rest pose. */
  holdRight?: boolean;
  /** Optional occupied left hand; the growth route does not use this. */
  holdLeft?: boolean;
}

/** Missing rigs remain compatible with the static model/primitive fallback. */
export function bindHumanMotion(root: Object3D, height: number): HumanMotion | undefined {
  if (!HUMAN_WALK_BONES.every(name => root.getObjectByName(name) instanceof Bone)) return undefined;
  return new HumanMotion(root, height);
}

export class HumanMotion {
  private joints = {} as Record<WalkBone, Joint>;
  private delta = new Quaternion();
  private previous?: { x: number; z: number; time: number };
  private lastMoved = -Infinity;
  private phase = 0;
  private weight = 0;
  private speed = 0;
  private rootY: number;
  private footY: Record<"r" | "l", number>;
  private point = new Vector3();

  constructor(private readonly root: Object3D, private readonly height: number) {
    root.updateWorldMatrix(true, true);
    const rootInverse = root.getWorldQuaternion(new Quaternion()).invert();
    for (const name of HUMAN_WALK_BONES) {
      const bone = root.getObjectByName(name) as Bone;
      // Blender bones do not all have the same local axes. Express the
      // model's X axis in each rest parent's coordinates, then pre-multiply
      // that rotation onto the authored rest quaternion (never overwrite it).
      const parent = bone.parent!.getWorldQuaternion(new Quaternion()).premultiply(rootInverse);
      this.joints[name] = { bone, rest: bone.quaternion.clone(),
        axis: new Vector3(1, 0, 0).applyQuaternion(parent.invert()) };
    }
    this.rootY = root.position.y;
    this.footY = { r: this.footHeight("r"), l: this.footHeight("l") };
    root.traverse(node => {
      // A cached rest-pose sphere cannot cover swinging feet/hands. There are
      // only one visible human body; its full cost is already in the scene
      // budget, so keep them visible instead of reskinning bounds every frame.
      if (node instanceof SkinnedMesh) node.frustumCulled = false;
    });
  }

  private rotate(name: WalkBone, angle: number): void {
    const { bone, rest, axis } = this.joints[name];
    bone.quaternion.copy(this.delta.setFromAxisAngle(axis, angle)).multiply(rest);
  }

  private rest(): void {
    this.phase = this.weight = this.speed = 0;
    this.lastMoved = -Infinity;
    for (const joint of Object.values(this.joints)) joint.bone.quaternion.copy(joint.rest);
    this.root.position.y = this.rootY;
  }

  /** A hidden growth stage starts at rest when it becomes the player body. */
  reset(): void {
    this.previous = undefined;
    this.rest();
  }

  private footHeight(side: "r" | "l"): number {
    return this.root.worldToLocal(this.joints[`foot_${side}`].bone.getWorldPosition(this.point)).y;
  }

  update({ position, time, holdRight = false, holdLeft = false }: HumanMotionFrame): void {
    if (!Number.isFinite(position.x + position.z + time)) {
      this.previous = undefined;
      this.rest();
      return;
    }
    const previous = this.previous;
    this.previous = { x: position.x, z: position.z, time };
    if (!previous) { this.rest(); return; }
    const dt = time - previous.time;
    const distance = Math.hypot(position.x - previous.x, position.z - previous.z);
    // Restores/door relocation and tab suspension are not travelled steps.
    // 6.5 m/s allows fixed-tick sampling around the game's 4.5 m/s run speed.
    if (dt < 0 || dt > .25 || distance > Math.max(.2, dt * 6.5) || (dt === 0 && distance > 0)) {
      this.rest();
      return;
    }
    if (dt === 0) return;
    if (distance > 1e-5) {
      this.lastMoved = time;
      this.phase = (this.phase + distance / (this.height * .9) * Math.PI * 2) % (Math.PI * 2);
    }
    const smoothing = 1 - Math.exp(-12 * dt);
    this.speed += (Math.min(6.5, distance / dt) - this.speed) * smoothing;
    // A 60 Hz simulation may give a 120 Hz render the same position twice.
    // This brief grace avoids alternating walk/rest without advancing a step.
    const target = time - this.lastMoved < .06 ? Math.min(1, this.speed / .5) : 0;
    this.weight += (target - this.weight) * smoothing;
    if (this.weight < 1e-4 && target === 0) { this.rest(); return; }
    const pace = Math.min(1.2, .8 + this.speed * .08);
    const swing = Math.sin(this.phase);
    for (const side of ["r", "l"] as const) {
      const step = side === "r" ? swing : -swing;
      // +Z is forward. Negative X rotation brings the thigh forward; a
      // positive knee rotation folds the trailing shin back for recovery.
      const thigh = -.36 * step * this.weight * pace;
      const shin = .58 * Math.max(0, -step) ** 2 * this.weight * pace;
      this.rotate(`thigh_${side}`, thigh);
      this.rotate(`shin_${side}`, shin);
      this.rotate(`foot_${side}`, -(thigh + shin));
      const arm = (side === "r" ? holdRight : holdLeft) ? 0 : this.weight;
      this.rotate(`upper_arm_${side}`, .25 * step * arm * pace);
      this.rotate(`forearm_${side}`, -(.08 + .14 * Math.max(0, -step)) * arm);
    }
    // Rotating a straight stance leg otherwise raises both feet off the floor.
    // Lower the complete model by the stance ankle's rise, preserving its
    // authored sole height. Hands, head and carry socket share the same bob.
    // This is visual ground contact on the level's flat floor, not terrain IK.
    this.root.updateWorldMatrix(true, true);
    const lift = Math.min(this.footHeight("r") - this.footY.r, this.footHeight("l") - this.footY.l);
    this.root.position.y = this.rootY - lift;
  }
}
