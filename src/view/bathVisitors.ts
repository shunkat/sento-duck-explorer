// Additional bath-hall visitors reuse the reviewed, static standing GLB.
// A reaction animates a per-instance pivot, never the shared model geometry.
import * as THREE from "three";
import type { Vec2 } from "../core/types";
import { segmentBlocked } from "../core/actions";
import type { Level } from "../level/layout";
import type { AABB } from "../sim/geometry";
import type { ModelLibrary } from "./models";

export const BATH_VISITORS = [
  { id: "pool", pos: { x: 4.05, z: 7.55 }, yaw: -Math.PI / 2 },
  { id: "tub", pos: { x: 8.4, z: 4.1 }, yaw: 0 },
  { id: "washing", pos: { x: 5.8, z: 1.45 }, yaw: Math.PI },
  { id: "bench", pos: { x: 6.5, z: 3.55 }, yaw: Math.PI / 2 },
] as const;
export const SURPRISE_RADIUS = 3;
export const SURPRISE_SECONDS = 1.6;
const HIGH_DISTANCE = 4;
const HIGH_LIMIT = 2;

interface Visitor {
  anchor: THREE.Group;
  reaction: THREE.Group;
  fallback: THREE.Object3D;
  high?: THREE.Object3D;
  far?: THREE.Object3D;
  yaw: number;
  started: number;
}

export class BathVisitors {
  private readonly visitors: Visitor[];
  private readonly sightBlockers: readonly AABB[];
  private highSource?: THREE.Object3D;
  private farSource?: THREE.Object3D;
  private readonly eye = new THREE.Vector3();
  private overview = true;

  constructor(parent: THREE.Object3D, level: Level) {
    // Standing adults can see over the low kids' partition. Full-height walls
    // and tall opaque furniture still prevent reacting through another room.
    const low = new Set(level.fixtures.filter(f => f.height <= 1.2).map(f => f.box));
    this.sightBlockers = level.walls.filter(w => !low.has(w));
    const group = new THREE.Group();
    group.name = "bath_visitors";
    parent.add(group);
    this.visitors = BATH_VISITORS.map(slot => {
      const anchor = new THREE.Group();
      anchor.name = `bath_visitor_${slot.id}`;
      anchor.position.set(slot.pos.x, 0, slot.pos.z);
      anchor.rotation.y = slot.yaw;
      const reaction = new THREE.Group();
      reaction.name = "reaction";
      const fallback = new THREE.Mesh(new THREE.CapsuleGeometry(.23, 1.05, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0xcaa389, roughness: .85 }));
      fallback.position.y = .755;
      fallback.name = "visitor_fallback";
      reaction.add(fallback);
      anchor.add(reaction);
      group.add(anchor);
      return { anchor, reaction, fallback, yaw: slot.yaw, started: -Infinity };
    });
  }

  use(lib: ModelLibrary): void {
    const high = lib.get("npc_bath_standing")?.root;
    const far = lib.get("npc_bath_standing_lod_far")?.root;
    if (high === this.highSource && far === this.farSource) return;
    this.highSource = high;
    this.farSource = far;
    for (const visitor of this.visitors) {
      for (const detail of ["high", "far"] as const) {
        visitor[detail]?.removeFromParent();
        const source = detail === "high" ? high : far;
        const instance = source?.clone(true);
        if (instance) {
          instance.name = `visitor_${detail}`;
          instance.userData.source = source;
          visitor.reaction.add(instance);
        }
        visitor[detail] = instance;
      }
      visitor.fallback.visible = !high && !far;
    }
    this.updateDetail(this.eye, this.overview);
  }

  /** Called only for the real growth event, not for ordinary pickup/render. */
  onGrowth(pos: Vec2, now: number): void {
    for (const visitor of this.visitors) {
      const at = { x: visitor.anchor.position.x, z: visitor.anchor.position.z };
      if (Math.hypot(pos.x - at.x, pos.z - at.z) > SURPRISE_RADIUS
        || segmentBlocked(at, pos, this.sightBlockers)) continue;
      visitor.started = now;
      visitor.anchor.rotation.y = Math.atan2(pos.x - at.x, pos.z - at.z);
    }
  }

  update(now: number): void {
    for (const visitor of this.visitors) {
      const elapsed = now - visitor.started;
      const active = elapsed >= 0 && elapsed < SURPRISE_SECONDS;
      if (!active) {
        visitor.started = -Infinity;
        visitor.anchor.rotation.y = visitor.yaw;
        visitor.reaction.position.set(0, 0, 0);
        visitor.reaction.rotation.set(0, 0, 0);
        continue;
      }
      // Quick startled recoil, a short hold, then a gentle return to standing.
      const strength = elapsed < .18 ? Math.sin(elapsed / .18 * Math.PI / 2)
        : elapsed < .55 ? 1 : Math.max(0, 1 - (elapsed - .55) / (SURPRISE_SECONDS - .55));
      visitor.reaction.rotation.x = -.22 * strength;
      visitor.reaction.position.y = elapsed < .4 ? .075 * Math.sin(elapsed / .4 * Math.PI) : 0;
    }
  }

  /** Share authored meshes; cap close-detail visitors, use far meshes elsewhere. */
  updateDetail(eye: THREE.Vector3, overview: boolean): void {
    this.eye.copy(eye);
    this.overview = overview;
    const ordered = [...this.visitors].sort((a, b) => a.anchor.position.distanceToSquared(eye) - b.anchor.position.distanceToSquared(eye));
    let highCount = 0;
    for (const visitor of ordered) {
      const near = !overview && visitor.anchor.position.distanceTo(eye) <= HIGH_DISTANCE && highCount < HIGH_LIMIT;
      const high = !!visitor.high && (near || !visitor.far);
      if (high) highCount++;
      if (visitor.high) visitor.high.visible = high;
      if (visitor.far) visitor.far.visible = !high;
    }
  }

  reset(): void {
    for (const visitor of this.visitors) visitor.started = -Infinity;
    this.update(0);
  }
}
