import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { LEVEL } from "../src/level/layout";
import { GameScene, setBodyOpacity } from "../src/view/scene";
import { ModelLibrary } from "../src/view/models";
import { WORLD_ENVIRONMENT_NODES } from "../src/view/worldEnvironment";
import { createInitialState } from "../src/core/initialState";
import { deriveView } from "../src/view/deriveView";
import { FacingTracker } from "../src/view/shoulder";
import { TOWEL_DEPTH, TOWEL_THICKNESS, TOWEL_WIDTH } from "../src/view/humanModel";
import { SENTO_BACKGROUND_COLOR } from "../src/view/waterAppearance";
import { NPC_LOD_IDS, NPC_SLOTS } from "../src/view/backgroundNpcs";

vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  return { ...actual, WebGLRenderer: class { domElement = {}; setPixelRatio() {} render() {} } };
});
beforeEach(() => {
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("document", { createElement: () => ({
    getContext: () => ({ measureText: () => ({ width: 100 }), fillRect() {}, fillText() {} }),
  }) });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

type Internals = { scene: THREE.Scene; towels: Record<"child" | "adult", THREE.Object3D> };
const setup = () => {
  const game = new GameScene({ appendChild() {} } as unknown as HTMLElement, LEVEL);
  return { game, internal: game as unknown as Internals };
};
const boxModel = () => {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(.36, .3, .36), new THREE.MeshStandardMaterial());
  mesh.position.y = .15; root.add(mesh); return root;
};
const worldModel = () => {
  const root = new THREE.Group();
  for (const name of WORLD_ENVIRONMENT_NODES) {
    const part = boxModel(); part.name = name; root.add(part);
  }
  for (const [suffix] of NPC_SLOTS) {
    const slot = new THREE.Group(); slot.name = `npc_slot_${suffix}`;
    const high = boxModel(); high.name = `npc_high_${suffix}`;
    slot.add(high); root.getObjectByName("environment_static")!.add(slot);
  }
  return root;
};

describe("world and prop integration", () => {
  it("shades exactly the existing water boxes without extra geometry or background passes", () => {
    const { game, internal } = setup();
    const water = internal.scene.children.filter(o => o instanceof THREE.Mesh &&
      !Array.isArray(o.material) && o.material.name.startsWith("sento_water_")) as THREE.Mesh[];
    const tub = LEVEL.zones.find(z => z.id === "bathwater")!.box;
    const expected = [
      ...LEVEL.zones.filter(z => ["bathwater", "narrow_hole", "pond"].includes(z.id))
        .map(z => ({ box: z.box, bottom: z.id === "pond" ? 0 : .012 })),
      ...LEVEL.duckWater.filter(b => b !== tub).map(box => ({ box, bottom: .014 })),
      ...LEVEL.fixtures.filter(f => ["plunge", "outdoorBath", "basin"].includes(f.kind)).map(f => ({
        box: { minX: f.box.minX + .12, maxX: f.box.maxX - .12, minZ: f.box.minZ + .12, maxZ: f.box.maxZ - .12 },
        bottom: f.height + .002,
      })),
    ];
    expect(water).toHaveLength(expected.length);
    expect(new Set(water.map(mesh => mesh.material)).size).toBe(3);
    for (const { box, bottom } of expected) {
      const mesh = water.find(mesh => {
        const bounds = new THREE.Box3().setFromObject(mesh, true);
        return bounds.min.distanceTo(new THREE.Vector3(box.minX, bottom, box.minZ)) < 1e-6 &&
          bounds.max.distanceTo(new THREE.Vector3(box.maxX, bottom + .02, box.maxZ)) < 1e-6;
      });
      expect(mesh, `existing water at ${box.minX},${bottom},${box.minZ}`).toBeTruthy();
      expect(mesh!.geometry.index!.count).toBe(36); // Same 12-triangle box, one material/pass.
      expect(Array.isArray(mesh!.material)).toBe(false);
      expect(mesh!.children).toHaveLength(0);
    }
    expect(internal.scene.background).toBeInstanceOf(THREE.Color);
    expect((internal.scene.background as THREE.Color).getHex()).toBe(SENTO_BACKGROUND_COLOR);
    expect(internal.scene.fog).toBeNull();
    // The scene uses the existing frame timestamp for the shared uniform.
    const material = water[0]!.material as THREE.MeshStandardMaterial;
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader } as Parameters<THREE.Material["onBeforeCompile"]>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    game.positionCharacters(deriveView(createInitialState(LEVEL), LEVEL), 12, new FacingTracker());
    expect(shader.uniforms.sentoWaterTime!.value).toBe(12);
  });

  it("waits for the complete LOD bank, then hides all old environment batches while retaining independent displays", async () => {
    const { game, internal } = setup();
    const fallback = internal.scene.getObjectByName("environment_fallback")!;
    expect(fallback.children.some(o => o.name === "opaque_surface_batch")).toBe(true);
    const sprites = internal.scene.children.filter(o => o instanceof THREE.Sprite);
    const independent = internal.scene.children.filter(o => o instanceof THREE.Mesh);
    let source: THREE.Object3D = worldModel();
    const lib = new ModelLibrary({ loadAsync: async () => ({ scene: source }), parseAsync: async () => ({ scene: source }) });
    await lib.load("sento_environment", "world"); game.useModels(lib);
    expect(fallback.visible).toBe(true);
    for (const id of ["bath_stool", "wash_basin", "bath_stool_lod_medium", "bath_stool_lod_far", "wash_basin_lod_medium"]) {
      source = boxModel(); await lib.load(id, "prop"); game.useModels(lib);
      expect(fallback.visible).toBe(true);
    }
    source = boxModel(); await lib.load("wash_basin_lod_far", "prop"); game.useModels(lib);
    expect(fallback.visible).toBe(true);
    for (const id of NPC_LOD_IDS) {
      source = boxModel(); await lib.load(id, "npc"); game.useModels(lib);
    }
    expect(fallback.visible).toBe(false);
    for (const fixture of LEVEL.fixtures.filter(f => ["plunge", "outdoorBath", "basin"].includes(f.kind))) {
      const cx = (fixture.box.minX + fixture.box.maxX) / 2;
      const cz = (fixture.box.minZ + fixture.box.maxZ) / 2;
      const water = internal.scene.children.find(o => o instanceof THREE.Mesh &&
        !Array.isArray(o.material) && o.material.name.startsWith("sento_water_") &&
        Math.abs(o.position.x - cx) < 1e-6 && Math.abs(o.position.z - cz) < 1e-6)!;
      expect(new THREE.Box3().setFromObject(water, true).max.y).toBeCloseTo(fixture.height - .025);
    }
    let oldVisible = 0; fallback.traverseVisible(o => { if (o instanceof THREE.Mesh) oldVisible++; });
    expect(oldVisible).toBe(0);
    expect(internal.scene.children.filter(o => o instanceof THREE.Sprite)).toEqual(sprites);
    // Water, soap, and control rings stay outside the authored environment.
    expect(independent.filter(o => o.visible).length).toBeGreaterThan(0);
    for (const id of ["bath_stool", "wash_basin"]) expect(internal.scene.children.filter(o => o.name === id)).toHaveLength(5);
    const world = internal.scene.getObjectByName("sento_environment")!;
    const state = createInitialState(LEVEL), view = deriveView(state, LEVEL);
    game.positionCharacters(view, 0, new FacingTracker());
    game.render(view, { eye: { x: 6, y: 1, z: 2 }, target: { x: 6, y: 1, z: 1 } }, true);
    expect(world.getObjectByName("environment_upper")!.visible).toBe(false);
    expect(world.getObjectByName("sauna_door")!.visible).toBe(false); // the sauna is never locked (2026-11-21)
    game.render(view, { eye: { x: 6, y: 1, z: 2 }, target: { x: 6, y: 1, z: 1 } }, false);
    expect(world.getObjectByName("environment_upper")!.visible).toBe(true);
    expect(world.getObjectByName("sauna_door")!.visible).toBe(false);
  });

  it("centers each towel for the existing pose math and keeps each person's fade independent", async () => {
    const { game, internal } = setup();
    const old = { ...internal.towels };
    const source = new THREE.Group(), material = new THREE.MeshStandardMaterial();
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(TOWEL_WIDTH, TOWEL_THICKNESS, TOWEL_DEPTH), material);
    cloth.position.y = TOWEL_THICKNESS / 2; source.add(cloth); // final GLB bottom origin
    const lib = new ModelLibrary({ loadAsync: async () => ({ scene: source }), parseAsync: async () => ({ scene: source }) });
    await lib.load("towel", "towel-fixture"); game.useModels(lib); game.useModels(lib);
    for (const id of ["child", "adult"] as const) {
      const root = internal.towels[id];
      expect(root.name).toBe("towel");
      expect(old[id].parent).toBeNull();
      const box = new THREE.Box3().setFromObject(root, true);
      expect(box.getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-7);
      expect(box.getSize(new THREE.Vector3()).distanceTo(new THREE.Vector3(TOWEL_WIDTH, TOWEL_THICKNESS, TOWEL_DEPTH))).toBeLessThan(1e-7);
    }
    setBodyOpacity(internal.towels.child, .3);
    internal.towels.adult.traverse(o => { if (o instanceof THREE.Mesh) expect((o.material as THREE.Material).opacity).toBe(1); });
    expect(material.opacity).toBe(1);
    expect(source.parent).toBeNull();
    expect(source.position.length()).toBe(0);
    // One player: the Child stage with the towel on the head, then the Adult stage holding it.
    const state = createInitialState(LEVEL);
    Object.assign(state.player, { stage: "child", towel: "head" });
    state.milk.milk1 = "collected";
    game.positionCharacters(deriveView(state, LEVEL), 0, new FacingTracker());
    expect(internal.towels.child.rotation.x).toBe(0);
    expect(internal.towels.child.position.y).toBeCloseTo(.6 + TOWEL_THICKNESS / 2);
    Object.assign(state.player, { stage: "adult", towel: "held" });
    state.milk.milk2 = "collected";
    game.positionCharacters(deriveView(state, LEVEL), 0, new FacingTracker());
    expect(internal.towels.adult.rotation.x).toBeCloseTo(Math.PI / 2);
    // The held towel's top meets the placeholder hand; its center remains
    // half the folded depth below that hand, unchanged by the new GLB origin.
    expect(internal.towels.adult.position.y).toBeCloseTo(-.05 * 1.7 - TOWEL_DEPTH / 2);
  });
});

