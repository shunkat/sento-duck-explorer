import { Group, Object3D, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { KeyboardState } from "../src/input/keyboard";
import { CHARACTER_RADIUS, LEVEL } from "../src/level/layout";
import type { AABB } from "../src/sim/geometry";
import { FollowCamera } from "../src/view/camera";
import type { View } from "../src/view/deriveView";
import {
  CAMERA_MARGIN,
  CAMERA_PROFILE,
  CEILING_Y,
  angleDiff,
  cameraRelativeMove,
  clipSegment,
  FacingTracker,
  FOLLOW_HOLD_SECONDS,
  followYaw,
  forwardOf,
  HOLE_LID_Y,
  modelRotationY,
  obstaclesFor,
  placeAtSocket,
  rightOf,
  shoulderPose,
  yawFromDirection,
} from "../src/view/shoulder";

const close = (a: { x: number; z: number }, b: { x: number; z: number }) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.z).toBeCloseTo(b.z, 9);
};
const W = { x: 0, z: -1 };
const D = { x: 1, z: 0 };

/** True if the segment a→b passes through the inside of box b (grown by m). */
function crosses(a: { x: number; z: number }, b: { x: number; z: number }, box: AABB, m = 0): boolean {
  for (let i = 1; i <= 50; i++) {
    const t = i / 50;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    if (x > box.minX - m && x < box.maxX + m && z > box.minZ - m && z < box.maxZ + m) return true;
  }
  return false;
}

describe("camera-relative movement (shoulder-view Req 3)", () => {
  it("yaw 0 keeps the old mapping; turning the camera turns W and D", () => {
    close(cameraRelativeMove(W, 0), W);
    close(cameraRelativeMove(D, 0), D);
    close(cameraRelativeMove(W, Math.PI / 2), { x: 1, z: 0 });
    close(cameraRelativeMove(D, Math.PI / 2), { x: 0, z: 1 });
    for (const yaw of [0, 0.7, 2, -2.5]) {
      close(cameraRelativeMove(W, yaw), forwardOf(yaw));
      close(cameraRelativeMove(D, yaw), rightOf(yaw));
      const diag = cameraRelativeMove({ x: Math.SQRT1_2, z: -Math.SQRT1_2 }, yaw);
      expect(Math.hypot(diag.x, diag.z)).toBeCloseTo(1, 9);
    }
    expect(cameraRelativeMove({ x: 0, z: 0 }, 1)).toEqual({ x: 0, z: 0 });
  });

  it("facing yaw and model rotation agree with the +Z model front", () => {
    for (const yaw of [0, 1, -2, 3]) {
      expect(yawFromDirection(forwardOf(yaw))).toBeCloseTo(Math.atan2(Math.sin(yaw), Math.cos(yaw)), 9);
      // three.js rotation.y = θ sends local +Z to (sin θ, cos θ).
      const t = modelRotationY(yaw);
      close({ x: Math.sin(t), z: Math.cos(t) }, forwardOf(yaw));
    }
  });
});

describe("shoulder pose (Req 1, 4)", () => {
  const obs = obstaclesFor(LEVEL, "locked");

  it("eye is behind and to the right, heights ordered, below the ceiling", () => {
    const p = shoulderPose("adult", { x: 8, y: 0.85, z: 4 }, 0, obs);
    expect(p.eye.z).toBeGreaterThan(4); // behind (yaw 0 looks toward −Z)
    expect(p.eye.x).toBeGreaterThan(8); // right shoulder
    expect(p.target.z).toBeLessThan(4); // looks ahead
    for (const id of ["duck", "child", "adult"] as const) expect(CAMERA_PROFILE[id].eye).toBeLessThan(CEILING_Y - 0.1);
  });

  it("a wall behind the character pulls the camera in front of the wall", () => {
    // Adult just inside the bath, back to the wall at z = 8.
    const focus = { x: 8, y: 0.85, z: 7.5 };
    const p = shoulderPose("adult", focus, 0, obs);
    expect(p.eye.z).toBeLessThan(8 - 0.1 - CAMERA_MARGIN + 1e-6);
    for (const b of obs.boxes) expect(crosses(focus, p.eye, b)).toBe(false);
  });

  it("inside the NarrowHole the Duck camera stays in the corridor and under the lid", () => {
    const hole = LEVEL.narrowHole.box;
    const zc = (hole.minZ + hole.maxZ) / 2;
    for (const x of [-0.5, -1.5, -2.5]) {
      const yaw = -Math.PI / 2; // facing −X, into the hole
      const p = shoulderPose("duck", { x, y: 0.15, z: zc }, yaw, obs);
      expect(p.eye.y).toBeLessThanOrEqual(HOLE_LID_Y - 0.1 + 1e-9);
      expect(p.eye.z).toBeGreaterThan(hole.minZ);
      expect(p.eye.z).toBeLessThan(hole.maxZ);
      expect(p.eye.x).toBeGreaterThan(x); // still behind Duck
      for (const b of obs.boxes) expect(crosses({ x, z: zc }, p.eye, b)).toBe(false);
    }
  });

  it("never crosses an obstacle at sampled positions and yaws along the level", () => {
    const spots: [("duck" | "child" | "adult"), number, number][] = [
      ["duck", 4, 5], ["adult", 2.6, 0.6], ["adult", 3, -6], ["child", 2.6, 8.6], ["child", 9.5, 9.2],
      ["child", 13.0, 10], ["adult", 20, 4], ["adult", 25.2, 3.6], ["duck", 28, 4], ["duck", 37, 4],
    ];
    for (const [id, x, z] of spots) {
      for (let k = 0; k < 8; k++) {
        const yaw = (k * Math.PI) / 4;
        const p = shoulderPose(id, { x, y: 0.5, z }, yaw, obs);
        for (const b of obs.boxes) expect(crosses({ x, z }, p.eye, b)).toBe(false);
      }
    }
  });

  it("clipSegment ignores a box that already contains the start", () => {
    const b = { minX: 0, minZ: 0, maxX: 1, maxZ: 1 };
    expect(clipSegment({ x: 0.5, z: 0.5 }, { x: 3, z: 0.5 }, [b], 0)).toEqual({ x: 3, z: 0.5 });
    const c = clipSegment({ x: -2, z: 0.5 }, { x: 3, z: 0.5 }, [b], 0);
    expect(c.x).toBeLessThan(0);
    expect(c.x).toBeGreaterThan(-0.01);
  });
});

