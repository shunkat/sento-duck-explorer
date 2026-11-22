import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InteractTarget } from "../src/core/actions";
import { lineBlocked, occluders } from "../src/view/occlusion";
import { TargetFeedback } from "../src/view/targetFeedback";
afterEach(() => vi.unstubAllGlobals());
const box = (x: number, y: number, z: number, mat: THREE.Material, w = 1, h = 1, d = 0.2) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.updateMatrixWorld(true);
  return m;
};
const opaque = () => new THREE.MeshBasicMaterial({ color: 0xffffff });
const eye = { x: 0, y: 1.5, z: 4 };
const point = { x: 0, y: 1, z: 0 };
describe("what can hide the target text", () => {
  it("opaque props, bodies and low fixtures block, whatever their height or the viewing slope", () => {
    const wall = new THREE.Group();
    wall.add(box(0, 1, 2, opaque(), 2, 3));
    expect(lineBlocked(occluders(wall), eye, point)).toBe(true);
    // A low fixture seen at a slant: its top is under the eye, but the line to a low text still dips behind it.
    const low = new THREE.Group();
    low.add(box(0, 0.6, 2, opaque(), 2, 1.2)); // top 1.2 m, below the 1.5 m eye
    expect(lineBlocked(occluders(low), { x: 0, y: 1.5, z: 4 }, { x: 0, y: 0.3, z: 0 })).toBe(true);
    expect(lineBlocked(occluders(low), { x: 0, y: 1.5, z: 4 }, { x: 0, y: 1.2, z: 0 })).toBe(false); // clears the top
  });
  it("hidden LODs, faded or transparent surfaces and things beside the line do not block", () => {
    const g = new THREE.Group();
    const hiddenLod = box(0, 1, 2, opaque(), 2, 3);
    hiddenLod.visible = false;
    const parentHidden = new THREE.Group();
    parentHidden.visible = false;
    parentHidden.add(box(0, 1, 2, opaque(), 2, 3));
    const glass = box(0, 1, 2, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false }), 2, 3);
    const aside = box(5, 1, 2, opaque(), 1, 3);
    g.add(hiddenLod, parentHidden, glass, aside);
    expect(occluders(g)).toEqual([aside]);
    expect(lineBlocked(occluders(g), eye, point)).toBe(false);
  });
  it("the surface right at the text (a door panel behind it) does not hide it", () => {
    const g = new THREE.Group();
    g.add(box(0, 1, -0.1, opaque(), 2, 3, 0.2)); // its front face is 0 m from the point
    expect(lineBlocked(occluders(g), eye, point)).toBe(false);
  });
});
describe("TargetFeedback decides world or HUD from the real scene", () => {
  const target: InteractTarget = { kind: "milk", id: "milk1", label: "牛乳びんを飲む", pos: { x: 0, z: 0 }, y: 0.6 };
  const camera = () => {
    const c = new THREE.PerspectiveCamera(55, 390 / 844, 0.05, 200);
    c.position.set(0, 1.4, 4);
    c.lookAt(0, 0.8, 0);
    c.updateMatrixWorld(true);
    return c;
  };
  const viewport = { w: 390, h: 844 };
  const margin = { top: 48, right: 12, bottom: 64, left: 12 };
  function fb(scene: THREE.Scene) {
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => null, width: 0, height: 0 }) });
    return new TargetFeedback(scene);
  }
  it("shows in the world when nothing is in the way and falls back to the HUD behind an opaque mesh", () => {
    const scene = new THREE.Scene();
    const f = fb(scene);
    expect(f.update(target, true, camera(), viewport, margin)).toBe("world");
    const blocker = box(0, 0.8, 2, opaque(), 3, 3);
    scene.add(blocker);
    expect(f.update(target, true, camera(), viewport, margin)).toBe("hud");
    blocker.visible = false; // an invisible LOD no longer hides it
    expect(f.update({ ...target, id: "milk2" }, true, camera(), viewport, margin)).toBe("world");
  });
  it("is empty when there is no target or help is off, and leaves nothing floating in the scene", () => {
    const scene = new THREE.Scene();
    const f = fb(scene);
    expect(f.update(null, true, camera(), viewport, margin)).toBe("none");
    expect(scene.children).toHaveLength(0);
    expect(f.update(target, false, camera(), viewport, margin)).toBe("none");
    expect(scene.children).toHaveLength(0);
    f.update(target, true, camera(), viewport, margin);
    expect(scene.children.length).toBeGreaterThan(0);
    f.hide();
    expect(scene.children).toHaveLength(0);
  });
});