describe("growth view in the scene (2026-11-21)", () => {
  type G = { chars: Record<string, THREE.Group>; items: Record<string, THREE.Object3D>; highDoors: Record<string, THREE.Object3D>; rings: Record<string, THREE.Mesh>; guardian: THREE.Group };
  it("draws one body per stage at the player, hides collected bottles and opened doors, and pulses the ring on growth", () => {
    const game = new GameScene({ appendChild() {} } as unknown as HTMLElement, LEVEL);
    const g = game as unknown as G;
    const state = createInitialState(LEVEL);
    const pose = { eye: { x: 6, y: 1, z: 9 }, target: { x: 6, y: 0.5, z: 6 } };
    let view = deriveView(state, LEVEL);
    game.positionCharacters(view, 0, new FacingTracker());
    game.render(view, pose, false);
    expect(["duck", "child", "adult"].filter((id) => g.chars[id]!.visible)).toEqual(["duck"]);
    expect(Object.values(g.items).map(m => m.visible)).toEqual([true, true, true, true]);
    expect(g.items.milk1!.position.toArray()).toEqual([LEVEL.nodes.milk1.x, 0, LEVEL.nodes.milk1.z]);
    expect([g.highDoors.kidsGate!.visible, g.highDoors.frontExit!.visible]).toEqual([true, true]);
    expect(g.guardian.position.x).toBe(LEVEL.guardianPath[0]!.x);

    Object.assign(state.player, { stage: "adult", towel: "head" });
    state.milk = { milk1: "collected", milk2: "collected", milk3: "collected", milk4: "collected" };
    state.doors.kidsGate = "open";
    view = deriveView(state, LEVEL);
    game.growthCue(1);
    game.positionCharacters(view, 1, new FacingTracker());
    game.render(view, pose, false);
    expect(["duck", "child", "adult"].filter((id) => g.chars[id]!.visible)).toEqual(["adult"]);
    expect(g.chars.adult!.position.x).toBe(state.player.pos.x);
    expect([g.items.milk1!.visible, g.items.milk2!.visible]).toEqual([false, false]);
    expect([g.highDoors.kidsGate!.visible, g.highDoors.frontExit!.visible]).toEqual([false, true]);
    expect(g.rings.adult!.scale.x).toBeGreaterThan(1);
    game.positionCharacters(view, 2, new FacingTracker());
    expect(g.rings.adult!.scale.x).toBe(1);
  });
});

