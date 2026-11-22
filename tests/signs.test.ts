import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { LEVEL } from "../src/level/layout";
import { createInitialState } from "../src/core/initialState";
import { deriveView } from "../src/view/deriveView";
import { OVERVIEW } from "../src/view/camera";
import { GameScene } from "../src/view/scene";
import { createSentoSigns, sentoSigns } from "../src/view/signs";
import { ENVIRONMENT_MODEL_URLS } from "../src/view/modelEntry";

vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  return { ...actual, WebGLRenderer: class { domElement = {}; setPixelRatio() {} render() {} } };
});
beforeEach(() => {
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("document", { createElement: () => ({
    getContext: () => ({ fillRect() {}, fillText() {} }),
  }) });
});
afterEach(() => vi.unstubAllGlobals());

describe("world notices replace floating descriptions", () => {
  it("has fixed, opaque, depth-tested printed boards and no floating scene labels", () => {
    const game = new GameScene({ appendChild() {} } as unknown as HTMLElement, LEVEL);
    const { scene } = game as unknown as { scene: THREE.Scene };
    const sprites: THREE.Sprite[] = [];
    scene.traverse(o => { if (o instanceof THREE.Sprite) sprites.push(o); });
    expect(sprites).toEqual([]);
    const signs = scene.getObjectByName("sento_wall_notices")!;
    expect(signs.children).toHaveLength(sentoSigns(LEVEL).length);
    for (const board of signs.children) {
      const face = board.getObjectByName("printed_notice") as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
      expect(face.isMesh).toBe(true);
      expect(face.material).toMatchObject({ depthTest: true, depthWrite: true, transparent: false, side: THREE.FrontSide });
      expect(face.renderOrder).toBe(0);
    }
    signs.updateMatrixWorld(true);
    const before = signs.children.map(o => o.matrix.clone());
    const view = deriveView(createInitialState(LEVEL), LEVEL);
    game.render(view, OVERVIEW, true);
    expect(signs.visible).toBe(false); // supporting upper walls are cut away
    game.render(view, { eye: { x: 3, y: 1.8, z: 2 }, target: { x: 2, y: 1.4, z: 0 } }, false);
    expect(signs.visible).toBe(true);
    signs.updateMatrixWorld(true);
    signs.children.forEach((o, i) => expect(o.matrix.equals(before[i]!)).toBe(true));
  });

  it("places drying notices on the safe approach sides and uses facility wording, without game keys", () => {
    const signs = sentoSigns(LEVEL);
    const changing = LEVEL.doors.find(d => d.id === "bath_changing")!.box;
    const sauna = LEVEL.doors.find(d => d.id === "bath_sauna")!.box;
    expect(signs.find(s => s.id === "dry-before-changing")!.position.z).toBeGreaterThan(changing.maxZ);
    expect(signs.find(s => s.id === "dry-before-sauna")!.position.x).toBeLessThan(sauna.minX);
    expect(signs.map(s => s.id)).toEqual(expect.arrayContaining([
      "dry-before-changing", "dry-before-sauna", "sauna-manners", "walk-in-bath", "towel-out-of-water", "dress-before-reception",
    ]));
    for (const sign of signs) expect([sign.title, ...sign.lines].join(" ")).not.toMatch(/\b[EQRVF]\b|キー|ゲームオーバー|操作/);
  });

  it("sits just in front of real exported wall surfaces and leaves its printed faces unobstructed", async () => {
    const loader = new GLTFLoader().register(() => ({ name: "skip_image_decode", loadTexture: async () => new THREE.Texture() }));
    const bytes = readFileSync(new URL(`../public/${ENVIRONMENT_MODEL_URLS.sento_environment}`, import.meta.url));
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, "");
    gltf.scene.updateMatrixWorld(true);
    const signs = createSentoSigns(LEVEL);
    signs.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    for (const board of signs.children) {
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(board.quaternion);
      // Sample both the middle and corners: a center-only check can miss a poster in a doorway.
      const spec = sentoSigns(LEVEL).find(s => `sign_${s.id}` === board.name)!;
      for (const dx of [-.4, 0, .4]) for (const dy of [-.4, 0, .4]) {
        const surface = board.localToWorld(new THREE.Vector3(spec.width * dx, spec.height * dy, .013));
        ray.set(surface.clone().addScaledVector(normal, .25), normal.clone().negate());
        ray.far = .5;
        const hit = ray.intersectObject(gltf.scene, true)[0];
        expect(hit, `${board.name} has wall support at ${dx}, ${dy}`).toBeDefined();
        expect(hit!.distance, `${board.name} is in front of its wall`).toBeGreaterThan(.25);
        expect(hit!.distance, `${board.name} is flush to its wall`).toBeLessThan(.32);
      }
    }
  });
});
