// Real exported geometry and runtime visibility, without a GPU. This all-visible
// material-pass bound does not claim to measure frame time or shadow rendering.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { CharacterId } from "../src/core/types";
import { createInitialState } from "../src/core/initialState";
import { LEVEL } from "../src/level/layout";
import { GameScene, setBodyOpacity } from "../src/view/scene";
import { ModelLibrary } from "../src/view/models";
import { CHARACTER_MODEL_URLS, ENVIRONMENT_MODEL_URLS, ITEM_MODEL_URLS } from "../src/view/modelEntry";
import { applyOutfit } from "../src/view/humanModel";
import type { EnvironmentModels } from "../src/view/environmentModels";
import type { WorldEnvironment } from "../src/view/worldEnvironment";
import { NPC_SLOTS } from "../src/view/backgroundNpcs";
import { OVERVIEW, type Pose } from "../src/view/camera";
import { deriveView } from "../src/view/deriveView";
import { FacingTracker } from "../src/view/shoulder";

vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  return { ...actual, WebGLRenderer: class {
    domElement = {};
    setPixelRatio() {}
    render() {}
  } };
});
afterEach(() => vi.unstubAllGlobals());

const LIMIT = 60_000;
const STEP = .5;
const EYE_HEIGHTS = [.45, 1, 1.8, 2.4] as const;
const CHARACTERS: readonly CharacterId[] = ["duck", "child", "adult"];
type Internals = {
  scene: THREE.Scene;
  chars: Record<CharacterId, THREE.Object3D>;
  rings: Record<CharacterId, THREE.Object3D>;
  environmentModels: EnvironmentModels;
  worldEnvironment: WorldEnvironment;
};
type Sample = { eye: [number, number, number]; overview: boolean; triangles: number };

// Cache geometry/pass costs only within one material state; visibility is read
// afresh at every camera position. No frustum/occlusion savings are assumed.
function triangleCounter(scene: THREE.Scene): () => number {
  const costs = new WeakMap<THREE.Object3D, number>();
  return () => {
    let total = 0;
    scene.traverseVisible(o => {
      let cost = costs.get(o);
      if (cost === undefined) {
        cost = 0;
        if (o instanceof THREE.Mesh) {
          const materials = Array.isArray(o.material) ? o.material : [o.material];
          // WebGLRenderer renders transparent DoubleSide in two passes unless
          // forceSinglePass is set. For multi-material meshes use the maximum.
          const passes = Math.max(1, ...materials.map(m =>
            m.transparent && m.side === THREE.DoubleSide && !m.forceSinglePass ? 2 : 1));
          cost = (o.geometry.index?.count ?? o.geometry.getAttribute("position").count) / 3 * passes;
          if (o instanceof THREE.InstancedMesh) cost *= o.count;
        } else if (o instanceof THREE.Sprite) cost = 2;
        costs.set(o, cost);
      }
      total += cost;
    });
    return total;
  };
}

function showPotentialOverlays(internal: Internals): void {
  internal.scene.traverse(o => { if (o instanceof THREE.Sprite) o.visible = true; });
  for (const ring of Object.values(internal.rings)) ring.visible = true;
}
function cameraPose(sample: Sample): Pose {
  const [x, y, z] = sample.eye;
  return sample.overview ? OVERVIEW : { eye: { x, y, z }, target: { x, y: Math.max(.1, y - .15), z: z - 1 } };
}

