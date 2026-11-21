// Actual geometry parses without WebGL. Only image decoding is stubbed; image
// bytes are checked structurally and rendered by the Blender reimport workflow.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Box3, Group, Mesh, MeshStandardMaterial, type Object3D, Quaternion, Raycaster, Texture, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { CHARACTER_MODEL_URLS, ENVIRONMENT_MODEL_URLS, ITEM_MODEL_URLS } from "../src/view/modelEntry";
import { ITEM_LABEL_Y, itemLabelShown, LABEL_CENTER_Y } from "../src/view/labels";
import { modelRotationY, placeAtSocket } from "../src/view/shoulder";

const file = (url: string) => readFileSync(new URL(`../public/${url}`, import.meta.url));
const parse = (buf: Buffer): Promise<Object3D> =>
  new Promise((ok, fail) =>
    new GLTFLoader().register(() => ({ name: "asset_geometry_skip_image_decode", loadTexture: async () => new Texture() }))
      .parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, "", (g) => ok(g.scene), fail),
  );
const size = (o: Object3D) => new Box3().setFromObject(o).getSize(new Vector3());

describe("production washing-station assets", () => {
  it.each(["bath_stool", "wash_basin"] as const)("%s has a self-contained, bounded export matching its production record", async (id) => {
    const url = ENVIRONMENT_MODEL_URLS[id];
    expect(url).toBeTruthy();
    const bytes = file(url!);
    const asset = JSON.parse(readFileSync(new URL("../assets/manifest.json", import.meta.url), "utf8")).assets[id];
    expect(asset.status).toBe("exported");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.measured.sha256);
    expect(bytes.length).toBe(asset.measured.glb_bytes);
    expect(bytes.length / 1_000_000).toBeLessThanOrEqual(asset.limits.glb_mb);
    const jsonLength = bytes.readUInt32LE(12);
    const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
    expect(gltf.buffers.every((buffer: { uri?: string }) => buffer.uri === undefined)).toBe(true);
    expect(gltf.images ?? []).toHaveLength(0);
    expect(gltf.textures ?? []).toHaveLength(0);
    expect(gltf.materials).toHaveLength(1);

    const root = await parse(bytes);
    const bounds = new Box3().setFromObject(root, true);
    const measured = bounds.getSize(new Vector3()).toArray();
    const dimensions = [asset.measured.width, asset.measured.height, asset.measured.depth];
    measured.forEach((value, axis) => expect(value).toBeCloseTo(dimensions[axis]!, 5));
    expect(measured[1]).toBeGreaterThanOrEqual(asset.limits.height[0]);
    expect(measured[1]).toBeLessThanOrEqual(asset.limits.height[1]);
    expect(Math.max(measured[0]!, measured[2]!)).toBeLessThanOrEqual(asset.limits.max_width + 1e-6);
    if (id === "wash_basin") {
      // Preserve the measured source's circular footprint and natural profile.
      // The old envelope stretch made the basin 1.55x taller and oval.
      expect(measured[0]).toBeCloseTo(measured[2]!, 5);
      expect(measured[1]! / measured[0]!).toBeGreaterThan(0.42);
      expect(measured[1]! / measured[0]!).toBeLessThan(0.49);
    }
    expect(bounds.min.y).toBeCloseTo(0, 6);
    expect(bounds.getCenter(new Vector3()).x).toBeCloseTo(0, 6);
    expect(bounds.getCenter(new Vector3()).z).toBeCloseTo(0, 6);
    let triangles = 0;
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const positions = object.geometry.getAttribute("position");
      const normals = object.geometry.getAttribute("normal");
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      expect(Array.from(normals.array).every(Number.isFinite)).toBe(true);
      triangles += (object.geometry.index?.count ?? positions.count) / 3;
    });
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThanOrEqual(asset.limits.triangles);
    expect(triangles).toBe(asset.measured.triangles);
  });

  it("the basin has an open interior above a solid floor and inward-facing walls", async () => {
    const basin = await parse(file(ENVIRONMENT_MODEL_URLS.wash_basin!));
    basin.updateMatrixWorld(true);
    const hits = (origin: Vector3, direction: Vector3) => new Raycaster(origin, direction).intersectObject(basin, true);
    // A filled/closed reconstruction would hit near the rim here.
    const interior = hits(new Vector3(0, 0.2, 0), new Vector3(0, -1, 0));
    expect(interior.length).toBeGreaterThan(0);
    expect(interior[0]!.point.y).toBeGreaterThan(0.001);
    expect(interior[0]!.point.y).toBeLessThan(0.04);
    const underside = hits(new Vector3(0, -0.1, 0), new Vector3(0, 1, 0));
    expect(underside.length).toBeGreaterThan(0);
    expect(underside[0]!.point.y).toBeLessThan(interior[0]!.point.y - 0.001);
    for (const direction of [new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1)]) {
      const wall = hits(new Vector3(0, 0.07, 0), direction);
      expect(wall.length).toBeGreaterThan(0);
      expect(wall[0]!.distance).toBeGreaterThan(0.05);
      expect(wall[0]!.distance).toBeLessThan(0.1);
    }
  });

  it("the stool keeps its central drain and clearance beneath the seat", async () => {
    const stool = await parse(file(ENVIRONMENT_MODEL_URLS.bath_stool!));
    stool.updateMatrixWorld(true);
    for (const [x, z] of [[0, 0], [-0.02, 0], [0.02, 0], [0, -0.005], [0, 0.005]]) {
      const drain = new Raycaster(new Vector3(x, 0.4, z), new Vector3(0, -1, 0));
      expect(drain.intersectObject(stool, true)).toHaveLength(0);
    }
    for (const direction of [new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1)]) {
      const clearance = new Raycaster(new Vector3(0, 0.10, 0), direction);
      expect(clearance.intersectObject(stool, true)).toHaveLength(0);
    }
  });
});

