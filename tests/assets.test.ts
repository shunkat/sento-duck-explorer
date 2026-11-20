// The connected final models (Duck, hat) parse and match the final-assets
// contract. No WebGL: GLTFLoader.parse only.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Box3, Group, type Object3D, Quaternion, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { CHARACTER_MODEL_URLS, ITEM_MODEL_URLS } from "../src/view/modelEntry";
import { modelRotationY, placeAtSocket } from "../src/view/shoulder";

const file = (url: string) => readFileSync(new URL(`../public/${url}`, import.meta.url));
const parse = (buf: Buffer): Promise<Object3D> =>
  new Promise((ok, fail) =>
    new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, "", (g) => ok(g.scene), fail),
  );
const size = (o: Object3D) => new Box3().setFromObject(o).getSize(new Vector3());

describe("connected models (shoulder-view Req 6)", () => {
  it("lists exactly the Duck and the hat; Child and Adult stay placeholders", () => {
    expect(Object.keys(CHARACTER_MODEL_URLS)).toEqual(["duck"]);
    expect(Object.keys(ITEM_MODEL_URLS)).toEqual(["hat"]);
  });

  it("files match the confirmed SHA-256 and size", () => {
    const want: Record<string, [string, number]> = {
      "models/duck.glb": ["ab9b26501b25c3b1678b068cd286fecb7a83b884cd66577c04a228d50abd089e", 141096],
      "models/hat_sauna_duck.glb": ["027796c5bba9e2f27fe8e9f5d6a5017f19e55521961e15998b8f90ba6bbe9102", 27208],
    };
    for (const url of [CHARACTER_MODEL_URLS.duck!, ITEM_MODEL_URLS.hat!]) {
      const b = file(url);
      expect([createHash("sha256").update(b).digest("hex"), b.length]).toEqual(want[url]);
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