describe("facing and orbit (Req 2, 3.4)", () => {
  const view = (duck: [number, number], child: [number, number], adult: [number, number], carried = false) =>
    ({
      characters: {
        duck: { id: "duck", pos: { x: duck[0], y: 0.15, z: duck[1] }, radius: CHARACTER_RADIUS.duck, height: 0.3, active: true, carried },
        child: { id: "child", pos: { x: child[0], y: 0.6, z: child[1] }, radius: 0.25, height: 1.2, active: false, carried: false },
        adult: { id: "adult", pos: { x: adult[0], y: 0.85, z: adult[1] }, radius: 0.35, height: 1.7, active: false, carried: false },
      },
    }) as unknown as View;

  it("moving sets facing, standing keeps it, teleports are ignored, a carried Duck faces like Adult", () => {
    const f = new FacingTracker();
    f.update(view([4, 5], [4, 4], [5, 4]));
    f.update(view([4.02, 5], [4, 4], [5, 4]));
    expect(f.yaw("duck")).toBeCloseTo(Math.PI / 2, 9); // +X
    f.update(view([4.02, 5], [4, 4], [5, 4]));
    expect(f.yaw("duck")).toBeCloseTo(Math.PI / 2, 9);
    f.update(view([20, 5], [4, 4], [5, 4]));
    expect(f.yaw("duck")).toBeCloseTo(Math.PI / 2, 9);
    f.update(view([5, 4], [4, 4], [5, 3.98], true));
    expect(f.yaw("adult")).toBeCloseTo(0, 9); // −Z
    expect(f.yaw("duck")).toBe(f.yaw("adult"));
  });

  it("J / L held turn the camera; the overview freezes the yaw", () => {
    const kb = new KeyboardState();
    kb.keyDown("KeyJ");
    expect(kb.orbit()).toBe(-1);
    kb.keyDown("KeyL");
    expect(kb.orbit()).toBe(0);
    kb.keyUp("KeyJ");
    expect(kb.orbit()).toBe(1);
    const cam = new FollowCamera();
    cam.orbit(0.5);
    expect(cam.yaw).toBe(0.5);
    expect(cam.moveYaw).toBe(0.5);
    cam.toggleOverview();
    cam.orbit(0.5);
    expect(cam.yaw).toBe(0.5);
    expect(cam.moveYaw).toBe(0); // overview: W is up the map
    cam.toggleOverview();
    expect(cam.moveYaw).toBe(0.5);
  });
});

