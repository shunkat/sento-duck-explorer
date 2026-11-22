import * as THREE from "three";
import type { ModelLibrary } from "./models";

export const NPC_LOD_IDS = ["npc_staff_lod_far", "npc_seated_lod_far", "npc_bath_standing_lod_far", "npc_bath_tattooed_lod_far"] as const;
export const NPC_DETAIL_DISTANCE = 6;
export const NPC_SLOTS = [
  ["staff", "npc_staff_lod_far"], ["0", "npc_seated_lod_far"],
  ["1", "npc_seated_lod_far"], ["2", "npc_bath_tattooed_lod_far"],
  ["3", "npc_seated_lod_far"], ["4", "npc_seated_lod_far"], ["5", "npc_seated_lod_far"],
] as const;

function finiteBounds(root: THREE.Object3D): THREE.Box3 | null {
  root.updateMatrixWorld(true);
  let meshCount = 0, valid = true;
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    meshCount++;
    const p = o.geometry.getAttribute("position");
    if (!p?.count || !o.matrixWorld.elements.every(Number.isFinite)) { valid = false; return; }
    for (let i = 0; i < p.count; i++) {
      if (![p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite)) { valid = false; break; }
    }
  });
  if (!meshCount || !valid) return null;
  const bounds = new THREE.Box3().setFromObject(root, true);
  return bounds.getSize(new THREE.Vector3()).toArray().every(n => n > 1e-6 && Number.isFinite(n)) ? bounds : null;
}

/** Each far mesh inherits the exact placed near model's frame, never its own fit. */
export class BackgroundNpcs {
  private constructor(private slots: { high: THREE.Object3D; far: THREE.Object3D; center: THREE.Vector3 }[]) {}

  static create(world: THREE.Object3D, lib: ModelLibrary): BackgroundNpcs | null {
    const slots: { high: THREE.Object3D; far: THREE.Object3D; center: THREE.Vector3 }[] = [];
    world.updateMatrixWorld(true);
    for (const [suffix, id] of NPC_SLOTS) {
      const matches: THREE.Object3D[] = [];
      world.traverse(o => { if (o.name === `npc_slot_${suffix}`) matches.push(o); });
      const slot = matches.length === 1 ? matches[0]! : undefined;
      const high = slot?.children.find(o => o.name === `npc_high_${suffix}`);
      const source = lib.get(id)?.root;
      if (!slot || !high || !source) return null;
      const nearBounds = finiteBounds(high.clone(true));
      const far = source.clone(true);
      const farBounds = finiteBounds(far);
      if (!nearBounds || !farBounds ||
          nearBounds.min.distanceTo(farBounds.min) > .04 || nearBounds.max.distanceTo(farBounds.max) > .04) return null;
      far.name = `npc_far_${suffix}`;
      far.visible = false;
      const center = new THREE.Box3().setFromObject(high, true).getCenter(new THREE.Vector3());
      slots.push({ high, far, center });
    }
    // Only mutate the candidate world after every slot/source passed the check.
    for (const { high, far } of slots) high.parent!.add(far);
    return new BackgroundNpcs(slots);
  }

  update(eye: THREE.Vector3, overview: boolean): void {
    for (const { high, far, center } of this.slots) {
      const distant = overview || center.distanceTo(eye) > NPC_DETAIL_DISTANCE;
      high.visible = !distant;
      far.visible = distant;
    }
  }
}
