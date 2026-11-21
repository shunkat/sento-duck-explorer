import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import { LEVEL } from "../src/level/layout";
import { EnvironmentModels } from "../src/view/environmentModels";
import { ModelLibrary } from "../src/view/models";

describe("washing-station model placement", () => {
  it("contains all five pairs in LEVEL without distorting their authored proportions", async () => {
    const parent = new THREE.Group();
    const adapter = new EnvironmentModels(parent);
    const slots = [
      ...LEVEL.fixtures.filter(f => f.kind === "stool").map(f => ({ id: "bath_stool" as const, box: f.box, bottom: 0, height: f.height })),
      ...LEVEL.decor.filter(d => d.kind === "bucket").map(d => ({ id: "wash_basin" as const, box: d.box, bottom: d.y0, height: d.height })),
    ];
    const primitives = slots.map(s => {
      const primitive = new THREE.Object3D();
      parent.add(primitive);
      adapter.register(s.id, primitive, s.box, s.bottom, s.height);
      return primitive;
    });
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4), new THREE.MeshBasicMaterial());
    mesh.position.set(2, 3, -1);
    root.add(mesh);
    root.position.set(4, -2, 8);
    root.rotation.y = 0.4;
    const original = root.position.clone();
    const authoredSize = new THREE.Box3().setFromObject(root, true).getSize(new THREE.Vector3());
    const library = new ModelLibrary({ loadAsync: async () => ({ scene: root }), parseAsync: async () => ({ scene: root }) });
    adapter.use(library);
    expect(primitives.every(p => p.visible)).toBe(true);
    await library.load("bath_stool", "stool-fixture");
    await library.load("wash_basin", "basin-fixture");
    adapter.use(library);
    adapter.use(library);
    const models = parent.children.filter(c => c instanceof THREE.Group);
    expect(models).toHaveLength(10);
    expect(primitives.every(p => !p.visible)).toBe(true);
    for (const [i, instance] of models.entries()) {
      const s = slots[i]!;
      const b = new THREE.Box3().setFromObject(instance, true);
      const size = b.getSize(new THREE.Vector3());
      expect(b.min.x).toBeGreaterThanOrEqual(s.box.minX - 1e-6);
      expect(b.max.x).toBeLessThanOrEqual(s.box.maxX + 1e-6);
      expect(b.min.z).toBeGreaterThanOrEqual(s.box.minZ - 1e-6);
      expect(b.max.z).toBeLessThanOrEqual(s.box.maxZ + 1e-6);
      expect(b.min.y).toBeCloseTo(s.bottom);
      expect(b.max.y).toBeLessThanOrEqual(s.bottom + s.height + 1e-6);
      expect(b.getCenter(new THREE.Vector3()).x).toBeCloseTo((s.box.minX + s.box.maxX) / 2);
      expect(b.getCenter(new THREE.Vector3()).z).toBeCloseTo((s.box.minZ + s.box.maxZ) / 2);
      expect(size.x / size.y).toBeCloseTo(authoredSize.x / authoredSize.y);
      expect(size.z / size.y).toBeCloseTo(authoredSize.z / authoredSize.y);
      expect(Math.max(size.x / (s.box.maxX - s.box.minX), size.y / s.height,
        size.z / (s.box.maxZ - s.box.minZ))).toBeCloseTo(1);
      instance.traverse(o => {
        if (o instanceof THREE.Mesh) {
          expect(o.geometry).toBe(mesh.geometry);
          expect(o.material).toBe(mesh.material);
        }
      });
    }
    expect(root.position.equals(original)).toBe(true);
    expect(root.parent).toBeNull();
  });

  it("keeps the display on failure, reports bad geometry once, and replaces it after a valid load", async () => {
    const parent = new THREE.Group();
    const primitive = new THREE.Object3D();
    parent.add(primitive);
    const adapter = new EnvironmentModels(parent);
    adapter.register("bath_stool", primitive, { minX: 0, maxX: 0.36, minZ: 0, maxZ: 0.36 }, 0, 0.3);
    let root: THREE.Object3D = new THREE.Group();
    const library = new ModelLibrary({ loadAsync: async () => ({ scene: root }), parseAsync: async () => ({ scene: root }) });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await library.load("bath_stool", "empty-fixture");
      adapter.use(library);
      adapter.use(library);
      expect(primitive.visible).toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
      root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      await library.load("bath_stool", "valid-fixture");
      adapter.use(library);
      const previous = parent.children.find(o => o instanceof THREE.Group)!;
      expect(primitive.visible).toBe(false);
      root = new THREE.Group();
      await library.load("bath_stool", "invalid-replacement");
      adapter.use(library);
      expect(previous.parent).toBe(parent);
      root = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
      await library.load("bath_stool", "valid-replacement");
      adapter.use(library);
      expect(previous.parent).toBeNull();
      expect(parent.children.filter(o => o instanceof THREE.Group)).toHaveLength(1);
    } finally { warn.mockRestore(); }
  });
});