describe("camera follows behind the moving character (Req 1.5)", () => {
  const obs = obstaclesFor(LEVEL, "locked");
  const focus = { x: 8, y: 0.85, z: 4 };

  it("eases toward the heading while moving; holds when standing, walking toward the camera, or just after orbit", () => {
    const h = 0.8;
    const y1 = followYaw(0, h, true, 5, 1 / 60);
    expect(y1).toBeGreaterThan(0);
    expect(y1).toBeLessThan(h);
    expect(followYaw(0, h, false, 5, 1 / 60)).toBe(0);
    expect(followYaw(0, Math.PI, true, 5, 1 / 60)).toBe(0);
    expect(followYaw(0, h, true, FOLLOW_HOLD_SECONDS - 0.01, 1 / 60)).toBe(0);
    // Takes the short way round across ±π.
    expect(followYaw(3.0, -3.0, true, 5, 0.1)).toBeGreaterThan(3.0);
    expect(angleDiff(3.0, -3.0)).toBeCloseTo(2 * Math.PI - 6, 9);
  });

  it("walking ahead brings the camera behind the back within about 1.5 s", () => {
    const cam = new FollowCamera();
    const heading = 1.0;
    for (let i = 0; i < 90; i++) cam.update("adult", focus, 1 / 60, heading, obs, true);
    expect(Math.abs(angleDiff(cam.yaw, heading))).toBeLessThan(0.02);
  });

  it("manual orbit overrides, then the camera eases back once the player walks after the hold", () => {
    const cam = new FollowCamera();
    cam.update("adult", focus, 1 / 60, 0, obs, false);
    cam.orbit(1.2);
    for (let i = 0; i < 30; i++) cam.update("adult", focus, 1 / 60, 0, obs, true); // 0.5 s: still held
    expect(cam.yaw).toBeCloseTo(1.2, 9);
    for (let i = 0; i < 60; i++) cam.update("adult", focus, 1 / 60, 0, obs, false); // standing: kept
    expect(cam.yaw).toBeCloseTo(1.2, 9);
    for (let i = 0; i < 120; i++) cam.update("adult", focus, 1 / 60, 0, obs, true);
    expect(Math.abs(cam.yaw)).toBeLessThan(0.05);
  });
});

describe("hat at the Duck model's socket (Req 6.5)", () => {
  it("copies the socket's world position and rotation, not only the position", () => {
    const duck = new Group();
    duck.position.set(4, 0.15, 5);
    duck.rotation.y = modelRotationY(1.1); // turned like a walking Duck
    const root = new Group();
    root.position.y = -0.15;
    const socket = new Object3D();
    socket.name = "socket_hat";
    socket.position.set(0, 0.28, 0.03);
    socket.rotation.x = 0.3; // head tilted in the model
    root.add(socket);
    duck.add(root);
    const hat = new Group();
    placeAtSocket(hat, socket);
    hat.updateMatrixWorld(true);
    const want = new Vector3();
    socket.getWorldPosition(want);
    expect(hat.position.distanceTo(want)).toBeLessThan(1e-9);
    const q = new Quaternion();
    socket.getWorldQuaternion(q);
    expect(Math.abs(hat.quaternion.dot(q))).toBeCloseTo(1, 9);
    expect(hat.quaternion.equals(new Quaternion())).toBe(false);
  });
});

describe("every pose FollowCamera.update returns is safe (Req 4.1, 4.2, 4.5)", () => {
  const obs = obstaclesFor(LEVEL, "locked");
  type Id = "duck" | "child" | "adult";
  const at = (id: Id, x: number, z: number) => ({ id, focus: { x, y: id === "duck" ? 0.15 : id === "child" ? 0.6 : 0.85, z } });
  const check = (id: Id, focus: { x: number; z: number }, eye: { x: number; y: number; z: number }) => {
    expect(eye.y).toBeLessThanOrEqual(CEILING_Y - 0.15 + 1e-9);
    for (const b of obs.boxes) expect(crosses(focus, eye, b)).toBe(false);
  };

  it("character switches across walls: sampled frames never look through a wall or the ceiling", () => {
    const pairs = [
      [at("duck", 4, 5), at("adult", 3, -2)], // bath → changing room (Codex repro a)
      [at("adult", 3, -2), at("child", 2.6, 1.6)], // changing room → bath
      [at("child", 2.6, 9.5), at("duck", -1.5, 5.5)], // sauna → inside the NarrowHole
      [at("duck", 28, 4), at("adult", 25.2, 3.6)], // pond → shore
    ] as const;
    for (const [a, b] of pairs) {
      const cam = new FollowCamera();
      for (let i = 0; i < 5; i++) cam.update(a.id, a.focus, 1 / 60, 0, obs);
      for (let i = 0; i < 40; i++) {
        const p = cam.update(b.id, b.focus, 1 / 60, 0.7, obs);
        check(b.id, b.focus, p.eye);
      }
    }
  });

  it("C to the overview and back cuts at once; no frame is above the ceiling", () => {
    const a = at("adult", 8, 4);
    const cam = new FollowCamera();
    for (let i = 0; i < 5; i++) cam.update(a.id, a.focus, 1 / 60, 0, obs);
    cam.toggleOverview();
    const o = cam.update(a.id, a.focus, 1 / 60, 0, obs);
    expect(o.eye.y).toBeGreaterThan(20); // the overview itself
    cam.toggleOverview(); // Codex repro b: 0.1 s later the eye was at 28.99 m
    for (let i = 0; i < 30; i++) check(a.id, a.focus, cam.update(a.id, a.focus, 1 / 60, 0, obs).eye);
  });
});
