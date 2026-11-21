// ModelAdapter tests. No WebGL: the fixture is parsed in memory.
// tests/fixtures/test_box_duck.glb is a test fixture, not a final asset.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import fc from "fast-check";
import { GameScene } from "../src/view/scene";
import { EnvironmentModels } from "../src/view/environmentModels";
import { type GltfSource, type ManifestLimits, ModelLibrary, SOCKET_NAMES, checkBounds, copySocketPose, measureModel, placeHatOnSocket } from "../src/view/models";

function fixtureBytes(): ArrayBuffer {
  const b = readFileSync(new URL("./fixtures/test_box_duck.glb", import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

const manifest = JSON.parse(readFileSync(new URL("../assets/manifest.json", import.meta.url), "utf8"));

// Exercise the real adapter and placement methods with Three.js groups, without
// a renderer. This catches integration regressions in partial/failed loads.
function sceneHarness() {
  const scene = Object.create(GameScene.prototype) as GameScene;
  const chars = { duck: new THREE.Group(), child: new THREE.Group(), adult: new THREE.Group() };
  const primitives = { duck: [new THREE.Object3D()], child: [new THREE.Object3D()], adult: [new THREE.Object3D()] };
  for (const id of ["duck", "child", "adult"] as const) chars[id].add(...primitives[id]);
  const items = { coin: new THREE.Group(), key: new THREE.Group(), hat: new THREE.Group() };
  const hatPrimitive = new THREE.Mesh(new THREE.ConeGeometry(), new THREE.MeshBasicMaterial());
  items.hat.add(hatPrimitive);
  Object.assign(scene, { chars, primitives, items, models: {}, itemModels: {}, fixtureWater: [],
    environmentModels: new EnvironmentModels(new THREE.Group()),
    humanBody: {}, towels: {}, clothing: { child: "unclothed", adult: "unclothed" } });
  return { scene, chars, primitives, items, hatPrimitive };
}

describe("ModelLibrary integration with the shoulder-view scene", () => {
  it("keeps a failed human primitive while installing Duck and hat once", async () => {
    const h = sceneHarness();
    const lib = new ModelLibrary();
    await lib.parse("duck", fixtureBytes());
    await lib.parse("hat", fixtureBytes());
    await lib.parse("child", fixtureBytes()); // lacks the human outfit contract
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      h.scene.useModels(lib);
      h.scene.useModels(lib);
      expect(h.primitives.duck[0]!.visible).toBe(false);
      expect(lib.get("duck")!.root.parent).toBe(h.chars.duck);
      expect(lib.get("duck")!.root.position.y).toBeCloseTo(-0.15);
      expect(h.chars.duck.children.filter((o) => o === lib.get("duck")!.root)).toHaveLength(1);
      expect(h.hatPrimitive.visible).toBe(false);
      expect(lib.get("hat")!.root.parent).toBe(h.items.hat);
      expect(h.primitives.child[0]!.visible).toBe(true);
      expect(lib.get("child")!.root.parent).toBeNull();
      expect(h.primitives.adult[0]!.visible).toBe(true);
      expect(warn).toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });

  it("uses the human contract and current outfit when a later model arrives", async () => {
    const h = sceneHarness();
    const root = new THREE.Group();
    for (const name of ["outfit_clothed", "outfit_bath", "socket_hand_r", "socket_label", "socket_carry"]) {
      const node = new THREE.Object3D();
      node.name = name;
      if (name === "socket_carry") node.position.y = 0.9;
      root.add(node);
    }
    const lib = new ModelLibrary({ loadAsync: async () => ({ scene: root }), parseAsync: async () => ({ scene: root }) });
    h.scene.useModels(lib);
    expect(h.primitives.adult[0]!.visible).toBe(true);
    await lib.load("adult", "fixture-adult");
    h.scene.useModels(lib);
    expect(root.parent).toBe(h.chars.adult);
    expect(root.position.y).toBeCloseTo(-0.85);
    expect(root.getObjectByName("outfit_bath")!.visible).toBe(true);
    expect(root.getObjectByName("outfit_clothed")!.visible).toBe(false);
    expect(h.primitives.adult[0]!.visible).toBe(false);
  });
});

describe("ModelLibrary", () => {
  it("returns null for an id that was never loaded", () => {
    expect(new ModelLibrary().get("duck")).toBeNull();
  });

  it("parses the fixture and finds every socket", async () => {
    const lib = new ModelLibrary();
    await lib.parse("fixture", fixtureBytes());
    const m = lib.get("fixture");
    expect(m).not.toBeNull();
    for (const name of SOCKET_NAMES) expect(m!.sockets[name]).toBeDefined();
    expect(m!.sockets.socket_carry!.position.y).toBeCloseTo(0.9);
    expect(m!.sockets.socket_hat!.position.toArray()).toEqual([0, expect.closeTo(0.28), expect.closeTo(0.03)]);
  });

  it("falls back (null and a warning) when loading fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing: GltfSource = {
      loadAsync: () => Promise.reject(new Error("404")),
      parseAsync: () => Promise.reject(new Error("bad")),
    };
    const lib = new ModelLibrary(failing);
    await lib.load("duck", "/models/duck.glb");
    await lib.parse("hat", new ArrayBuffer(4));
    expect(lib.get("duck")).toBeNull();
    expect(lib.get("hat")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("falls back on invalid GLB bytes with the real loader", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const lib = new ModelLibrary();
    await lib.parse("broken", new TextEncoder().encode("not a glb").buffer as ArrayBuffer);
    expect(lib.get("broken")).toBeNull();
    warn.mockRestore();
  });
});

describe("manifest bounds check", () => {
  it("measures the fixture and accepts it against the duck limits", async () => {
    const lib = new ModelLibrary();
    await lib.parse("fixture", fixtureBytes());
    const measured = measureModel(lib.get("fixture")!.root);
    expect(measured.height).toBeCloseTo(0.3);
    expect(measured.maxWidth).toBeCloseTo(0.3);
    expect(checkBounds(measured, manifest.assets.duck.limits)).toEqual([]);
  });

  it("reports violations", () => {
    const limits = { height: [0.28, 0.32] as [number, number], max_width: 0.36 };
    expect(checkBounds({ height: 0.4, maxWidth: 0.2 }, limits)).toHaveLength(1);
    expect(checkBounds({ height: 0.2, maxWidth: 0.5 }, limits)).toHaveLength(2);
  });

  it("keeps every measured manifest entry within its limits", () => {
    const assets = Object.entries<{ status: string; limits: ManifestLimits; measured: { height: number; max_width?: number } | null }>(manifest.assets);
    for (const [id, a] of assets) {
      if (!a.measured) continue;
      // An entry without max_width is checked on height only.
      const m = { height: a.measured.height, maxWidth: a.measured.max_width ?? 0 };
      expect(checkBounds(m, a.limits), id).toEqual([]);
    }
  });

  for (const id of ["duck", "hat_sauna_duck"]) {
    it(`parses public/models/${id}.glb and matches the manifest height`, async () => {
      const b = readFileSync(new URL(`../public/models/${id}.glb`, import.meta.url));
      // Preserve actual geometry while avoiding browser-only image decoding.
      const loader = new GLTFLoader().register(() => ({
        name: "model_bounds_skip_image_decode", loadTexture: async () => new THREE.Texture(),
      }));
      const lib = new ModelLibrary(loader);
      await lib.parse(id, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
      const measured = measureModel(lib.get(id)!.root);
      expect(Math.abs(measured.height - manifest.assets[id].measured.height)).toBeLessThan(1e-3);
      if (id === "duck") {
        expect(lib.get(id)!.sockets.socket_hat).toBeDefined();
        expect(lib.get(id)!.sockets.socket_label).toBeDefined();
      }
    });
  }
});

describe("copySocketPose", () => {
  async function setup() {
    const lib = new ModelLibrary();
    await lib.parse("fixture", fixtureBytes());
    const root = lib.get("fixture")!.root;
    const parent = new THREE.Group();
    parent.add(root);
    return { parent, socket: lib.get("fixture")!.sockets.socket_hat! };
  }

  function check(parent: THREE.Group, socket: THREE.Object3D, yaw: number) {
    parent.rotation.y = yaw;
    parent.position.set(1, 0.5, -2);
    parent.updateMatrixWorld(true);
    const hat = new THREE.Object3D();
    copySocketPose(hat, socket, new THREE.Vector3());
    hat.updateMatrixWorld(true);
    expect(hat.getWorldPosition(new THREE.Vector3()).distanceTo(socket.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-6);
    const hatFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(hat.quaternion);
    const sockFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(socket.getWorldQuaternion(new THREE.Quaternion()));
    expect(hatFwd.distanceTo(sockFwd)).toBeLessThan(1e-6);
    expect(hatFwd.x).toBeCloseTo(Math.sin(yaw), 6);
    expect(hatFwd.z).toBeCloseTo(Math.cos(yaw), 6);
  }

  it("follows the parent's yaw for several angles", async () => {
    const { parent, socket } = await setup();
    for (const yaw of [0, Math.PI / 2, Math.PI, -2.1, 3]) check(parent, socket, yaw);
  });

  it("follows the parent's yaw for any angle", async () => {
    const { parent, socket } = await setup();
    fc.assert(fc.property(fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), (yaw) => check(parent, socket, yaw)));
  });

  it("placeHatOnSocket copies the full socket pose while attached", async () => {
    const { parent, socket } = await setup();
    parent.rotation.y = 1.2;
    parent.position.set(1, 0.5, -2);
    parent.updateMatrixWorld(true);
    const hat = new THREE.Object3D();
    expect(placeHatOnSocket(hat, true, socket, new THREE.Vector3())).toBe(true);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(hat.quaternion);
    expect(fwd.x).toBeCloseTo(Math.sin(1.2), 6);
    expect(fwd.z).toBeCloseTo(Math.cos(1.2), 6);
    expect(hat.position.distanceTo(socket.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-6);
  });

  it("placeHatOnSocket resets rotation and keeps position when detached or without a socket", async () => {
    const { socket } = await setup();
    for (const [attached, sock] of [[false, socket], [true, null]] as const) {
      const hat = new THREE.Object3D();
      hat.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1);
      hat.position.set(3, 4, 5);
      expect(placeHatOnSocket(hat, attached, sock, new THREE.Vector3())).toBe(false);
      expect(hat.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-9);
      expect(hat.position.toArray()).toEqual([3, 4, 5]);
    }
  });
});
