// Count the real scene graph and exported geometry without a GPU. This is a
// conservative all-visible geometry/pass check, not a frame-time/draw-call benchmark.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { LEVEL } from "../src/level/layout";
import { GameScene, setBodyOpacity } from "../src/view/scene";
import { ModelLibrary } from "../src/view/models";
import { CHARACTER_MODEL_URLS, ENVIRONMENT_MODEL_URLS, ITEM_MODEL_URLS } from "../src/view/modelEntry";
import { applyOutfit } from "../src/view/humanModel";

vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  return { ...actual, WebGLRenderer: class {
    domElement = {};
    setPixelRatio() {}
  } };
});

afterEach(() => vi.unstubAllGlobals());

describe("connected scene geometry budget", () => {
  it("keeps all five washing stations and every outfit within 60k, including temporary fade passes", async () => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("document", { createElement: () => ({
      getContext: () => ({ measureText: () => ({ width: 100 }), fillRect() {}, fillText() {} }),
    }) });
    const game = new GameScene({ appendChild() {} } as unknown as HTMLElement, LEVEL);
    // Only image decoding is stubbed. Original mesh data, transforms, materials,
    // visibility, source selection and the actual placement code are retained.
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
    const scene = (game as unknown as { scene: THREE.Scene }).scene;
    for (const id of ["bath_stool", "wash_basin"]) {
      expect(scene.children.filter(o => o.name === id)).toHaveLength(5);
    }
    const manifest = JSON.parse(readFileSync(new URL("../assets/manifest.json", import.meta.url), "utf8"));
    const totals: Record<string, number> = {};
    for (const child of ["clothed", "unclothed"] as const) for (const adult of ["clothed", "unclothed"] as const) {
      applyOutfit(library.get("child")!.root, child);
      applyOutfit(library.get("adult")!.root, adult);
      for (const [phase, opacity] of [["opaque", 1], ["fade", 0.3], ["restore", 1]] as const) {
        // Fading all three is a conservative bound for an actual camera,
        // which keeps the active character opaque.
        for (const id of ["duck", "child", "adult"]) setBodyOpacity(library.get(id)!.root, opacity);
        let triangles = 0;
        scene.traverseVisible(o => {
          if (o instanceof THREE.Mesh) {
            const materials = Array.isArray(o.material) ? o.material : [o.material];
            // Mirrors WebGLRenderer's transparent DoubleSide pass condition.
            // A multi-material mesh uses its worst multiplier conservatively.
            const passes = Math.max(...materials.map(m => m.transparent && m.side === THREE.DoubleSide && !m.forceSinglePass ? 2 : 1));
            triangles += (o.geometry.index?.count ?? o.geometry.getAttribute("position").count) / 3 * passes;
          } else if (o instanceof THREE.Sprite) triangles += 2;
        });
        totals[`${child}/${adult}/${phase}`] = triangles;
        expect(triangles).toBeLessThanOrEqual(manifest.scene_limits.stage2_triangles_drawn);
      }
    }
    console.info("All-visible scene submitted triangles (including material passes, no frustum culling):", totals);
  });
});
