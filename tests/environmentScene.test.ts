import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { LEVEL } from "../src/level/layout";
import { GameScene, setBodyOpacity } from "../src/view/scene";
import { ModelLibrary } from "../src/view/models";
import { WORLD_ENVIRONMENT_NODES } from "../src/view/worldEnvironment";
import { createInitialState } from "../src/core/initialState";
import { deriveView } from "../src/view/deriveView";
import { FacingTracker } from "../src/view/shoulder";
import { TOWEL_DEPTH, TOWEL_THICKNESS, TOWEL_WIDTH } from "../src/view/humanModel";
import { SENTO_BACKGROUND_COLOR } from "../src/view/waterAppearance";

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
    expect(fallback.visible).toBe(false);
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
    expect(world.getObjectByName("sauna_door")!.visible).toBe(view.saunaDoorLocked);
    const unlocked = { ...view, saunaDoorLocked: false };
    game.render(unlocked, { eye: { x: 6, y: 1, z: 2 }, target: { x: 6, y: 1, z: 1 } }, false);
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
    const state = createInitialState(LEVEL);
    state.child.towel = "head";
    state.adult.towel = "held";
    game.positionCharacters(deriveView(state, LEVEL), 0, new FacingTracker());
    expect(internal.towels.child.rotation.x).toBe(0);
    expect(internal.towels.adult.rotation.x).toBeCloseTo(Math.PI / 2);
    expect(internal.towels.child.position.y).toBeCloseTo(.6 + TOWEL_THICKNESS / 2);
    // The held towel's top meets the placeholder hand; its center remains
    // half the folded depth below that hand, unchanged by the new GLB origin.
    expect(internal.towels.adult.position.y).toBeCloseTo(-.05 * 1.7 - TOWEL_DEPTH / 2);
  });
});
