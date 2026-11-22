import { Group, Object3D, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import * as R from "./helpers/route";
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
  clampPitch,
  PITCH_MAX,
  PITCH_MIN,
  bodyOpacity,
  cameraRelativeMove,
  clipSegment,
  FacingTracker,
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


/** Obstacles that block an eye at `eyeY` (full-height boxes plus low fixtures taller than the eye). */
const blockersAt = (obs: ReturnType<typeof obstaclesFor>, eyeY: number) => [
  ...obs.boxes,
  ...obs.low.filter((l) => l.top > eyeY - CAMERA_MARGIN).map((l) => l.box),
];

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
  const obs = obstaclesFor(LEVEL, { kidsGate: "closed", frontExit: "closed" });

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
    camera.update("adult", { x: 12, y: 0.85, z: 5 }, 1, obs);
    camera.lookAlong(CHECKPOINT_VIEW_YAW.start);
    const focus = { x: 4, y: 0.15, z: 5 };
    expect(camera.update("duck", focus, 1 / 60, obs))
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
    // Adult in the east aisle, back to the bath's rear wall (z = 9).
    const bath = LEVEL.zones.find((z) => z.id === "bath")!.box;
    const focus = { x: LEVEL.waypoints.eastAisle.x, y: 0.85, z: bath.maxZ - 0.5 };
    const p = shoulderPose("adult", focus, 0, obs);
    expect(p.eye.z).toBeLessThan(bath.maxZ - 0.1 - CAMERA_MARGIN + 1e-6);
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
    const W = LEVEL.waypoints;
    const g = LEVEL.crowdGaps[0]!.box;
    const at = (id: "duck" | "child" | "adult", q: { x: number; z: number }) => [id, q.x, q.z] as const;
    const spots = [
      at("duck", LEVEL.start), at("adult", { x: 1.4, z: 0.6 }), at("adult", W.receptionIn), at("adult", W.screenPassage),
      at("duck", W.troughGap), at("duck", W.milk1Swim), at("child", LEVEL.growthSpots.milk1), at("child", { x: 0.4, z: 5.6 }),
      at("child", W.milk2Stand), at("adult", LEVEL.growthSpots.milk2), at("adult", W.gateOut), at("adult", W.frontExitIn),
      at("child", { x: g.maxX + 0.4, z: (g.minZ + g.maxZ) / 2 }), at("adult", W.openAirIn), at("adult", W.gardenIn), at("child", W.bathMid),
    ];
    for (const [id, x, z] of spots) {
      for (let k = 0; k < 8; k++) {
        const yaw = (k * Math.PI) / 4;
        const p = shoulderPose(id, { x, y: 0.5, z }, yaw, obs);
        for (const b of blockersAt(obs, p.eye.y)) expect(crosses({ x, z }, p.eye, b)).toBe(false);
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
  const view = (stage: "duck" | "child" | "adult", x: number, z: number) =>
    ({
      active: stage,
      characters: {
        duck: { id: "duck", pos: { x, y: 0.15, z }, radius: CHARACTER_RADIUS.duck, height: 0.3, active: stage === "duck", visible: stage === "duck" },
        child: { id: "child", pos: { x, y: 0.6, z }, radius: 0.25, height: 1.2, active: stage === "child", visible: stage === "child" },
        adult: { id: "adult", pos: { x, y: 0.85, z }, radius: 0.35, height: 1.7, active: stage === "adult", visible: stage === "adult" },
      },
    }) as unknown as View;

  it("moving sets facing, standing keeps it, teleports are ignored, growth keeps the facing", () => {
    const f = new FacingTracker();
    f.update(view("duck", 4, 5));
    f.update(view("duck", 4.02, 5));
    expect(f.yaw("duck")).toBeCloseTo(Math.PI / 2, 9); // +X
    f.update(view("duck", 4.02, 5));
    expect(f.yaw("duck")).toBeCloseTo(Math.PI / 2, 9);
    f.update(view("duck", 20, 5));
    expect(f.yaw("duck")).toBeCloseTo(Math.PI / 2, 9);
    f.update(view("child", 20, 5)); // grew in place
    expect(f.yaw("child")).toBeCloseTo(Math.PI / 2, 9);
    expect(f.moving("child")).toBe(false);
    f.update(view("child", 20, 4.98));
    expect(f.yaw("adult")).toBeCloseTo(0, 9); // one shared facing (−Z)
  });

  it("a growth keeps the facing, even when the player is moved to the safe spot (review L-1)", () => {
    const f = new FacingTracker();
    f.update(view("child", 2.0, 3.5));
    f.update(view("child", 2.02, 3.5));
    expect(f.yaw("child")).toBeCloseTo(Math.PI / 2, 9);
    f.update(view("adult", 1.2, 3.75)); // grew and moved 0.85 m to the growth spot
    expect(f.yaw("adult")).toBeCloseTo(Math.PI / 2, 9);
    expect(f.moving("adult")).toBe(false);
    f.update(view("adult", 1.2, 3.73));
    expect(f.yaw("adult")).toBeCloseTo(0, 9);
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

describe("the camera yaw changes only by explicit input", () => {
  const obs = obstaclesFor(LEVEL, { kidsGate: "closed", frontExit: "closed" });
  const focus = { x: 8, y: 0.85, z: 4 };
  it("walking in any direction for seconds never turns the view, and growth keeps the angles", () => {
    const cam = new FollowCamera();
    cam.orbit(0.9);
    cam.tilt(0.2);
    for (let i = 0; i < 300; i++) cam.update("adult", { x: 20 + i * 0.01, y: 0.85, z: 4 }, 1 / 60, obs);
    expect(cam.yaw).toBe(0.9);
    expect(cam.pitch).toBe(0.2);
    cam.update("child", focus, 1 / 60, obs); // a stage change blends the profile only
    expect(cam.yaw).toBe(0.9);
    expect(cam.pitch).toBe(0.2);
    expect(cam.moveYaw).toBe(0.9);
  });
  it("pitch is bounded, recenter levels it and takes the given yaw, a checkpoint reset clears it", () => {
    const cam = new FollowCamera();
    cam.tilt(5);
    expect(cam.pitch).toBe(PITCH_MAX);
    cam.tilt(-50);
    expect(cam.pitch).toBe(PITCH_MIN);
    cam.orbit(2);
    cam.recenter(0.4);
    expect([cam.yaw, cam.pitch]).toEqual([0.4, 0]);
    cam.tilt(0.3);
    cam.lookAlong(0);
    expect(cam.pitch).toBe(0);
    expect(clampPitch(Number.NaN)).toBe(0);
  });
  it("pitch moves only the look-at point; the eye keeps its wall, ceiling and hole safety", () => {
    const cases = [
      { id: "adult" as const, f: { x: 1.5, y: 0.85, z: -3.0 } },
      { id: "duck" as const, f: { x: -1.5, y: 0.15, z: 8.5 } }, // inside the NarrowHole
      { id: "child" as const, f: { x: 15.0, y: 0.6, z: 1.9 } },
    ];
    for (const { id, f } of cases) {
      for (let yaw = -3; yaw <= 3; yaw += 0.5) {
        const flat = shoulderPose(id, f, yaw, obs, 0);
        for (const pitch of [PITCH_MIN, PITCH_MAX]) {
          const p = shoulderPose(id, f, yaw, obs, pitch);
          expect(p.eye).toEqual(flat.eye);
          expect(p.eye.y).toBeLessThanOrEqual(CEILING_Y - 0.15 + 1e-9);
          for (const b of blockersAt(obs, p.eye.y)) expect(crosses(f, p.eye, b)).toBe(false);
        }
        expect(shoulderPose(id, f, yaw, obs, PITCH_MAX).target.y).toBeGreaterThan(flat.target.y);
        expect(shoulderPose(id, f, yaw, obs, PITCH_MIN).target.y).toBeLessThan(flat.target.y);
      }
    }
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
  const obs = obstaclesFor(LEVEL, { kidsGate: "closed", frontExit: "closed" });
  type Id = "duck" | "child" | "adult";
  const at = (id: Id, x: number, z: number) => ({ id, focus: { x, y: id === "duck" ? 0.15 : id === "child" ? 0.6 : 0.85, z } });
  const check = (id: Id, focus: { x: number; z: number }, eye: { x: number; y: number; z: number }) => {
    expect(eye.y).toBeLessThanOrEqual(CEILING_Y - 0.15 + 1e-9);
    for (const b of blockersAt(obs, eye.y)) expect(crosses(focus, eye, b)).toBe(false);
  };

  it("character switches across walls: sampled frames never look through a wall or the ceiling", () => {
    const pairs = [
      [at("duck", 6.0, 6.8), at("adult", 1.5, -3.0)], // bath → changing room (Codex repro a)
      [at("adult", 1.5, -3.0), at("child", 1.6, 1.4)], // changing room → bath
      [at("child", 15.0, 1.9), at("duck", -1.5, 8.5)], // sauna → inside the NarrowHole
      [at("duck", 24, 8), at("adult", 21.8, 7.6)], // pond → garden
    ] as const;
    for (const [a, b] of pairs) {
      const cam = new FollowCamera();
      for (let i = 0; i < 5; i++) cam.update(a.id, a.focus, 1 / 60, obs);
      for (let i = 0; i < 40; i++) {
        const p = cam.update(b.id, b.focus, 1 / 60, obs);
        check(b.id, b.focus, p.eye);
      }
    }
  });

  it("C to the overview and back cuts at once; no frame is above the ceiling", () => {
    const a = at("adult", 8, 4);
    const cam = new FollowCamera();
    for (let i = 0; i < 5; i++) cam.update(a.id, a.focus, 1 / 60, obs);
    cam.toggleOverview();
    const o = cam.update(a.id, a.focus, 1 / 60, obs);
    expect(o.eye.y).toBeGreaterThan(20); // the overview itself
    cam.toggleOverview(); // Codex repro b: 0.1 s later the eye was at 28.99 m
    for (let i = 0; i < 30; i++) check(a.id, a.focus, cam.update(a.id, a.focus, 1 / 60, obs).eye);
  });
});

describe("movement direction follows the manual view (review N-1 redesign)", () => {
  const obs = obstaclesFor(LEVEL, { kidsGate: "closed", frontExit: "closed" });
  /** Walk in open space with a key held, like main.ts does, for `frames` frames. */
  function walk(key: { x: number; z: number }, frames: number, cam = new FollowCamera()) {
    let pos = { x: 20, z: 4 }; // open-air bath, no walls near
    const dirs: number[] = [];
    for (let i = 0; i < frames; i++) {
      const m = cameraRelativeMove(key, cam.moveYaw);
      pos = { x: pos.x + m.x * 0.04, z: pos.z + m.z * 0.04 };
      dirs.push(yawFromDirection(m));
      cam.update("adult", { x: pos.x, y: 0.85, z: pos.z }, 1 / 60, obs);
    }
    return { cam, dirs };
  }
  const span = (a: number[]) => Math.max(...a) - Math.min(...a);
  it("holding D walks one straight line, and releasing then pressing D again goes the same way", () => {
    const { cam, dirs } = walk(D, 600);
    expect(span(dirs)).toBeLessThan(1e-9);
    const again = walk(D, 10, cam);
    expect(Math.abs(angleDiff(again.dirs[0]!, dirs[0]!))).toBeLessThan(1e-9);
    expect(cam.yaw).toBe(0);
  });
  it("only an explicit turn changes where W goes", () => {
    const cam = new FollowCamera();
    close(cameraRelativeMove(W, cam.moveYaw), forwardOf(0));
    cam.orbit(0.6);
    close(cameraRelativeMove(W, cam.moveYaw), forwardOf(0.6));
    cam.recenter(1.5);
    close(cameraRelativeMove(W, cam.moveYaw), forwardOf(1.5));
  });
  it("a checkpoint load drops stale yaw, pitch and facing", () => {
    const { cam } = walk(D, 300);
    cam.tilt(0.4);
    cam.lookAlong(CHECKPOINT_VIEW_YAW.start);
    expect(cam.yaw).toBe(-Math.PI / 2);
    expect(cam.moveYaw).toBe(-Math.PI / 2);
    expect(cam.pitch).toBe(0);
    const f = new FacingTracker();
    f.lookAlong(CHECKPOINT_VIEW_YAW.adultGrown);
    expect(f.yaw("adult")).toBe(0);
    expect(f.moving("duck")).toBe(false);
  });
  it("the start view looks west along the tub toward the trough; growth checkpoints look north", () => {
    const d0 = LEVEL.start;
    const p = shoulderPose("duck", { x: d0.x, y: 0.15, z: d0.z }, CHECKPOINT_VIEW_YAW.start, obs);
    expect(p.target.x).toBeLessThan(d0.x); // looks toward −X
    expect(CHECKPOINT_VIEW_YAW.childGrown).toBe(0);
    expect(CHECKPOINT_VIEW_YAW.adultGrown).toBe(0);
    expect(nearCameraOpacity(0.3)).toBe(0.15);
    expect(nearCameraOpacity(2)).toBe(1);
  });

  it("the sauna door view stays in the bath, with the high doors closed or open", () => {
    for (const d of ["closed", "open"] as const) {
      const o = obstaclesFor(LEVEL, { kidsGate: d, frontExit: d });
      const f = LEVEL.waypoints.saunaDoorDry;
      const p = shoulderPose("child", { x: f.x, y: 0.6, z: f.z }, Math.PI / 2, o); // facing +X, the door
      expect(p.eye.x).toBeLessThan(12 - 0.1);
      for (const b of blockersAt(o, p.eye.y)) expect(crosses(f, p.eye, b)).toBe(false);
    }
  });
});

describe("review round 3: N-4 orbit steers a walk, N-6 Adult hiding Child", () => {
  const obs = obstaclesFor(LEVEL, { kidsGate: "closed", frontExit: "closed" });

  it("a body between the camera and the player fades (N-6; the guardian beside the kids' corner)", () => {
    const c = { x: 3.1, z: 6.0 }; // a player south of the guardian's room spot, looking north
    const a = { x: 3.1, z: 6.8 }; // body right behind, near the lens
    const p = shoulderPose("child", { x: c.x, y: 0.6, z: c.z }, 0, obs);
    expect(bodyOpacity(p.eye, c, a, CHARACTER_RADIUS.adult)).toBeLessThanOrEqual(0.3);
    // A body off to the side and far from the lens stays solid.
    expect(bodyOpacity({ x: 0, z: 0 }, { x: 0, z: -4 }, { x: 3, z: -2 }, 0.35)).toBe(1);
  });
});