describe("guardian model (2026-11-22)", () => {
  it("uses the existing npc_bath_standing model once loaded, bottom at the floor, capsule hidden", async () => {
    const game = new GameScene({ appendChild() {} } as unknown as HTMLElement, LEVEL);
    const g = game as unknown as { guardian: THREE.Group; guardianCapsule: THREE.Mesh };
    expect(g.guardianCapsule.visible).toBe(true);
    const lib = new ModelLibrary({ loadAsync: async () => ({ scene: boxModel() }), parseAsync: async () => ({ scene: boxModel() }) });
    await lib.load("npc_bath_standing", "guardian-fixture");
    game.useModels(lib);
    game.useModels(lib);
    const models = g.guardian.children.filter((o) => o.userData.source === lib.get("npc_bath_standing")!.root);
    expect(models).toHaveLength(1);
    expect(models[0]!.position.y).toBeCloseTo(-1.7 / 2);
    expect(g.guardianCapsule.visible).toBe(false);
  });
});

describe("milk bottle model (2026-11-22)", () => {
  type M = { items: Record<"milk1" | "milk2", THREE.Group> };
  const real = () => {
    const b = readFileSync(new URL("../public/models/milk_bottle.glb", import.meta.url));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };

  it("one real GLB is drawn at scale 1 on the floor at both bottles; collected bottles are hidden", async () => {
    const game = new GameScene({ appendChild() {} } as unknown as HTMLElement, LEVEL);
    const g = game as unknown as M;
    const lib = new ModelLibrary();
    await lib.parse("milk_bottle", real());
    game.useModels(lib);
    const state = createInitialState(LEVEL);
    let view = deriveView(state, LEVEL);
    game.positionCharacters(view, 0, new FacingTracker());
    game.render(view, { eye: { x: 2, y: 1, z: 6 }, target: { x: 1.2, y: 0.1, z: 7 } }, false);
    for (const id of ["milk1", "milk2"] as const) {
      const group = g.items[id];
      const model = group.children.find((o) => o.userData.source === lib.get("milk_bottle")!.root)!;
      expect(model, id).toBeTruthy();
      expect(model.scale.toArray()).toEqual([1, 1, 1]);
      expect(group.position.toArray()).toEqual([LEVEL.nodes[id].x, 0, LEVEL.nodes[id].z]);
      const box = new THREE.Box3().setFromObject(model);
      expect(box.min.y).toBeCloseTo(0, 6);
      expect(group.children.filter((o) => o instanceof THREE.Mesh && o.visible)).toHaveLength(0); // primitive hidden
      expect(group.visible).toBe(true);
    }
    state.milk.milk1 = "collected";
    view = deriveView(state, LEVEL);
    game.render(view, { eye: { x: 2, y: 1, z: 6 }, target: { x: 1.2, y: 0.1, z: 7 } }, false);
    expect([g.items.milk1.visible, g.items.milk2.visible]).toEqual([false, true]);
  });

  it("a failed load keeps the primitive placeholder", async () => {
    const game = new GameScene({ appendChild() {} } as unknown as HTMLElement, LEVEL);
    const g = game as unknown as M;
    const lib = new ModelLibrary();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await lib.parse("milk_bottle", new ArrayBuffer(4));
    game.useModels(lib);
    for (const id of ["milk1", "milk2"] as const) {
      expect(g.items[id].children.filter((o) => o instanceof THREE.Mesh && o.visible).length, id).toBe(2); // bottle + cap
    }
  });
});

