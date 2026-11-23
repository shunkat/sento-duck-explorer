import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { LEVEL } from "../src/level/layout";
import { GameScene } from "../src/view/scene";
import * as batching from "../src/view/staticMeshes";

vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  return { ...actual, WebGLRenderer: class { domElement = {}; setPixelRatio() {} } };
});

beforeEach(() => {
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("document", { createElement: () => {
    // Compare the actual texture drawing commands between the two constructed
    // scenes, including style changes. Fresh CanvasTextures have different UUIDs.
    const drawCommands: unknown[] = [];
    const context = {
      fillStyle: "", font: "", textAlign: "", textBaseline: "",
      measureText: () => ({ width: 100 }),
      fillRect(...args: number[]) { drawCommands.push(["rect", this.fillStyle, ...args]); },
      fillText(...args: unknown[]) {
        drawCommands.push(["text", this.fillStyle, this.font, this.textAlign, this.textBaseline, ...args]);
      },
    };
    return { getContext: () => context, drawCommands };
  } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** Stable texture content and sampling settings, rather than allocation UUIDs. */
function materialContent(source: THREE.Material): unknown {
  const meta: THREE.JSONMeta = { geometries: {}, materials: {}, textures: {}, images: {},
    shapes: {}, skeletons: {}, animations: {}, nodes: {} };
  const textures = new Map<string, unknown>();
  for (const value of Object.values(source)) {
    if (!(value instanceof THREE.Texture)) continue;
    const image = value.image as { width: number; height: number; drawCommands?: unknown[]; data?: Uint8Array };
    // Compare both sign drawing commands and the new authored contact/window
    // pixels. Unknown texture types still fail rather than being omitted.
    const drawing = value instanceof THREE.DataTexture ? Array.from(image.data!) : image.drawCommands;
    expect(drawing).toBeDefined();
    const content = { width: image.width, height: image.height, drawing };
    // Supply the recorded image content to Source.toJSON instead of asking a
    // canvas stub to encode pixels. Keep every other texture sampling property.
    meta.images[value.source.uuid] = { uuid: value.source.uuid, url: JSON.stringify(content) };
    const { uuid: _uuid, image: _image, metadata: _metadata, ...settings } = value.toJSON(meta);
    textures.set(value.uuid, { ...settings, image: content });
  }
  const { uuid: _uuid, metadata: _metadata, name: _name, ...material } = source.toJSON(meta);
  return Object.fromEntries(Object.entries(material).map(([key, value]) =>
    [key, typeof value === "string" && textures.has(value) ? textures.get(value) : value]));
}

/** Oriented triangles, world normals and UVs keyed by their actual material.
 * This compares surfaces, not just bounds/counts: dropped or moved faces fail. */
function surfaces(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const records: { key: string; values: number[] }[] = [];
  root.traverseVisible(object => {
    if (!(object instanceof THREE.Mesh)) return;
    if (Array.isArray(object.material)) throw new Error("Unexpected multi-material fixture");
    const material = materialContent(object.material);
    const g = object.geometry;
    const position = g.getAttribute("position"), normal = g.getAttribute("normal"), uv = g.getAttribute("uv");
    const count = g.index?.count ?? position.count;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld);
    for (let index = 0; index < count; index += 3) {
      const values: number[] = [];
      for (let corner = 0; corner < 3; corner++) {
        const vertex = g.index?.getX(index + corner) ?? index + corner;
        const p = new THREE.Vector3().fromBufferAttribute(position, vertex).applyMatrix4(object.matrixWorld);
        const n = new THREE.Vector3().fromBufferAttribute(normal, vertex).applyNormalMatrix(normalMatrix);
        values.push(...p.toArray(), ...n.toArray(), uv.getX(vertex), uv.getY(vertex));
      }
      records.push({ key: JSON.stringify(material) + values.map(value => value.toFixed(4)).join(","), values });
    }
  });
  return records.sort((a, b) => a.key.localeCompare(b.key));
}

function expectSameSurfaces(before: THREE.Object3D, after: THREE.Object3D) {
  const a = surfaces(before), b = surfaces(after);
  expect(b.length).toBe(a.length);
  let maxError = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.key !== b[i]!.key) throw new Error(`Surface/material mismatch at sorted triangle ${i}`);
    for (let j = 0; j < a[i]!.values.length; j++) {
      maxError = Math.max(maxError, Math.abs(a[i]!.values[j]! - b[i]!.values[j]!));
    }
  }
  // Baking into Float32 geometry introduces only its coordinate precision.
  expect(maxError).toBeLessThan(3e-6);
}

function meshCount(root: THREE.Object3D): number {
  let count = 0;
  root.traverseVisible(object => { if (object instanceof THREE.Mesh) count++; });
  return count;
}

describe("opaque surface batching", () => {
  it("preserves transformed surfaces and separates differing or transparent materials", () => {
    const meshes = [0, 1, 2, 3].map(i => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(.3, .7, .4), new THREE.MeshStandardMaterial({
        color: 0x55aa88, roughness: i === 2 ? .3 : 1, transparent: i === 3, opacity: i === 3 ? .7 : 1,
      }));
      mesh.position.set(i * 2 + .4, .9, i - .8);
      mesh.rotation.y = .35;
      mesh.scale.set(1.2, .8, 1.4);
      return mesh;
    });
    const originalPositions = meshes.map(mesh => [...mesh.geometry.getAttribute("position").array]);
    const result = batching.batchOpaqueMeshes(meshes, new THREE.Vector3(.2, .4, .6));
    expect(result).toHaveLength(3);
    expect(result).toContain(meshes[2]);
    expect(result).toContain(meshes[3]);
    meshes.forEach((mesh, i) => expect([...mesh.geometry.getAttribute("position").array]).toEqual(originalPositions[i]));
    const before = new THREE.Group(), after = new THREE.Group();
    before.add(...meshes.map(mesh => mesh.clone())); after.add(...result);
    expectSameSurfaces(before, after);
  });

  it("saves at least 48 scene meshes without changing surfaces in either camera mode", () => {
    // Construct the real level once without batching and once with it. This
    // catches wrong ownership (roofs, replacement slots, tall fixtures, etc.)
    // without maintaining a second implementation of the level's geometry.
    const passthrough = vi.spyOn(batching, "batchOpaqueMeshes").mockImplementation(meshes => [...meshes]);
    const original = new GameScene({ appendChild() {} } as unknown as HTMLElement, LEVEL);
    passthrough.mockRestore();
    const optimized = new GameScene({ appendChild() {} } as unknown as HTMLElement, LEVEL);
    type Internals = { scene: THREE.Scene; setOverview(on: boolean): void };
    const a = original as unknown as Internals, b = optimized as unknown as Internals;
    for (const overview of [false, true, false]) {
      a.setOverview(overview); b.setOverview(overview);
      expectSameSurfaces(a.scene, b.scene);
      const saved = meshCount(a.scene) - meshCount(b.scene);
      expect(saved).toBeGreaterThanOrEqual(48);
      console.info(`Opaque batching, overview=${overview}: ${saved} fewer meshes; identical surface triangles`);
    }
  });
});