// Camera selection only affects background/washing geometry. Character outfits,
// towel attachments and fade masks add a camera-independent bound when every
// potential overlay is retained. Sweep the level and a denser washing region,
// then check every material/outfit combination at each height's maximum and
// the actual overview pose. Finite grids do not prove every continuous pose.
describe("connected scene geometry budget", () => {
  it("keeps the final GLB scene within 60k across camera LODs, outfits and fade/restore combinations", async () => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("document", { createElement: () => ({
      getContext: () => ({ measureText: () => ({ width: 100 }), fillRect() {}, fillText() {} }),
    }) });
    const manifest = JSON.parse(readFileSync(new URL("../assets/manifest.json", import.meta.url), "utf8"));
    expect(manifest.scene_limits.stage2_triangles_drawn).toBe(LIMIT);
    // Fail rather than silently count placeholder geometry if promotion regresses.
    for (const id of ["coin", "key", "hat"] as const) expect(ITEM_MODEL_URLS[id], id).toBeTruthy();
    for (const id of ["sento_environment", "soap", "towel", "bath_stool", "wash_basin",
      "bath_stool_lod_medium", "bath_stool_lod_far", "wash_basin_lod_medium", "wash_basin_lod_far",
      "npc_staff_lod_far", "npc_seated_lod_far", "npc_bath_standing_lod_far"] as const) {
      expect(ENVIRONMENT_MODEL_URLS[id], id).toBeTruthy();
    }
    const game = new GameScene({ appendChild() {} } as unknown as HTMLElement, LEVEL);
    // Only image decoding is stubbed. Real mesh data, transforms and materials
    // still flow through ModelLibrary and the actual scene placement adapters.
    const loader = new GLTFLoader().register(() => ({
      name: "geometry_budget_skip_image_decode", loadTexture: async () => new THREE.Texture(),
    }));
    const library = new ModelLibrary(loader);
    for (const [id, url] of Object.entries({ ...CHARACTER_MODEL_URLS, ...ITEM_MODEL_URLS, ...ENVIRONMENT_MODEL_URLS })) {
      const bytes = readFileSync(new URL(`../public/${url}`, import.meta.url));
      await library.parse(id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      expect(library.get(id), `GLB loaded for ${id}`).toBeTruthy();
    }
    game.useModels(library);
    const internal = game as unknown as Internals;
    const { scene } = internal;
    expect(internal.worldEnvironment.active).toBe(true);
    expect(scene.getObjectByName("environment_fallback")?.visible).toBe(false);
    expect(scene.children.filter(o => o.name === "soap")).toHaveLength(LEVEL.soaps.length);
    const world = scene.getObjectByName("sento_environment")!;
    const washing = ["bath_stool", "wash_basin"].flatMap(id => {
      const instances = scene.children.filter(o => o.name === id);
      expect(instances).toHaveLength(5);
      for (const instance of instances) expect(instance.children).toHaveLength(3);
      return instances;
    });
    const npcs = NPC_SLOTS.map(([suffix]) => {
      const pair = [world.getObjectByName(`npc_high_${suffix}`), world.getObjectByName(`npc_far_${suffix}`)];
      for (const model of pair) expect(model, `NPC ${suffix}`).toBeTruthy();
      return pair as [THREE.Object3D, THREE.Object3D];
    });
    for (const id of ["child", "adult"] as const) {
      expect(internal.chars[id].children.filter(o => o.name === "towel")).toHaveLength(1);
    }
    for (const id of ["coin", "key", "hat"]) expect(library.get(id)!.root.parent).not.toBeNull();
    const view = deriveView(createInitialState(LEVEL), LEVEL);
    game.positionCharacters(view, 0, new FacingTracker());
    game.render(view, cameraPose({ eye: [9, .45, .5], overview: false, triangles: 0 }), false);
    for (const id of ["child", "adult"] as const) expect(applyOutfit(library.get(id)!.root, "clothed")).toBe(true);
    for (const id of CHARACTERS) setBodyOpacity(internal.chars[id], 1);
    showPotentialOverlays(internal);
    const opaqueMaterials = new Map<THREE.Material, object>();
    const materialState = (m: THREE.Material) => ({ transparent: m.transparent, opacity: m.opacity,
      depthWrite: m.depthWrite, forceSinglePass: m.forceSinglePass, side: m.side });
    for (const root of Object.values(internal.chars)) root.traverse(o => {
      if (o instanceof THREE.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        opaqueMaterials.set(m, materialState(m));
      }
    });
    const seenWash = new Set<string>(), seenNpcs = new Set<string>();
    const applyCamera = (sample: Sample) => {
      const eye = new THREE.Vector3(...sample.eye);
      internal.worldEnvironment.setView(sample.overview, true);
      internal.environmentModels.updateDetail(eye, sample.overview);
      internal.worldEnvironment.updateDetail(eye);
      for (const instance of washing) {
        if (instance.children.filter(o => o.visible).length !== 1) throw new Error(`Overlapping/missing washing LOD at ${sample.eye}`);
        seenWash.add(`${instance.name}/${instance.userData.detailLevel}`);
      }
      for (const [i, pair] of npcs.entries()) {
        if (pair.filter(o => o.visible).length !== 1) throw new Error(`Overlapping/missing NPC LOD ${i} at ${sample.eye}`);
        seenNpcs.add(`${i}/${pair[0].visible ? "high" : "far"}`);
      }
    };
    const boxes = LEVEL.zones.map(z => z.box);
    const bounds = {
      minX: Math.floor(Math.min(...boxes.map(b => b.minX)) / STEP) * STEP,
      maxX: Math.ceil(Math.max(...boxes.map(b => b.maxX)) / STEP) * STEP,
      minZ: Math.floor(Math.min(...boxes.map(b => b.minZ)) / STEP) * STEP,
      maxZ: Math.ceil(Math.max(...boxes.map(b => b.maxZ)) / STEP) * STEP,
    };
    const baselineCount = triangleCounter(scene);
    const candidates: Sample[] = [];
    let gridSamples = 0;
    for (const y of EYE_HEIGHTS) {
      let highest: Sample | undefined;
      for (let x = bounds.minX; x <= bounds.maxX; x += STEP) for (let z = bounds.minZ; z <= bounds.maxZ; z += STEP) {
        const sample: Sample = { eye: [x, y, z], overview: false, triangles: 0 };
        applyCamera(sample);
        sample.triangles = baselineCount();
        gridSamples++;
        if (!highest || sample.triangles > highest.triangles) highest = sample;
      }
      expect(highest!.triangles, `grid maximum at ${highest!.eye}`).toBeLessThanOrEqual(LIMIT);
      candidates.push(highest!);
    }
    expect(gridSamples).toBe(((bounds.maxX - bounds.minX) / STEP + 1) * ((bounds.maxZ - bounds.minZ) / STEP + 1) * EYE_HEIGHTS.length);
    // The busiest region needs finer coverage than the whole-level .5 m grid:
    // wash/NPC LOD boundaries can intersect between its samples. Integer tenths
    // include both endpoints without cumulative floating-point step drift.
    const nearBounds = { minX: 7, maxX: 12, minZ: -1, maxZ: 3, minY: .3, maxY: 2.4, step: .1 };
    const nearMaxima: Sample[] = [];
    let nearSamples = 0;
    for (let iy = 3; iy <= 24; iy++) {
      let highest: Sample | undefined;
      for (let ix = 70; ix <= 120; ix++) for (let iz = -10; iz <= 30; iz++) {
        const sample: Sample = { eye: [ix / 10, iy / 10, iz / 10], overview: false, triangles: 0 };
        applyCamera(sample);
        sample.triangles = baselineCount();
        nearSamples++;
        if (!highest || sample.triangles > highest.triangles) highest = sample;
      }
      expect(highest!.triangles, `dense washing-region maximum at ${highest!.eye}`).toBeLessThanOrEqual(LIMIT);
      nearMaxima.push(highest!);
      const existing = candidates.findIndex(sample => sample.eye[1] === iy / 10);
      if (existing < 0) candidates.push(highest!);
      else if (highest!.triangles > candidates[existing]!.triangles) candidates[existing] = highest!;
    }
    expect(nearSamples).toBe(51 * 41 * 22);
    for (const id of ["bath_stool", "wash_basin"]) for (const level of ["high", "medium", "far"]) expect(seenWash.has(`${id}/${level}`)).toBe(true);
    for (let i = 0; i < npcs.length; i++) for (const level of ["high", "far"]) expect(seenNpcs.has(`${i}/${level}`)).toBe(true);
    const overview: Sample = { eye: [OVERVIEW.eye.x, OVERVIEW.eye.y, OVERVIEW.eye.z], overview: true, triangles: 0 };
    applyCamera(overview);
    overview.triangles = baselineCount();
    expect(overview.triangles).toBeLessThanOrEqual(LIMIT);
    candidates.push(overview);
    // Prove that the optimized adapter sweep matches the full render path at
    // every tested extreme. Restore the same all-visible/opaque bound afterward.
    for (const sample of candidates) {
      game.render(view, cameraPose(sample), sample.overview);
      for (const id of CHARACTERS) setBodyOpacity(internal.chars[id], 1);
      showPotentialOverlays(internal);
      expect(triangleCounter(scene)(), `full-render parity at ${sample.eye}`).toBe(sample.triangles);
    }
    const totals: Record<string, { opaque: number; fade: number; restore: number }> = {};
    for (const child of ["clothed", "unclothed"] as const) for (const adult of ["clothed", "unclothed"] as const) {
      applyOutfit(library.get("child")!.root, child);
      applyOutfit(library.get("adult")!.root, adult);
      const maximum = (count: () => number) => Math.max(...candidates.map(sample => { applyCamera(sample); return count(); }));
      const summary = { opaque: maximum(triangleCounter(scene)), fade: 0, restore: 0 };
      expect(summary.opaque, `${child}/${adult}/opaque`).toBeLessThanOrEqual(LIMIT);
      // Include each subset, including all three faded (more conservative than
      // actual play). Fading chars also covers their two attached towel clones.
      for (let mask = 0; mask < 1 << CHARACTERS.length; mask++) {
        CHARACTERS.forEach((id, i) => setBodyOpacity(internal.chars[id], mask & (1 << i) ? .3 : 1));
        const faded = maximum(triangleCounter(scene));
        expect(faded, `${child}/${adult}/fade-${mask}`).toBeLessThanOrEqual(LIMIT);
        summary.fade = Math.max(summary.fade, faded);
        for (const id of CHARACTERS) setBodyOpacity(internal.chars[id], 1);
        for (const [material, original] of opaqueMaterials) expect(materialState(material)).toEqual(original);
        const restored = maximum(triangleCounter(scene));
        expect(restored, `${child}/${adult}/restore-${mask}`).toBeLessThanOrEqual(LIMIT);
        summary.restore = Math.max(summary.restore, restored);
      }
      expect(summary.restore).toBe(summary.opaque);
      totals[`${child}/${adult}`] = summary;
    }
    console.info("All-visible submitted triangles (material passes; no frustum culling):",
      JSON.stringify({ gridSamples, bounds, nearSamples, nearBounds, nearMaxima, candidates, totals }));
  }, 30_000);
});
