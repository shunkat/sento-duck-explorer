// Duck/hat parse without WebGL. Textured human GLBs are inspected structurally
// here; actual image decoding/rendering is checked separately in the browser.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Box3, Group, Mesh, type Object3D, Quaternion, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { CHARACTER_MODEL_URLS, ITEM_MODEL_URLS } from "../src/view/modelEntry";
import { ITEM_LABEL_Y, itemLabelShown, LABEL_CENTER_Y } from "../src/view/labels";
import { modelRotationY, placeAtSocket } from "../src/view/shoulder";

const file = (url: string) => readFileSync(new URL(`../public/${url}`, import.meta.url));
const parse = (buf: Buffer): Promise<Object3D> =>
  new Promise((ok, fail) =>
    new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, "", (g) => ok(g.scene), fail),
  );
const size = (o: Object3D) => new Box3().setFromObject(o).getSize(new Vector3());

describe("connected models (shoulder-view Req 6)", () => {
  it("lists all three pipeline character models and the hat", () => {
    expect(Object.keys(CHARACTER_MODEL_URLS)).toEqual(["duck", "child", "adult"]);
    expect(Object.keys(ITEM_MODEL_URLS)).toEqual(["hat"]);
  });

  it("files match the confirmed SHA-256 and size", () => {
    const want: Record<string, [string, number]> = {
      "models/duck.glb": ["b2cac004808711a138d030c897934a5cfb5698cab5a103a4957ffc14b1f41cdc", 187588],
      "models/hat_sauna_duck.glb": ["027796c5bba9e2f27fe8e9f5d6a5017f19e55521961e15998b8f90ba6bbe9102", 27208],
      "models/child.glb": ["9d15324acce1d81b932628a7139c03a73cf36943be996d8db5b14c712bd9edca", 792720],
      "models/adult.glb": ["3ad862ac190776670c82df610c54a1def6a794914118cb11c1759b554e1cf270", 723784],
    };
    for (const url of [...Object.values(CHARACTER_MODEL_URLS), ...Object.values(ITEM_MODEL_URLS)]) {
      const b = file(url);
      expect([createHash("sha256").update(b).digest("hex"), b.length]).toEqual(want[url]);
    }
  });

  it.each(["child", "adult"] as const)("%s has both outfits, sockets, bounded geometry and embedded textures", (id) => {
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

  it("Duck eye revision keeps the body envelope and sockets, with two matching dark eye regions", async () => {
    const current = await parse(file(CHARACTER_MODEL_URLS.duck!));
    const previous = await parse(readFileSync(new URL("../assets/duck/blend/duck__v01.glb", import.meta.url)));
    const a = new Box3().setFromObject(current);
    const b = new Box3().setFromObject(previous);
    expect(a.min.distanceTo(b.min)).toBeLessThan(1e-7);
    expect(a.max.distanceTo(b.max)).toBeLessThan(1e-7);
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
      for (let i = 0; i < positions.count; i++) {
        if (colors.getX(i) + colors.getY(i) + colors.getZ(i) >= 0.3) continue;
        const p = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld);
        const side = p.x < 0 ? 0 : 1;
        eyes[side]!.expandByPoint(p);
        counts[side]!++;
      }
    });
    expect(counts[0]).toBeGreaterThan(400);
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
