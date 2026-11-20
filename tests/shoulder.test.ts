import { Group, Object3D, PerspectiveCamera, Quaternion, Vector3 } from "three";
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
  CHECKPOINT_VIEW_YAW,
  angleDiff,
  bodyOpacity,
  cameraRelativeMove,
  clipSegment,
  FacingTracker,
  FOLLOW_HOLD_SECONDS,
  followYaw,
  forwardOf,
  HOLE_LID_Y,
  modelRotationY,
  nearCameraOpacity,
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

  it("frames the carried Duck and hat at their actual elevated model center", () => {
    const focus = { x: 20.24, y: 1.05, z: 3.8 };
    const pose = shoulderPose("duck", focus, 0, obs);
    expect(pose.eye.y).toBeCloseTo(1.32, 8);
    const camera = new PerspectiveCamera(55, 1280 / 720, 0.05, 200);
    camera.position.set(pose.eye.x, pose.eye.y, pose.eye.z);
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
    camera.updateMatrixWorld();
    for (const y of [0.90, 1.05, 1.20, 1.31]) {
      const projected = new Vector3(focus.x, y, focus.z).project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(1);
      expect(Math.abs(projected.y)).toBeLessThan(1);
      expect(projected.z).toBeGreaterThan(-1);
      expect(projected.z).toBeLessThan(1);
    }
  });

  it("checkpoint reset discards the old pose before the first update, even when active character changes", () => {
    const camera = new FollowCamera();
    camera.update("adult", { x: 12, y: 0.85, z: 5 }, 1, 0, obs);
    camera.lookAlong(CHECKPOINT_VIEW_YAW.start);
    const focus = { x: 4, y: 0.15, z: 5 };
    expect(camera.update("duck", focus, 1 / 60, CHECKPOINT_VIEW_YAW.start, obs))
      .toEqual(shoulderPose("duck", focus, CHECKPOINT_VIEW_YAW.start, obs));
  });

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

