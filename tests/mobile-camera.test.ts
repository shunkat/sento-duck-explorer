import { readFileSync } from "node:fs";
import { Box3, Matrix4, PerspectiveCamera, Texture, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";
import type { CharacterId } from "../src/core/types";
import { CHARACTER_RADIUS } from "../src/level/layout";
import type { AABB } from "../src/sim/geometry";
import { FollowCamera, type Pose } from "../src/view/camera";
import { BODY_HEIGHT, type Vec3 } from "../src/view/deriveView";
import { headAnchor, TOWEL_DEPTH, TOWEL_THICKNESS, TOWEL_WIDTH } from "../src/view/humanModel";
import { CHARACTER_MODEL_URLS } from "../src/view/modelEntry";
import { compressedBodyOpacity } from "../src/view/mobileCamera";
import { CEILING_Y, HOLE_LID_Y, modelRotationY, PITCH_MAX, PITCH_MIN, shoulderPose, type Obstacles } from "../src/view/shoulder";

const SIZES = [[320, 568], [390, 844], [568, 320], [844, 390]] as const;
const STAGES = ["duck", "child", "adult"] as const;
const FAR_HOLE = { minX: 100, maxX: 101, minZ: 100, maxZ: 101 };
const OPEN: Obstacles = { boxes: [], low: [], hole: FAR_HOLE };
const focusOf = (id: CharacterId): Vec3 => ({ x: 0, y: id === "duck" ? CHARACTER_RADIUS.duck : BODY_HEIGHT[id] / 2, z: 0 });
const corners = (box: Box3): Vector3[] => [box.min.x, box.max.x].flatMap(x =>
  [box.min.y, box.max.y].flatMap(y => [box.min.z, box.max.z].map(z => new Vector3(x, y, z))));
const perspective = (pose: Pose, width: number, height: number): PerspectiveCamera => {
  const camera = new PerspectiveCamera(pose.fov ?? 55, width / height, 0.05, 200);
  camera.position.set(pose.eye.x, pose.eye.y, pose.eye.z);
  camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
  camera.updateMatrixWorld();
  return camera;
};
const touchCamera = (width = 390, height = 844): FollowCamera => {
  const camera = new FollowCamera();
  camera.setViewport(width, height, true);
  return camera;
};
const inside = (p: Vec3, b: AABB): boolean => p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ;

// Parse real production geometry without WebGL. Texture decoding is irrelevant
// to projection; the separate asset suite validates its bytes and materials.
const parse = (id: CharacterId): Promise<Object3D> => {
  const b = readFileSync(new URL(`../public/${CHARACTER_MODEL_URLS[id]}`, import.meta.url));
  return new Promise((resolve, reject) => new GLTFLoader()
    .register(() => ({ name: "camera_geometry_only", loadTexture: async () => new Texture() }))
    .parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "", g => resolve(g.scene), reject));
};

describe("mobile framing against production model bounds", () => {
  const geometry = {} as Record<CharacterId, { body: Vector3[]; towel: Vector3[] }>;
  beforeAll(async () => {
    for (const id of STAGES) {
      const root = await parse(id);
      const bounds = new Box3().setFromObject(root, true);
      const towel: Vector3[] = [];
      if (id !== "duck") {
        const y = headAnchor(BODY_HEIGHT[id], bounds.max.y - BODY_HEIGHT[id] / 2) + BODY_HEIGHT[id] / 2;
        towel.push(...corners(new Box3(new Vector3(-TOWEL_WIDTH / 2, y, -TOWEL_DEPTH / 2),
          new Vector3(TOWEL_WIDTH / 2, y + TOWEL_THICKNESS, TOWEL_DEPTH / 2))));
        const hand = root.getObjectByName("socket_hand_r")!.getWorldPosition(new Vector3());
        towel.push(...corners(new Box3(new Vector3(hand.x - TOWEL_WIDTH / 2, hand.y - TOWEL_DEPTH, hand.z - TOWEL_THICKNESS / 2),
          new Vector3(hand.x + TOWEL_WIDTH / 2, hand.y, hand.z + TOWEL_THICKNESS / 2))));
      }
      geometry[id] = { body: corners(bounds), towel };
    }
  });

  for (const [width, height] of SIZES) {
    it.each(STAGES)(`%s fits ${width}×${height} front/back/sides/diagonals in free space`, id => {
      const follow = touchCamera(width, height);
      for (const bob of id === "duck" ? [-0.015, 0, 0.015] : [0]) for (let facing = 0; facing < 8; facing++) {
        const focus = focusOf(id);
        focus.y += bob;
        const pose = follow.update(id, focus, 1 / 60, OPEN);
        const camera = perspective(pose, width, height);
        expect(pose.activeBodyOpacity).toBe(1);
        // Match GameScene.setCharacterModel/positionCharacters: the GLB root
        // is lowered by radius for Duck, and half-height for humans. Only the
        // bob remains after adding the character group's focus position.
        const centerToBottom = id === "duck" ? CHARACTER_RADIUS.duck : BODY_HEIGHT[id] / 2;
        const modelWorld = new Matrix4().makeRotationY(modelRotationY(facing * Math.PI / 4));
        modelWorld.setPosition(focus.x, focus.y - centerToBottom, focus.z);
        const projected = geometry[id].body.map(p => p.clone().applyMatrix4(modelWorld).project(camera));
        const x = projected.map(p => (p.x + 1) / 2);
        const y = projected.map(p => (1 - p.y) / 2);
        const left = Math.min(...x), right = Math.max(...x);
        const top = Math.min(...y), bottom = Math.max(...y);
        expect(left).toBeGreaterThanOrEqual(0.05);
        expect(right).toBeLessThanOrEqual(0.95);
        expect(top).toBeGreaterThan(0.05);
        expect(bottom).toBeLessThan(0.95);
        expect(right - left).toBeLessThanOrEqual(id === "duck" ? 0.4 : 0.5);
        expect(bottom - top).toBeGreaterThanOrEqual(id === "duck" ? 0.12 : 0.3);
        expect(bottom - top).toBeLessThanOrEqual(id === "duck" ? 0.25 : 0.5);
        if (id === "duck") {
          expect((left + right) / 2).toBeGreaterThanOrEqual(0.42);
          expect((left + right) / 2).toBeLessThanOrEqual(0.58);
          expect((top + bottom) / 2).toBeGreaterThan(0.56);
          expect((top + bottom) / 2).toBeLessThan(0.68);
        }
        for (const p of [...geometry[id].body, ...geometry[id].towel]) {
          const ndc = p.clone().applyMatrix4(modelWorld).project(camera);
          expect(Math.abs(ndc.x)).toBeLessThan(0.9);
          expect(Math.abs(ndc.y)).toBeLessThan(0.9);
          expect(ndc.z).toBeGreaterThan(-1);
          expect(ndc.z).toBeLessThan(1);
        }
      }
    });
  }
});