describe("growth_v02 environment export in the scene (2026-11-22)", () => {
  const bytes = (url: string) => {
    const b = readFileSync(new URL(`../public/${url}`, import.meta.url));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };

  it("the real export is accepted with both growth doors; the game's growth primitives hide; door nodes follow the door state", async () => {
    const game = new GameScene({ appendChild() {} } as unknown as HTMLElement, LEVEL);
    // Only image decoding is stubbed (no DOM image decoder in Node); meshes and nodes are real.
    const loader = new GLTFLoader().register(() => ({ name: "skip_image_decode", loadTexture: async () => new THREE.Texture() }));
    const lib = new ModelLibrary(loader);
    await lib.parse("sento_environment", bytes("models/sento_environment.glb"));
    for (const id of NPC_LOD_IDS) await lib.parse(id, bytes(`models/${id}.glb`));
    for (const id of ["bath_stool", "wash_basin", "bath_stool_lod_medium", "bath_stool_lod_far", "wash_basin_lod_medium", "wash_basin_lod_far"]) {
      await lib.parse(id, bytes(`models/${id}.glb`));
    }
    game.useModels(lib);
    const internal = game as unknown as { scene: THREE.Scene; worldEnvironment: { active: boolean; hasGrowthDoors: boolean } };
    expect(internal.worldEnvironment.active).toBe(true);
    expect(internal.worldEnvironment.hasGrowthDoors).toBe(true);
    const world = internal.scene.getObjectByName("sento_environment")!;
    const gate = world.getObjectByName("growth_kids_gate")!;
    const exit = world.getObjectByName("growth_front_exit")!;
    const exitUpper = world.getObjectByName("growth_front_exit_upper")!;
    const state = createInitialState(LEVEL);
    const pose = { eye: { x: 9, y: 1.4, z: -6 }, target: { x: 11, y: 1, z: -7 } };
    let view = deriveView(state, LEVEL);
    game.positionCharacters(view, 0, new FacingTracker());
    game.render(view, pose, false);
    expect(internal.scene.getObjectByName("growth_fallback")!.visible).toBe(false);
    expect([gate.visible, exit.visible, exitUpper.visible]).toEqual([true, true, true]);
    game.render(view, pose, true);
    expect([exit.visible, exitUpper.visible]).toEqual([true, false]);
    state.doors = { kidsGate: "open", frontExit: "open" };
    view = deriveView(state, LEVEL);
    game.render(view, pose, false);
    expect([gate.visible, exit.visible]).toEqual([false, false]);
    expect(world.getObjectByName("sauna_door")!.visible).toBe(false);
  });
});