describe("held A/D with the follow camera is stable (review N-1)", () => {
  const obs = obstaclesFor(LEVEL, "locked");
  /** Walk in open space with keys held, like main.ts does each frame. */
  function walk(keys: { x: number; z: number }[], frames: number[], cam = new FollowCamera()) {
    let pos = { x: 20, z: 4 }; // open-air bath, no walls near (camera clip irrelevant here)
    let heading = cam.yaw;
    const yaws: number[] = [];
    const dirs: number[] = [];
    keys.forEach((k, seg) => {
      for (let i = 0; i < (frames[seg] ?? 0); i++) {
        cam.setMoveHeld(true);
        const m = cameraRelativeMove(k, cam.moveYaw);
        pos = { x: pos.x + m.x * 0.04, z: pos.z + m.z * 0.04 };
        heading = yawFromDirection(m);
        dirs.push(heading);
        cam.update("adult", { x: pos.x, y: 0.85, z: pos.z }, 1 / 60, heading, obs, true);
        yaws.push(cam.yaw);
      }
    });
    return { cam, yaws, dirs };
  }
  const span = (a: number[]) => Math.max(...a) - Math.min(...a);

  it("holding D walks straight and the camera settles behind, without spinning", () => {
    const { yaws, dirs } = walk([D], [600]);
    expect(span(dirs)).toBeLessThan(1e-9); // straight line
    expect(span(yaws)).toBeLessThan(Math.PI / 2 + 1e-6); // turned at most a quarter, never round and round
    expect(Math.abs(angleDiff(yaws.at(-1)!, dirs.at(-1)!))).toBeLessThan(0.02); // ends behind the back
  });

  it("holding A behaves the same, mirrored", () => {
    const { yaws, dirs } = walk([{ x: -1, z: 0 }], [600]);
    expect(span(dirs)).toBeLessThan(1e-9);
    expect(Math.abs(angleDiff(yaws.at(-1)!, dirs.at(-1)!))).toBeLessThan(0.02);
    expect(Math.abs(angleDiff(0, yaws.at(-1)!))).toBeCloseTo(Math.PI / 2, 2);
  });

  it("W, then W+D held: one bounded turn, then straight", () => {
    const diag = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };
    const { yaws, dirs } = walk([W, diag], [120, 600]);
    expect(span(dirs.slice(120))).toBeLessThan(1e-9);
    expect(span(yaws)).toBeLessThan(Math.PI / 4 + 1e-6);
  });

  it("releasing the keys latches the new view: W then goes where the camera now looks", () => {
    const { cam } = walk([D], [300]);
    cam.setMoveHeld(false);
    cam.setMoveHeld(true);
    close(cameraRelativeMove(W, cam.moveYaw), forwardOf(cam.yaw));
  });

  it("a checkpoint load drops stale yaw, latch and facing", () => {
    const { cam } = walk([D], [300]);
    cam.lookAlong(CHECKPOINT_VIEW_YAW.start);
    expect(cam.yaw).toBe(-Math.PI / 2);
    expect(cam.moveYaw).toBe(-Math.PI / 2);
    const f = new FacingTracker();
    f.lookAlong(CHECKPOINT_VIEW_YAW.duckInPond);
    expect(f.yaw("duck")).toBe(Math.PI / 2);
    expect(f.moving("duck")).toBe(false);
  });

  it("the start view looks toward the NarrowHole; a human beside the lens is faded (D-1)", () => {
    const p = shoulderPose("duck", { x: 4, y: 0.15, z: 5 }, CHECKPOINT_VIEW_YAW.start, obs);
    expect(p.target.x).toBeLessThan(4); // looks toward −X (the hole)
    for (const id of ["child", "adult"] as const) {
      const h = LEVEL.initialPositions[id];
      const toHuman = { x: h.x - p.eye.x, z: h.z - p.eye.z };
      const ahead = forwardOf(CHECKPOINT_VIEW_YAW.start);
      const inFront = toHuman.x * ahead.x + toHuman.z * ahead.z > 0.3;
      if (inFront) expect(nearCameraOpacity(Math.hypot(toHuman.x, toHuman.z))).toBeLessThan(0.5);
    }
    expect(nearCameraOpacity(0.3)).toBe(0.15);
    expect(nearCameraOpacity(2)).toBe(1);
  });

  it("the sauna door view (Child unlocking) stays in the bath, locked or unlocked", () => {
    for (const door of ["locked", "unlocked"] as const) {
      const o = obstaclesFor(LEVEL, door);
      const p = shoulderPose("child", { x: 2.6, y: 0.6, z: 7.4 }, Math.PI, o); // facing +Z, the door
      expect(p.eye.z).toBeLessThan(8 - 0.1);
      for (const b of o.boxes) expect(crosses({ x: 2.6, z: 7.4 }, p.eye, b)).toBe(false);
    }
  });
});

describe("review round 3: N-4 orbit steers a walk, N-6 Adult hiding Child", () => {
  const obs = obstaclesFor(LEVEL, "locked");

  it("orbit while a move key is held turns the walk with the camera (N-4)", () => {
    const cam = new FollowCamera();
    cam.setMoveHeld(true);
    const before = cameraRelativeMove(W, cam.moveYaw);
    cam.orbit(0.6);
    close(cameraRelativeMove(W, cam.moveYaw), forwardOf(0.6));
    expect(before.x).toBeCloseTo(0, 9);
    // The automatic follow still does not touch the latch (N-1 stays fixed).
    for (let i = 0; i < 200; i++) cam.update("adult", { x: 20, y: 0.85, z: 4 }, 1 / 60, 1.5, obs, true);
    expect(cam.moveYaw).toBeCloseTo(0.6, 9);
  });

  it("at the start, Adult standing between the camera and Child fades (N-6)", () => {
    const c = LEVEL.initialPositions.child;
    const a = LEVEL.initialPositions.adult;
    const p = shoulderPose("child", { x: c.x, y: 0.6, z: c.z }, CHECKPOINT_VIEW_YAW.start, obs);
    expect(bodyOpacity(p.eye, c, a, CHARACTER_RADIUS.adult)).toBeLessThanOrEqual(0.3);
    // A body off to the side and far from the lens stays solid.
    expect(bodyOpacity({ x: 0, z: 0 }, { x: 0, z: -4 }, { x: 3, z: -2 }, 0.35)).toBe(1);
  });
});