describe("mobile camera state and desktop invariance", () => {
  it("retains exact desktop eye and target for all stages, view angles and viewports", () => {
    for (const [w, h] of SIZES) for (const id of STAGES) for (const yaw of [-1.7, 0, 2.3]) {
      const follow = new FollowCamera();
      follow.setViewport(w, h, false);
      follow.orbit(yaw);
      follow.tilt(0.2);
      expect(follow.update(id, focusOf(id), 1 / 60, OPEN)).toEqual(shoulderPose(id, focusOf(id), yaw, OPEN, 0.2));
    }
  });

  it("late touch activation smoothly reaches initial-touch framing without changing manual angles", () => {
    const follow = new FollowCamera();
    follow.orbit(0.7);
    follow.tilt(-0.2);
    const pc = follow.update("duck", focusOf("duck"), 1 / 60, OPEN);
    follow.setViewport(390, 844, true);
    const beginning = follow.update("duck", focusOf("duck"), 0, OPEN);
    expect(beginning.eye).toEqual(pc.eye);
    expect(beginning.target).toEqual(pc.target);
    expect(beginning.fov).toBe(55);
    const middle = follow.update("duck", focusOf("duck"), 0.15, OPEN);
    expect(middle.fov).toBeGreaterThan(55);
    expect(middle.fov).toBeLessThan(65);
    const end = follow.update("duck", focusOf("duck"), 0.15, OPEN);
    const initial = touchCamera();
    initial.orbit(0.7);
    initial.tilt(-0.2);
    expect(end).toEqual(initial.update("duck", focusOf("duck"), 0.3, OPEN));
    expect([follow.yaw, follow.moveYaw, follow.pitch]).toEqual([0.7, 0.7, -0.2]);
  });

  it("orientation and dynamic-bar resize converge without restarting growth or resetting angles", () => {
    const follow = touchCamera();
    follow.orbit(0.4);
    follow.tilt(0.1);
    follow.update("duck", focusOf("duck"), 0.1, OPEN);
    follow.update("child", focusOf("child"), 0.1, OPEN);
    follow.setViewport(844, 390, true);
    for (let i = 0; i < 4; i++) {
      follow.setViewport(844, 390 + i, true);
      follow.update("child", focusOf("child"), 0.1, OPEN);
    }
    const stable = follow.update("child", focusOf("child"), 0, OPEN);
    const comparison = touchCamera(844, 393);
    comparison.orbit(0.4);
    comparison.tilt(0.1);
    expect(stable).toEqual(comparison.update("child", focusOf("child"), 0.1, OPEN));
    expect([follow.yaw, follow.moveYaw, follow.pitch]).toEqual([0.4, 0.4, 0.1]);
    follow.setViewport(390, 844, true);
    const half = follow.update("child", focusOf("child"), 0.15, OPEN);
    expect(half.fov).toBeGreaterThan(55);
    expect(half.fov).toBeLessThan(65);
    expect(follow.update("child", focusOf("child"), 0.15, OPEN).fov).toBe(65);
  });

  it("hidden/invalid dimensions and invalid dt retain finite framing", () => {
    const follow = touchCamera();
    const original = follow.update("duck", focusOf("duck"), 0.1, OPEN);
    for (const [w, h] of [[0, 0], [NaN, 844], [390, Infinity], [-1, 844], [Infinity, 844]]) {
      follow.setViewport(w!, h!, true);
      for (const dt of [0, NaN, -1, Infinity]) expect(follow.update("duck", focusOf("duck"), dt, OPEN)).toEqual(original);
    }
  });
});

