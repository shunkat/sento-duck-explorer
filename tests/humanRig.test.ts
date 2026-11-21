// Actual exported skinning and GameScene attachments, without a GPU. The
// optional source directory lets the asset pipeline test candidates before
// promotion; ordinary CI always checks the models shipped in public/models.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { bindHumanMotion, HUMAN_WALK_BONES } from "../src/view/humanMotion";
import { BODY_HEIGHT, deriveView } from "../src/view/deriveView";
import { createInitialState } from "../src/core/initialState";
import { LEVEL } from "../src/level/layout";
import { GameScene } from "../src/view/scene";
import { FacingTracker } from "../src/view/shoulder";
import { OVERVIEW } from "../src/view/camera";
import { TOWEL_DEPTH, TOWEL_THICKNESS } from "../src/view/humanModel";
import type { CharacterId, HumanId, ItemId } from "../src/core/types";

vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  return { ...actual, WebGLRenderer: class { domElement = {}; setPixelRatio() {} render() {} } };
});
afterEach(() => vi.unstubAllGlobals());

async function load(id: HumanId): Promise<THREE.Object3D> {
  const bytes = readFileSync(resolve(process.env.HUMAN_RIG_SOURCE_DIR ?? "public/models", `${id}.glb`));
  const loader = new GLTFLoader().register(() => ({ name: "rig_skip_image_decode", loadTexture: async () => new THREE.Texture() }));
  return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, "")).scene;
}
const world = (node: THREE.Object3D) => node.getWorldPosition(new THREE.Vector3());
const point = (mesh: THREE.SkinnedMesh, index: number) => mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
const meshes = (root: THREE.Object3D) => ["outfit_clothed", "outfit_bath"].map(name => root.getObjectByName(name) as THREE.SkinnedMesh);

describe("shipped human rigs", () => {
  it.each(["child", "adult"] as const)("%s has two bounded skins on the same named skeleton and a bone-parented hand", async id => {
    const root = await load(id);
    const outfits = meshes(root);
    for (const mesh of outfits) {
      expect(mesh).toBeInstanceOf(THREE.SkinnedMesh);
      expect(mesh.skeleton.bones.length).toBeLessThanOrEqual(40);
      for (const name of HUMAN_WALK_BONES) expect(mesh.skeleton.bones.map(b => b.name)).toContain(name);
      const weights = mesh.geometry.getAttribute("skinWeight");
      expect(weights.itemSize).toBe(4);
      for (let i = 0; i < weights.count; i++) {
        expect(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i)).toBeCloseTo(1, 5);
      }
    }
    expect(outfits[0]!.skeleton.bones).toEqual(outfits[1]!.skeleton.bones);
    let parent = root.getObjectByName("socket_hand_r")!.parent;
    while (parent && parent.name !== "forearm_r") parent = parent.parent;
    expect(parent?.name).toBe("forearm_r");
    expect(bindHumanMotion(root, BODY_HEIGHT[id])).toBeTruthy();
  });

  it.each([
    ["child", 2.5], ["child", 4.5], ["adult", 2.5], ["adult", 4.5],
  ] as const)("%s at %s m/s deforms both outfits through grounded strides without warping its face", async (id, speed) => {
    const root = await load(id);
    const height = BODY_HEIGHT[id];
    const motion = bindHumanMotion(root, height)!;
    root.updateMatrixWorld(true);
    const samples = meshes(root).map(mesh => {
      const rest = Array.from({ length: mesh.geometry.getAttribute("position").count }, (_, i) => point(mesh, i));
      return { mesh, rest, soles: rest.flatMap((p, i) => p.y < .12 * height ? [i] : []),
        face: rest.flatMap((p, i) => p.y > .8 * height ? [i] : []) };
    });
    const hand = root.getObjectByName("socket_hand_r")!;
    const handRest = root.worldToLocal(world(hand));
    motion.update({ position: { x: 0, z: 0 }, time: 0 });
    let maxFootMotion = 0;
    let maxHandMotion = 0;
    // Actual walk/run speeds over several cycles, including full knee lift.
    for (let frame = 1; frame <= 180; frame++) {
      motion.update({ position: { x: 0, z: speed * frame / 60 }, time: frame / 60 });
      root.updateMatrixWorld(true);
      maxHandMotion = Math.max(maxHandMotion, root.worldToLocal(world(hand)).distanceTo(handRest));
      for (const { mesh, rest, soles, face } of samples) {
        const solePoints = soles.map(i => point(mesh, i));
        const bottom = Math.min(...solePoints.map(p => p.y));
        expect(bottom, `${id} ${mesh.name} floor at frame ${frame}`).toBeGreaterThan(-.004);
        expect(bottom, `${id} ${mesh.name} stance at frame ${frame}`).toBeLessThan(.006);
        for (const i of soles) maxFootMotion = Math.max(maxFootMotion, root.worldToLocal(point(mesh, i)).distanceTo(rest[i]!));
        for (const i of face) expect(root.worldToLocal(point(mesh, i)).distanceTo(rest[i]!)).toBeLessThan(1e-5);
      }
    }
    expect(maxFootMotion).toBeGreaterThan(.08);
    expect(maxHandMotion).toBeGreaterThan(.035);
    motion.update({ position: { x: 0, z: speed * 181 / 60 }, time: 181 / 60, holdRight: true, holdLeft: id === "adult" });
    root.updateMatrixWorld(true);
    expect(root.worldToLocal(world(hand)).distanceTo(handRest)).toBeLessThan(1e-6);
  });

  it.each(["child", "adult"] as const)("%s keeps head/held towels, name label, carried Duck and held items attached while walking", async id => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 100 }), fillRect() {}, fillText() {} }) }) });
    const scene = new GameScene({ appendChild() {} } as unknown as HTMLElement, LEVEL);
    const internals = scene as unknown as {
      chars: Record<CharacterId, THREE.Group>; towels: Record<HumanId, THREE.Object3D>; items: Record<ItemId, THREE.Object3D>;
    };
    const root = await load(id); scene.setCharacterModel(id, root);
    const view = deriveView(createInitialState(LEVEL), LEVEL);
    const character = view.characters[id]; character.towel = "head";
    const facing = new FacingTracker();
    const start = character.pos.z;
    for (let i = 0; i <= 90; i++) {
      character.pos.z = start + i * .02;
      scene.positionCharacters(view, i / 60, facing);
    }
    const towel = internals.towels[id];
    expect(world(towel).y).toBeCloseTo(world(root).y + BODY_HEIGHT[id] + TOWEL_THICKNESS / 2, 3);
    const label = internals.chars[id].children.find(o => o instanceof THREE.Sprite)!;
    expect(world(label).distanceTo(world(root.getObjectByName("socket_label")!))).toBeLessThan(1e-6);
    character.towel = "held";
    view.characters.duck.carried = true; view.characters.duck.carrier = id;
    view.items.coin.owner = { kind: "character", id };
    character.pos.z += .02;
    scene.positionCharacters(view, 91 / 60, facing);
    scene.render(view, OVERVIEW, true);
    const hand = world(root.getObjectByName("socket_hand_r")!);
    const towelTop = world(towel); towelTop.y += TOWEL_DEPTH / 2;
    expect(towelTop.distanceTo(hand)).toBeLessThan(1e-6);
    const duck = world(internals.chars.duck);
    const support = world(root.getObjectByName(id === "adult" ? "socket_carry" : "socket_hand_r")!);
    if (id === "adult") support.y += .15;
    expect(duck.distanceTo(support)).toBeLessThan(1e-6);
    expect(world(internals.items.coin).distanceTo(hand)).toBeLessThan(1e-6);
  });
});
