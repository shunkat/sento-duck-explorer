import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Quaternion, Sprite, SpriteMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { applyOutfit, checkHumanContract } from "../src/view/humanModel";
import { placeCharacterAtSocket } from "../src/view/shoulder";
import { createInitialState } from "../src/core/initialState";
import { deriveView } from "../src/view/deriveView";
import { LEVEL } from "../src/level/layout";
import { setBodyOpacity } from "../src/view/scene";

function human(adult = false): Group {
  const root = new Group();
  for (const name of ["outfit_clothed", "outfit_bath", "socket_hand_r", "socket_label", ...(adult ? ["socket_carry"] : [])]) {
    const node = new Object3D();
    node.name = name;
    if (name === "socket_carry") node.position.set(-0.24, 0.9, 0.2);
    root.add(node);
  }
  return root;
}

describe("pipeline human models", () => {
  it("rebuilds an already opaque material when fading starts/ends, while labels stay opaque", () => {
    const material = new MeshStandardMaterial();
    const label = new Sprite(new SpriteMaterial());
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(), material), label);
    const version = material.version;
    setBodyOpacity(root, 0.3);
    expect(material.version).toBe(version + 1);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.3);
    expect(material.depthWrite).toBe(false);
    expect(label.material.opacity).toBe(1);
    setBodyOpacity(root, 0.5);
    expect(material.version).toBe(version + 1);
    setBodyOpacity(root, 1);
    expect(material.version).toBe(version + 2);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
  });

  it("accepts complete heads within each outfit and checks carry height in model-local space", () => {
    const root = human(true);
    root.position.set(4, -0.85, 3);
    root.rotation.y = Math.PI / 2;
    expect(checkHumanContract("adult", root)).toEqual([]);
    root.getObjectByName("socket_carry")!.position.y = 1.2;
    expect(checkHumanContract("adult", root)).toHaveLength(1);
  });

  it("shows exactly one outfit on first use and after clothing/checkpoint changes", () => {
    const root = human();
    for (const clothing of ["unclothed", "clothed", "unclothed"] as const) {
      expect(applyOutfit(root, clothing)).toBe(true);
      expect(root.getObjectByName("outfit_clothed")!.visible).toBe(clothing === "clothed");
      expect(root.getObjectByName("outfit_bath")!.visible).toBe(clothing === "unclothed");
    }
    root.remove(root.getObjectByName("outfit_bath")!);
    expect(checkHumanContract("child", root)).toContain("missing outfit_bath");
    expect(applyOutfit(root, "clothed")).toBe(false);
  });

  it("places the carried Duck's bottom on the rotated Adult socket, not its center", () => {
    const adult = human(true);
    adult.position.set(12, 0, 4);
    adult.rotation.y = Math.PI / 2;
    const socket = adult.getObjectByName("socket_carry")!;
    const duckCenter = new Group();
    const duckRoot = new Group();
    duckRoot.position.y = -0.15;
    duckCenter.add(duckRoot);
    placeCharacterAtSocket(duckCenter, socket, 0.15);
    expect(duckRoot.getWorldPosition(new Vector3()).distanceTo(socket.getWorldPosition(new Vector3()))).toBeLessThan(1e-9);
    const q = socket.getWorldQuaternion(new Quaternion());
    expect(Math.abs(duckRoot.getWorldQuaternion(new Quaternion()).dot(q))).toBeCloseTo(1, 8);
    expect(duckCenter.position.y).toBeCloseTo(1.05, 8);
    // If Duck's GLB is still loading/failed, the equipped hat follows the
    // actual carried primitive rather than the obsolete forward offset.
    const fallbackHat = new Group();
    placeCharacterAtSocket(fallbackHat, duckCenter, 0.21);
    expect(fallbackHat.position.x).toBeCloseTo(duckCenter.position.x, 8);
    expect(fallbackHat.position.z).toBeCloseTo(duckCenter.position.z, 8);
    expect(fallbackHat.position.y).toBeCloseTo(1.26, 8);
    expect(Math.abs(fallbackHat.quaternion.dot(q))).toBeCloseTo(1, 8);
  });

  it("exposes clothing and current item owners to the renderer without changing core state", () => {
    const state = createInitialState(LEVEL);
    state.child.clothing = "clothed";
    state.items.hat.owner = { kind: "character", id: "child" };
    const view = deriveView(state, LEVEL);
    expect(view.characters.child.clothing).toBe("clothed");
    expect(view.characters.adult.clothing).toBe("unclothed");
    expect(view.items.hat.owner).toEqual({ kind: "character", id: "child" });
    expect(view.hatAttachedToDuck).toBe(false);
  });
});