describe("connected models (shoulder-view Req 6)", () => {
  it("lists all three pipeline character models and the hat", () => {
    expect(Object.keys(CHARACTER_MODEL_URLS)).toEqual(["duck", "child", "adult"]);
    expect(Object.keys(ITEM_MODEL_URLS)).toEqual(["hat"]);
  });

  it("files match the confirmed SHA-256 and size", () => {
    const manifest = JSON.parse(readFileSync(new URL("../assets/manifest.json", import.meta.url), "utf8"));
    for (const [id, url] of Object.entries({ ...CHARACTER_MODEL_URLS, hat_sauna_duck: ITEM_MODEL_URLS.hat! })) {
      const b = file(url);
      expect([createHash("sha256").update(b).digest("hex"), b.length])
        .toEqual([manifest.assets[id].measured.sha256, manifest.assets[id].measured.glb_bytes]);
      expect(b.length / 1_000_000).toBeLessThanOrEqual(manifest.assets[id].limits.glb_mb);
      const jsonLength = b.readUInt32LE(12);
      const gltf = JSON.parse(b.subarray(20, 20 + jsonLength).toString());
      expect(gltf.materials.length).toBeLessThanOrEqual(manifest.assets[id].limits.materials);
      const triangles = gltf.meshes.flatMap((mesh: { primitives: { indices: number }[] }) => mesh.primitives)
        .reduce((sum: number, primitive: { indices: number }) => sum + gltf.accessors[primitive.indices].count / 3, 0);
      expect(triangles).toBe(manifest.assets[id].measured.triangles);
      expect(triangles).toBeLessThanOrEqual(manifest.assets[id].limits.triangles);
      expect(gltf.buffers.every((buffer: { uri?: string }) => buffer.uri === undefined)).toBe(true);
      expect((gltf.textures ?? []).length).toBe(manifest.assets[id].measured.textures);
      for (const img of gltf.images ?? []) {
        expect(img.uri).toBeUndefined();
        expect(img.mimeType).toBe("image/png");
        const start = 28 + jsonLength + (gltf.bufferViews[img.bufferView].byteOffset ?? 0);
        expect(b.subarray(start, start + 8).toString("hex")).toBe("89504e470d0a1a0a");
        for (const offset of [16, 20]) {
          expect(b.readUInt32BE(start + offset)).toBeGreaterThan(0);
          expect(b.readUInt32BE(start + offset)).toBeLessThanOrEqual(manifest.assets[id].limits.texture_px);
        }
      }
    }
  });

  it.each(["child", "adult"] as const)("%s has both outfits, sockets, bounded geometry and embedded textures", async (id) => {
    const b = file(CHARACTER_MODEL_URLS[id]!);
    const jsonLength = b.readUInt32LE(12);
    const g = JSON.parse(b.subarray(20, 20 + jsonLength).toString()) as {
      nodes: { name?: string; translation?: number[] }[];
      meshes: { primitives: { indices: number }[] }[];
      accessors: { count: number }[];
      materials: object[];
      buffers: { uri?: string }[];
      images: { uri?: string; bufferView: number; mimeType: string }[];
      bufferViews: { byteOffset?: number; byteLength: number }[];
      animations?: object[];
    };
    const names = g.nodes.map((n) => n.name);
    for (const name of [id, "outfit_clothed", "outfit_bath", "socket_hand_r", "socket_label"]) expect(names).toContain(name);
    expect(g.materials).toHaveLength(2);
    expect(g.images).toHaveLength(2);
    expect(g.buffers.every((buffer) => buffer.uri === undefined)).toBe(true);
    const triangles = g.meshes.flatMap((mesh) => mesh.primitives).reduce((n, p) => n + g.accessors[p.indices]!.count / 3, 0);
    expect(triangles).toBeLessThanOrEqual(12000);
    expect(g.animations ?? []).toHaveLength(0);
    const binaryStart = 20 + jsonLength + 8;
    for (const img of g.images) {
      expect(img.uri).toBeUndefined();
      expect(img.mimeType).toBe("image/png");
      const imageStart = binaryStart + (g.bufferViews[img.bufferView]!.byteOffset ?? 0);
      expect(b.readUInt32BE(imageStart + 16)).toBe(1024);
      expect(b.readUInt32BE(imageStart + 20)).toBe(1024);
    }
    if (id === "adult") {
      const carry = g.nodes.find((n) => n.name === "socket_carry")!.translation!;
      expect(carry[0]).toBeCloseTo(-0.24, 5);
      expect(carry[1]).toBeCloseTo(0.90, 5);
      expect(carry[2]).toBeCloseTo(0.20, 5);
    }
    const asset = JSON.parse(readFileSync(new URL("../assets/manifest.json", import.meta.url), "utf8")).assets[id];
    const root = await parse(b);
    root.updateMatrixWorld(true);
    const hand = root.getObjectByName("socket_hand_r")!.getWorldPosition(new Vector3());
    for (const outfit of ["outfit_clothed", "outfit_bath"]) {
      const mesh = root.getObjectByName(outfit) as Mesh;
      const bounds = new Box3().setFromObject(mesh, true);
      expect(bounds.min.y).toBeCloseTo(0, 4);
      const height = bounds.getSize(new Vector3()).y;
      expect(height).toBeGreaterThanOrEqual(asset.limits.height[0]);
      expect(height).toBeLessThanOrEqual(asset.limits.height[1]);
      const positions = mesh.geometry.getAttribute("position");
      const band = id === "child" ? [0.64, 0.80] : [1.15, 1.25];
      const shoulder = new Box3();
      let handDistance = Infinity;
      for (let i = 0; i < positions.count; i++) {
        const p = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
        expect(p.toArray().every(Number.isFinite)).toBe(true);
        if (p.y >= band[0]! && p.y <= band[1]!) shoulder.expandByPoint(p);
        handDistance = Math.min(handDistance, p.distanceTo(hand));
      }
      const shoulderWidth = shoulder.getSize(new Vector3()).x;
      expect(shoulderWidth).toBeGreaterThanOrEqual(asset.limits.shoulder_width[0]);
      expect(shoulderWidth).toBeLessThanOrEqual(asset.limits.shoulder_width[1]);
      // Keeping an empty node alone does not keep a held prop in the hand.
      expect(handDistance).toBeLessThan(0.04);
    }
  });

  it("Duck: 0.28–0.32 m tall, ≤ 0.36 m wide, bottom at 0, sockets present", async () => {
    const duck = await parse(file(CHARACTER_MODEL_URLS.duck!));
    const s = size(duck);
    expect(s.y).toBeGreaterThanOrEqual(0.28);
    expect(s.y).toBeLessThanOrEqual(0.32);
    expect(Math.max(s.x, s.z)).toBeLessThanOrEqual(0.36);
    expect(new Box3().setFromObject(duck).min.y).toBeCloseTo(0, 3);
    expect(duck.getObjectByName("socket_hat")).toBeTruthy();
    expect(duck.getObjectByName("socket_label")).toBeTruthy();
  });

  it("Duck refinement keeps its attachment sockets and two matching dark eye regions", async () => {
    const current = await parse(file(CHARACTER_MODEL_URLS.duck!));
    const previous = await parse(readFileSync(new URL("../assets/duck/blend/duck__v01.glb", import.meta.url)));
    for (const name of ["socket_hat", "socket_label"]) {
      expect(current.getObjectByName(name)!.position.toArray()).toEqual(previous.getObjectByName(name)!.position.toArray());
    }
    const eyes = [new Box3(), new Box3()];
    const counts = [0, 0];
    current.updateMatrixWorld(true);
    current.traverse(o => {
      if (!(o instanceof Mesh)) return;
      const positions = o.geometry.getAttribute("position");
      const colors = o.geometry.getAttribute("color");
      const material = !Array.isArray(o.material) && o.material instanceof MeshStandardMaterial ? o.material : null;
      const darkMaterial = material && !material.map && material.color.r + material.color.g + material.color.b < 0.3;
      for (let i = 0; i < positions.count; i++) {
        if (colors ? colors.getX(i) + colors.getY(i) + colors.getZ(i) >= 0.3 : !darkMaterial) continue;
        const p = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld);
        const side = p.x < 0 ? 0 : 1;
        eyes[side]!.expandByPoint(p);
        counts[side]!++;
      }
    });
    // Eye tessellation may change: protect the paired feature, not an old
    // vertex allocation that spent a quarter of the budget on the eyes.
    expect(counts[0]).toBeGreaterThan(3);
    expect(counts[0]).toBe(counts[1]);
    const left = eyes[0]!.getCenter(new Vector3());
    const right = eyes[1]!.getCenter(new Vector3());
    expect(left.x + right.x).toBeCloseTo(0, 6);
    expect(left.y).toBeCloseTo(right.y, 6);
    expect(eyes[0]!.getSize(new Vector3()).distanceTo(eyes[1]!.getSize(new Vector3()))).toBeLessThan(1e-6);
  });

  it("hat on the Duck's socket: base on the socket, turned with the Duck, own scale kept", async () => {
    const duckRoot = await parse(file(CHARACTER_MODEL_URLS.duck!));
    const hatRoot = await parse(file(ITEM_MODEL_URLS.hat!));
    const hs = size(hatRoot);
    expect(hs.y).toBeGreaterThanOrEqual(0.08);
    expect(hs.y).toBeLessThanOrEqual(0.2);
    // Same arrangement as GameScene: group at the Duck center, root lowered by the radius, turned to facing.
    const g = new Group();
    g.position.set(4, 0.15, 5);
    g.rotation.y = modelRotationY(-Math.PI / 2);
    duckRoot.position.y = -0.15;
    g.add(duckRoot);
    const hat = new Group();
    hat.add(hatRoot);
    placeAtSocket(hat, duckRoot.getObjectByName("socket_hat")!);
    hat.updateMatrixWorld(true);
    const socketWorld = new Vector3();
    duckRoot.getObjectByName("socket_hat")!.getWorldPosition(socketWorld);
    expect(hat.position.distanceTo(socketWorld)).toBeLessThan(1e-9);
    const q = new Quaternion();
    g.getWorldQuaternion(q);
    expect(Math.abs(hat.quaternion.dot(q))).toBeCloseTo(1, 6);
    expect(hat.scale.toArray()).toEqual([1, 1, 1]);
    expect(socketWorld.y).toBeCloseTo(0.27, 3); // top of the 0.30 m Duck (root at 0)
  });
});

describe("item labels do not hide small models (shoulder-view Req 7.5)", () => {
  it("held or worn items show no label in the shoulder view; resting items and the overview keep it", () => {
    for (const id of ["duck", "child", "adult"] as const) {
      expect(itemLabelShown({ kind: "character", id }, false)).toBe(false);
      expect(itemLabelShown({ kind: "character", id }, true)).toBe(true);
    }
    expect(itemLabelShown({ kind: "node", id: "sauna_hat_shelf" }, false)).toBe(true);
  });

  it("a resting item's label sits wholly above its model (bottom-anchored above the model top)", async () => {
    expect(LABEL_CENTER_Y.item).toBe(0);
    // The hat model rests with its base at center − 0.08 m (the primitive's half height).
    const hat = await parse(file(ITEM_MODEL_URLS.hat!));
    const top = new Box3().setFromObject(hat).max.y - 0.08;
    expect(top).toBeLessThan(ITEM_LABEL_Y);
    // Primitive coin (0.03 m) and key (0.04 m) are centered on the group.
    expect(0.02).toBeLessThan(ITEM_LABEL_Y);
  });
});
