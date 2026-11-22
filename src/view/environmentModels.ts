// Shared, uniformly scaled prop instances. LEVEL remains the collision source.
import * as THREE from "three";
import type { AABB } from "../sim/geometry";
import type { ModelLibrary } from "./models";

export const WASHING_MODEL_IDS = ["bath_stool", "wash_basin"] as const;
export type WashingModelId = typeof WASHING_MODEL_IDS[number];
type PlaceableModelId = WashingModelId | "soap";
export type DetailLevel = "high" | "medium" | "far";
export type EnvironmentModelId = PlaceableModelId | `${WashingModelId}_lod_medium` | `${WashingModelId}_lod_far` | "sento_environment" | "towel" | "npc_staff_lod_far" | "npc_seated_lod_far" | "npc_bath_standing_lod_far" | "npc_bath_tattooed_lod_far" | "npc_bath_standing";
export const WASHING_LOD_DISTANCES = { high: 1.6, medium: 4.5 } as const;
export const WASHING_LOD_LIMITS = { high: 2 } as const;
const DETAIL_LEVELS: readonly DetailLevel[] = ["high", "medium", "far"];
const PLACED_IDS: readonly PlaceableModelId[] = [...WASHING_MODEL_IDS, "soap"];
const sourceId = (id: PlaceableModelId, level: DetailLevel): EnvironmentModelId =>
  level === "high" || id === "soap" ? id : `${id}_lod_${level}`;

interface Slot {
  id: PlaceableModelId;
  primitive: THREE.Object3D;
  box: AABB;
  bottom: number;
  height: number;
  instance?: THREE.Group;
  levels?: Partial<Record<DetailLevel, THREE.Object3D>>;
}
interface Source { root: THREE.Object3D; bounds: THREE.Box3; size: THREE.Vector3 }

/** Geometry/materials are shared. Per-slot transforms and LOD visibility are not. */
export class EnvironmentModels {
  private slots: Slot[] = [];
  private attempted = new Map<EnvironmentModelId, THREE.Object3D>();
  private sources = new Map<EnvironmentModelId, Source>();
  private applied = new Map<PlaceableModelId, (THREE.Object3D | undefined)[]>();
  private eye = new THREE.Vector3();
  private overview = true; // Start conservatively until the first real camera pose.

  constructor(private parent: THREE.Object3D) {}

  register(id: PlaceableModelId, primitive: THREE.Object3D, box: AABB, bottom: number, height: number): void {
    this.slots.push({ id, primitive, box, bottom, height });
  }

  hasWashingDetailSet(): boolean {
    return WASHING_MODEL_IDS.every(id => DETAIL_LEVELS.every(level => this.sources.has(sourceId(id, level))));
  }

  use(lib: ModelLibrary): void {
    for (const id of PLACED_IDS) {
      for (const level of id === "soap" ? ["high"] as const : DETAIL_LEVELS) {
        const key = sourceId(id, level);
        const source = lib.get(key)?.root;
        if (!source || this.attempted.get(key) === source) continue;
        this.attempted.set(key, source);
        const template = source.clone(true);
        template.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(template, true);
        const size = bounds.getSize(new THREE.Vector3());
        if (![size.x, size.y, size.z, ...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite) ||
            [size.x, size.y, size.z].some(n => n <= 1e-6)) {
          console.warn(`Environment model ${key} has invalid bounds; keeping the current display.`);
          continue;
        }
        this.sources.set(key, { root: source, bounds, size });
      }
      const high = this.sources.get(id);
      if (!high) continue;
      const sources = DETAIL_LEVELS.map(level => this.sources.get(sourceId(id, level)));
      const identity = sources.map(s => s?.root);
      if (identity.every((root, i) => this.applied.get(id)?.[i] === root)) continue;
      this.applied.set(id, identity);
      for (const slot of this.slots) {
        if (slot.id !== id) continue;
        const instance = new THREE.Group();
        instance.name = id;
        const levels: Partial<Record<DetailLevel, THREE.Object3D>> = {};
        for (const [i, source] of sources.entries()) {
          if (!source || (id === "soap" && i > 0)) continue;
          const model = source.root.clone(true);
          // Use the high model's frame for every LOD. Never renormalize each
          // reduced silhouette: switching detail must not change position/size.
          model.position.sub(new THREE.Vector3((high.bounds.min.x + high.bounds.max.x) / 2, high.bounds.min.y,
            (high.bounds.min.z + high.bounds.max.z) / 2));
          model.visible = false;
          levels[DETAIL_LEVELS[i]!] = model;
          instance.add(model);
        }
        instance.position.set((slot.box.minX + slot.box.maxX) / 2, slot.bottom,
          (slot.box.minZ + slot.box.maxZ) / 2);
        const scale = Math.min((slot.box.maxX - slot.box.minX) / high.size.x,
          slot.height / high.size.y, (slot.box.maxZ - slot.box.minZ) / high.size.z);
        instance.scale.setScalar(scale);
        this.parent.add(instance);
        slot.instance?.removeFromParent();
        slot.instance = instance;
        slot.levels = levels;
        slot.primitive.visible = false;
      }
    }
    this.updateDetail(this.eye, this.overview);
  }

  /** Select exactly one available LOD per prop, including the overview. */
  updateDetail(eye: THREE.Vector3, overview: boolean): void {
    this.eye.copy(eye);
    this.overview = overview;
    for (const id of PLACED_IDS) {
      const candidates = this.slots.filter(slot => slot.id === id && slot.instance && slot.levels)
        .map(slot => ({ slot, distance: new THREE.Vector3(slot.instance!.position.x,
          slot.bottom + slot.height / 2, slot.instance!.position.z).distanceTo(eye) }))
        .sort((a, b) => a.distance - b.distance);
      let high = 0;
      for (const { slot, distance } of candidates) {
        let requested: DetailLevel = "far";
        if (id === "soap") requested = "high";
        else if (!overview) {
          if (distance <= WASHING_LOD_DISTANCES.high && high < WASHING_LOD_LIMITS.high) {
            requested = "high";
            high++;
          } else if (distance <= WASHING_LOD_DISTANCES.medium) {
            // The far silhouette is visibly angular nearby. Exhausting the
            // high-detail allocation must still keep nearby props at medium.
            requested = "medium";
          }
        }
        const preference: DetailLevel[] = requested === "high" ? ["high", "medium", "far"]
          : requested === "medium" ? ["medium", "high", "far"] : ["far", "medium", "high"];
        const selected = preference.find(level => slot.levels![level])!;
        for (const level of DETAIL_LEVELS) if (slot.levels![level]) slot.levels![level]!.visible = level === selected;
        slot.instance!.userData.detailLevel = selected;
      }
    }
  }
}
