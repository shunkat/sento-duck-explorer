// ModelAdapter tests. No WebGL: the fixture is parsed in memory.
// tests/fixtures/test_box_duck.glb is a test fixture, not a final asset.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import fc from "fast-check";
import { type GltfSource, type ManifestLimits, ModelLibrary, SOCKET_NAMES, checkBounds, copySocketPose, measureModel } from "../src/view/models";

function fixtureBytes(): ArrayBuffer {
  const b = readFileSync(new URL("./fixtures/test_box_duck.glb", import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

const manifest = JSON.parse(readFileSync(new URL("../assets/manifest.json", import.meta.url), "utf8"));

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

  it("keeps measured manifest data within limits and planned assets unmeasured", () => {
    const assets = Object.entries<{ status: string; limits: ManifestLimits; measured: { height: number; max_width?: number } | null }>(manifest.assets);
    const measuredIds = assets.filter(([, a]) => a.measured !== null).map(([id]) => id);
    expect(measuredIds).toEqual(expect.arrayContaining(["duck", "hat_sauna_duck", "child", "adult"]));
    for (const [id, a] of assets) {
      if (a.status === "planned") {
        expect(a.measured, id).toBeNull();
      } else if (a.measured) {
        const m = { height: a.measured.height, maxWidth: a.measured.max_width ?? 0 };
        expect(checkBounds(m, a.limits), id).toEqual([]);
      }
    }
  });

  for (const id of ["duck", "hat_sauna_duck"]) {
    it(`parses public/models/${id}.glb and matches the manifest height`, async () => {
      const b = readFileSync(new URL(`../public/models/${id}.glb`, import.meta.url));
      const lib = new ModelLibrary();
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
});
