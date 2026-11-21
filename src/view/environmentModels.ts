// Static environment instances. Only the view changes: LEVEL keeps collision.
import * as THREE from "three";
import type { AABB } from "../sim/geometry";
import type { ModelLibrary } from "./models";

export type EnvironmentModelId = "bath_stool" | "wash_basin";

interface Slot {
  id: EnvironmentModelId;
  primitive: THREE.Object3D;
  box: AABB;
  bottom: number;
  height: number;
  instance?: THREE.Group;
}

/** Clones share geometry and materials; instance transforms never change the source. */
export class EnvironmentModels {
  private slots: Slot[] = [];
  private attempted = new Map<EnvironmentModelId, THREE.Object3D>();

  constructor(private parent: THREE.Object3D) {}

  register(id: EnvironmentModelId, primitive: THREE.Object3D, box: AABB, bottom: number, height: number): void {
    this.slots.push({ id, primitive, box, bottom, height });
  }

  use(lib: ModelLibrary): void {
    for (const id of ["bath_stool", "wash_basin"] as const) {
      const source = lib.get(id)?.root;
      if (!source || this.attempted.get(id) === source) continue;
      this.attempted.set(id, source);
      const template = source.clone(true);
      template.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(template, true);
      const size = bounds.getSize(new THREE.Vector3());
      if (![size.x, size.y, size.z].every((n) => Number.isFinite(n) && n > 1e-6)) {
        console.warn(`Environment model ${id} has invalid bounds; keeping the current display.`);
        continue;
      }
      // Offset at the root preserves authored descendant transforms.
      template.position.sub(new THREE.Vector3((bounds.min.x + bounds.max.x) / 2, bounds.min.y,
        (bounds.min.z + bounds.max.z) / 2));
      for (const slot of this.slots) {
        if (slot.id !== id) continue;
        const instance = new THREE.Group();
        instance.name = id;
        instance.add(template.clone(true));
        instance.position.set((slot.box.minX + slot.box.maxX) / 2, slot.bottom,
          (slot.box.minZ + slot.box.maxZ) / 2);
        // LEVEL is a containment envelope, not a target shape. Independent
        // axis scaling made round basins oval and stretched their side walls.
        const scale = Math.min((slot.box.maxX - slot.box.minX) / size.x,
          slot.height / size.y, (slot.box.maxZ - slot.box.minZ) / size.z);
        instance.scale.setScalar(scale);
        this.parent.add(instance);
        slot.instance?.removeFromParent();
        slot.instance = instance;
        slot.primitive.visible = false;
      }
    }
  }
}
