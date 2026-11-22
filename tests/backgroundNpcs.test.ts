import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { BackgroundNpcs, NPC_LOD_IDS, NPC_SLOTS } from "../src/view/backgroundNpcs";
import { ModelLibrary } from "../src/view/models";

function body() {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(.55, 1.6, .32), new THREE.MeshStandardMaterial());
  mesh.position.y = .8; const root = new THREE.Group(); root.add(mesh); return root;
}
function world() {
  const root = new THREE.Group();
  NPC_SLOTS.forEach(([suffix], i) => {
    const slot = new THREE.Group(); slot.name = `npc_slot_${suffix}`;
    slot.position.set(i * 2, 0, 1); slot.rotation.y = .3; slot.scale.setScalar(.9);
    const high = body(); high.name = `npc_high_${suffix}`; slot.add(high); root.add(slot);
  });
  return root;
}
describe("background NPC distance detail", () => {
  it("keeps the tattooed customer's appearance when slot2 switches to distant detail", async () => {
    const lib = new ModelLibrary({
      loadAsync: async (url: string) => {
        const scene = body(); scene.userData.variant = url; return { scene };
      },
      parseAsync: async () => ({ scene: body() }),
    });
    for (const id of NPC_LOD_IDS) await lib.load(id, id);
    const root = world(), adapter = BackgroundNpcs.create(root, lib)!;
    expect(adapter).toBeTruthy();
    adapter.update(new THREE.Vector3(0, 50, 0), true);
    const tattooedFar = root.getObjectByName("npc_far_2")!;
    expect(tattooedFar.visible).toBe(true);
    expect(tattooedFar.userData.variant).toBe("npc_bath_tattooed_lod_far");
    for (const [suffix] of NPC_SLOTS) {
      if (suffix !== "2") expect(root.getObjectByName(`npc_far_${suffix}`)!.userData.variant).not.toBe("npc_bath_tattooed_lod_far");
    }
    expect(lib.get("npc_bath_standing_lod_far")).toBeTruthy();
  });
  it("waits for all sources and preserves placement while showing exactly one level", async () => {
    const root = world();
    const lib = new ModelLibrary({ loadAsync: async () => ({ scene: body() }), parseAsync: async () => ({ scene: body() }) });
    expect(BackgroundNpcs.create(root, lib)).toBeNull();
    for (const id of NPC_LOD_IDS) await lib.load(id, "far");
    const adapter = BackgroundNpcs.create(root, lib)!;
    expect(adapter).toBeTruthy();
    const first = root.children[0]!;
    const near = first.children[0]!, far = first.children[1]!;
    const before = new THREE.Box3().setFromObject(near, true);
    adapter.update(new THREE.Vector3(0, .8, 1), false);
    expect(near.visible).toBe(true); expect(far.visible).toBe(false);
    adapter.update(new THREE.Vector3(0, .8, 7.2), false);
    expect(near.visible).toBe(false); expect(far.visible).toBe(true);
    expect(new THREE.Box3().setFromObject(far, true).equals(before)).toBe(true);
    adapter.update(new THREE.Vector3(0, .8, 1), true);
    for (const slot of root.children) {
      expect(slot.children.filter(o => o.visible)).toHaveLength(1);
      expect(slot.children[1]!.visible).toBe(true);
    }
    adapter.update(new THREE.Vector3(0, .8, 1), false);
    expect(near.visible).toBe(true);
  });
  it("rejects a mismatched frame or missing slot before attaching any far geometry", async () => {
    let source: THREE.Object3D = body(); source.scale.setScalar(2);
    const lib = new ModelLibrary({ loadAsync: async () => ({ scene: source }), parseAsync: async () => ({ scene: source }) });
    for (const id of NPC_LOD_IDS) await lib.load(id, "bad");
    const root = world();
    expect(BackgroundNpcs.create(root, lib)).toBeNull();
    expect(root.children.every(slot => slot.children.length === 1)).toBe(true);
    source = body();
    for (const id of NPC_LOD_IDS) await lib.load(id, "good");
    root.remove(root.children[6]!);
    expect(BackgroundNpcs.create(root, lib)).toBeNull();
    expect(root.children.every(slot => slot.children.length === 1)).toBe(true);
  });
});