describe("compression, recovery and clip safety", () => {
  const WALL: Obstacles = { ...OPEN, boxes: [{ minX: -4, maxX: 4, minZ: 0.7, maxZ: 1 }] };
  it("fades continuously near a wall, eases out safely and restores exactly opaque", () => {
    const follow = touchCamera();
    follow.update("duck", focusOf("duck"), 1 / 60, OPEN);
    let lastOpacity = 1;
    for (let i = 0; i < 4; i++) {
      const pose = follow.update("duck", focusOf("duck"), 0.05, WALL);
      expect(pose.eye.z).toBeLessThan(0.58);
      expect(pose.activeBodyOpacity!).toBeLessThanOrEqual(lastOpacity);
      expect(lastOpacity - pose.activeBodyOpacity!).toBeLessThanOrEqual(0.25);
      lastOpacity = pose.activeBodyOpacity!;
    }
    expect(lastOpacity).toBe(0.25);
    const near = follow.update("duck", focusOf("duck"), 0.05, OPEN);
    expect(near.eye.z).toBeGreaterThan(0.58);
    expect(near.eye.z).toBeLessThan(1.7);
    const recovered = follow.update("duck", focusOf("duck"), 0.4, OPEN);
    expect(recovered.eye.z).toBe(1.7);
    expect(recovered.activeBodyOpacity).toBe(1);
    expect(compressedBodyOpacity(1.7, 1.7)).toBe(1);
  });

  it("checkpoint reset and desktop return clear stale fading", () => {
    const follow = touchCamera();
    expect(follow.update("duck", focusOf("duck"), 0.3, WALL).activeBodyOpacity).toBe(0.25);
    follow.lookAlong(0.8);
    const reset = follow.update("duck", focusOf("duck"), 0, OPEN);
    expect(reset.activeBodyOpacity).toBe(1);
    expect(follow.yaw).toBe(0.8);
    follow.setViewport(390, 844, false);
    expect(follow.update("duck", focusOf("duck"), 0, OPEN)).toEqual(shoulderPose("duck", focusOf("duck"), 0.8, OPEN));
  });

  it("wall, corner, closed-door sized blocker, low fixture, hole and ceiling keep the near plane safe", () => {
    const conditions: Obstacles[] = [WALL,
      { ...WALL, boxes: [...WALL.boxes, { minX: 0.7, maxX: 1, minZ: -4, maxZ: 4 }] },
      { ...OPEN, boxes: [{ minX: -0.6, maxX: 0.6, minZ: 0.7, maxZ: 0.85 }] },
      { ...OPEN, low: [{ box: WALL.boxes[0]!, top: 0.6 }] },
      { ...OPEN, hole: { minX: -1, maxX: 1, minZ: -2, maxZ: 2 } }, OPEN];
    for (const [w, h] of SIZES) for (const obs of conditions) for (const pitch of [PITCH_MIN, 0, PITCH_MAX]) for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
      const follow = touchCamera(w, h);
      follow.orbit(yaw);
      follow.tilt(pitch);
      for (const id of STAGES) for (let frame = 0; frame < 5; frame++) {
        const focus = focusOf(id);
        // Elevated free-space focus exercises the ceiling clamp, including growth.
        if (obs === OPEN) focus.y += 1.5;
        const pose = follow.update(id, focus, 0.1, obs);
        const camera = perspective(pose, w, h);
        const points = [new Vector3(pose.eye.x, pose.eye.y, pose.eye.z),
          ...[-1, 1].flatMap(x => [-1, 1].map(y => new Vector3(x, y, -1).unproject(camera)))];
        for (const p of points) {
          expect(p.toArray().every(Number.isFinite)).toBe(true);
          expect(p.y).toBeLessThan(CEILING_Y);
          if (inside(p, obs.hole)) expect(p.y).toBeLessThan(HOLE_LID_Y);
          for (const wall of obs.boxes) expect(inside(p, wall)).toBe(false);
          for (const low of obs.low) if (p.y < low.top) expect(inside(p, low.box)).toBe(false);
        }
        for (let n = 1; n <= 20; n++) {
          const line = { x: focus.x + (pose.eye.x - focus.x) * n / 20, y: pose.eye.y, z: focus.z + (pose.eye.z - focus.z) * n / 20 };
          for (const wall of obs.boxes) expect(inside(line, wall)).toBe(false);
        }
        expect([follow.yaw, follow.pitch]).toEqual([yaw, pitch]);
        expect(pose.activeBodyOpacity!).toBeGreaterThanOrEqual(0.25);
        expect(pose.activeBodyOpacity!).toBeLessThanOrEqual(1);
      }
    }
  });
});
