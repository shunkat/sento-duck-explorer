import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Vec2 } from "../src/core/types";
import * as THREE from "three";
import { segmentBlocked } from "../src/core/actions";
import { CHARACTER_RADIUS, LEVEL } from "../src/level/layout";
import { box, circleOverlapsBox, distance } from "../src/sim/geometry";
import { inBathWater, zoneAt } from "../src/sim/zones";
import { BathVisitors, BATH_VISITORS, SURPRISE_RADIUS, SURPRISE_SECONDS } from "../src/view/bathVisitors";
import { ModelLibrary } from "../src/view/models";

function body() {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(.55, 1.6, .32), new THREE.MeshStandardMaterial({ color: 0xf0b697 }));
  mesh.position.y = .8;
  root.add(mesh);
  return root;
}
async function library() {
  const lib = new ModelLibrary({ loadAsync: async () => ({ scene: body() }), parseAsync: async () => ({ scene: body() }) });
  for (const id of ["npc_bath_standing", "npc_bath_standing_lod_far"]) await lib.load(id, id);
  return lib;
}
function slot(root: THREE.Object3D, id: string) {
  return root.getObjectByName(`bath_visitor_${id}`)!;
}
function pose(root: THREE.Object3D) {
  const pivot = root.getObjectByName("reaction")!;
  return [root.position.toArray(), root.quaternion.toArray(), pivot.position.toArray(), pivot.quaternion.toArray()];
}

function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const length2 = dx * dx + dz * dz;
  const t = length2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}

describe("bath visitors", () => {
  it("places four human visitors on clear bath floor, away from water and fixed obstacles", () => {
    expect(BATH_VISITORS).toHaveLength(4);
    expect(new Set(BATH_VISITORS.map((v) => v.id)).size).toBe(4);
    for (const visitor of BATH_VISITORS) {
      expect(zoneAt(LEVEL, visitor.pos)).toBe("bath");
      expect(inBathWater(LEVEL, visitor.pos)).toBe(false);
      expect(LEVEL.walls.some((w) => circleOverlapsBox(visitor.pos, CHARACTER_RADIUS.adult, w))).toBe(false);
      expect(LEVEL.duckWater.some((w) => circleOverlapsBox(visitor.pos, CHARACTER_RADIUS.adult, w))).toBe(false);
    }
  });

  it("leaves full adult-body clearance along guardian and recommended player routes", () => {
    const W = LEVEL.waypoints;
    const playerPaths: readonly (readonly Vec2[])[] = [
      [W.milk1Swim, W.passageSouth, W.passageNorth, W.gateIn, W.gateOut],
      [W.gateOut, { x: 3.1, z: 2.3 }, W.bathMid, W.saunaDoorDry, W.saunaIn, W.saunaMilkStand],
      [W.bathAisle, W.bathMid], [W.bathAisle, W.tubNorth],
      [W.bathMid, W.tubNorth, W.eastAisle, W.openAirDoorBath, W.openAirIn],
      [W.gateOut, W.bathDoorDry, W.changingIn],
    ];
    const clearance = CHARACTER_RADIUS.adult * 2;
    for (const visitor of BATH_VISITORS) {
      for (const path of [LEVEL.guardianPath, ...playerPaths]) {
        for (let i = 1; i < path.length; i++) {
          expect(segmentDistance(visitor.pos, path[i - 1]!, path[i]!), `${visitor.id}: ${JSON.stringify(path[i - 1])} → ${JSON.stringify(path[i])}`).toBeGreaterThanOrEqual(clearance);
        }
      }
      for (const other of BATH_VISITORS) {
        if (other.id !== visitor.id) expect(distance(visitor.pos, other.pos)).toBeGreaterThanOrEqual(clearance);
      }
    }
  });

  it("recoils away from growth and the real pool-observer model stays clear of the guardian", async () => {
    const bytes = readFileSync(new URL("../public/models/npc_bath_standing.glb", import.meta.url));
    // Real exported geometry and nodes; only browser image decoding is stubbed.
    const loader = new GLTFLoader().register(() => ({ name: "visitor_bounds_skip_images", loadTexture: async () => new THREE.Texture() }));
    const lib = new ModelLibrary(loader);
    await lib.parse("npc_bath_standing", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(lib.get("npc_bath_standing")).toBeTruthy();
    const root = new THREE.Group();
    const visitors = new BathVisitors(root, LEVEL);
    visitors.use(lib);
    const observer = slot(root, "pool");
    const pivot = observer.getObjectByName("reaction")!;
    const growth = LEVEL.waypoints.milk1Swim;
    const toward = new THREE.Vector3(growth.x - observer.position.x, 0, growth.z - observer.position.z).normalize();
    visitors.onGrowth(growth, 2);
    visitors.update(2);
    root.updateMatrixWorld(true);
    const beforeHead = pivot.localToWorld(new THREE.Vector3(0, 1.5, 0));
    visitors.update(2.2);
    root.updateMatrixWorld(true);
    const movedHead = pivot.localToWorld(new THREE.Vector3(0, 1.5, 0));
    expect(movedHead.clone().sub(beforeHead).dot(toward)).toBeLessThan(0);
    const model = observer.getObjectByName("visitor_high")!;
    for (const elapsed of [0, .09, .18, .3, .55, 1.2, SURPRISE_SECONDS]) {
      visitors.update(2 + elapsed);
      const bounds = new THREE.Box3().setFromObject(model, true);
      const footprint = box(bounds.min.x, bounds.min.z, bounds.max.x, bounds.max.z);
      for (let i = 1; i < LEVEL.guardianPath.length; i++) {
        const a = LEVEL.guardianPath[i - 1]!, b = LEVEL.guardianPath[i]!;
        for (let fraction = 0; fraction <= 1; fraction += .02) {
          const p = { x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction };
          expect(circleOverlapsBox(p, CHARACTER_RADIUS.adult, footprint), `reaction ${elapsed}s guardian ${JSON.stringify(p)}`).toBe(false);
        }
      }
    }
  });

  it("the startled tub observer stays clear of the Adult's diagonal aisle with both real model details", async () => {
    const loader = new GLTFLoader().register(() => ({ name: "tub_visitor_skip_images", loadTexture: async () => new THREE.Texture() }));
    const lib = new ModelLibrary(loader);
    for (const id of ["npc_bath_standing", "npc_bath_standing_lod_far"]) {
      const bytes = readFileSync(new URL(`../public/models/${id}.glb`, import.meta.url));
      await lib.parse(id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      expect(lib.get(id)).toBeTruthy();
    }
    const root = new THREE.Group();
    const visitors = new BathVisitors(root, LEVEL);
    visitors.use(lib);
    visitors.onGrowth(LEVEL.growthSpots.milk1, 3);
    const tub = slot(root, "tub");
    const a = LEVEL.waypoints.bathMid, b = LEVEL.waypoints.tubNorth;
    for (const elapsed of [.18, .4, .55]) {
      visitors.update(3 + elapsed);
      for (const detail of ["visitor_high", "visitor_far"]) {
        const bounds = new THREE.Box3().setFromObject(tub.getObjectByName(detail)!, true);
        const footprint = box(bounds.min.x, bounds.min.z, bounds.max.x, bounds.max.z);
        for (let fraction = 0; fraction <= 1; fraction += .01) {
          const p = { x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction };
          expect(circleOverlapsBox(p, CHARACTER_RADIUS.adult, footprint), `${detail} reaction ${elapsed}s at ${JSON.stringify(p)}`).toBe(false);
        }
      }
    }
  });

  it("reacts near growth, ignores distant visitors and returns to the exact resting pose", () => {
    const root = new THREE.Group();
    const visitors = new BathVisitors(root, LEVEL);
    const near = BATH_VISITORS[0]!;
    const growth = [{ x: near.pos.x + .7, z: near.pos.z }, { x: near.pos.x, z: near.pos.z + .7 }, { x: near.pos.x - .7, z: near.pos.z }]
      .find((p) => !segmentBlocked(near.pos, p, LEVEL.walls))!;
    const far = BATH_VISITORS.find((v) => distance(v.pos, growth) > SURPRISE_RADIUS)!;
    expect(far).toBeTruthy();
    const resting = BATH_VISITORS.map((v) => pose(slot(root, v.id)));
    visitors.onGrowth(growth, 10);
    visitors.update(10.2);
    expect(pose(slot(root, near.id))).not.toEqual(resting[0]);
    expect(pose(slot(root, far.id))).toEqual(resting[BATH_VISITORS.indexOf(far)]);
    visitors.update(10 + SURPRISE_SECONDS + .1);
    BATH_VISITORS.forEach((v, i) => expect(pose(slot(root, v.id))).toEqual(resting[i]));
  });

  it("the pool observer sees actual Child growth above the low kids partition", () => {
    const root = new THREE.Group();
    const visitors = new BathVisitors(root, LEVEL);
    const before = pose(slot(root, "pool"));
    visitors.onGrowth(LEVEL.growthSpots.milk2, 2);
    visitors.update(2.2);
    expect(pose(slot(root, "pool"))).not.toEqual(before);
  });

  it("a wall blocks surprise even when growth is within hearing range", () => {
    const near = BATH_VISITORS[0]!;
    const growth = { x: near.pos.x + 1, z: near.pos.z };
    const wall = box(near.pos.x + .45, near.pos.z - 1, near.pos.x + .55, near.pos.z + 1);
    const root = new THREE.Group();
    const visitors = new BathVisitors(root, { ...LEVEL, walls: [...LEVEL.walls, wall] });
    const before = pose(slot(root, near.id));
    visitors.onGrowth(growth, 10);
    visitors.update(10.2);
    expect(pose(slot(root, near.id))).toEqual(before);
  });

  it("reset clears active reactions immediately and they stay cleared", () => {
    const root = new THREE.Group();
    const visitors = new BathVisitors(root, LEVEL);
    const v = BATH_VISITORS[0]!;
    const before = pose(slot(root, v.id));
    visitors.onGrowth(v.pos, 4);
    visitors.update(4.2);
    expect(pose(slot(root, v.id))).not.toEqual(before);
    visitors.reset();
    expect(pose(slot(root, v.id))).toEqual(before);
    visitors.update(4.3);
    expect(pose(slot(root, v.id))).toEqual(before);
  });

  it("installs independent model clones once and never animates the library source", async () => {
    const root = new THREE.Group();
    const visitors = new BathVisitors(root, LEVEL);
    const lib = await library();
    const source = lib.get("npc_bath_standing")!.root;
    const original = source.toJSON();
    visitors.use(lib);
    visitors.use(lib);
    for (const v of BATH_VISITORS) {
      const group = slot(root, v.id);
      const high = group.getObjectByName("visitor_high")!;
      const far = group.getObjectByName("visitor_far")!;
      expect(high).toBeTruthy();
      expect(far).toBeTruthy();
      expect(high).not.toBe(source);
      expect(high.children[0]).not.toBe(source.children[0]);
      expect((high.children[0] as THREE.Mesh).geometry).toBe((source.children[0] as THREE.Mesh).geometry);
      expect(group.getObjectByName("reaction")!.children.filter((o) => o.name === "visitor_high")).toHaveLength(1);
    }
    visitors.onGrowth(BATH_VISITORS[0]!.pos, 0);
    visitors.update(.3);
    expect(source.toJSON()).toEqual(original);
    expect(source.parent).toBeNull();
  });

  it("shows at most two nearby detailed bodies and exactly one body per visitor; overview uses far models", async () => {
    const root = new THREE.Group();
    const visitors = new BathVisitors(root, LEVEL);
    visitors.use(await library());
    for (const eye of [new THREE.Vector3(6, 1.6, 4), new THREE.Vector3(30, 1.6, 20)]) {
      visitors.updateDetail(eye, false);
      let detailed = 0;
      for (const v of BATH_VISITORS) {
        const group = slot(root, v.id);
        const high = group.getObjectByName("visitor_high")!;
        const far = group.getObjectByName("visitor_far")!;
        expect(Number(high.visible) + Number(far.visible)).toBe(1);
        if (high.visible) detailed++;
      }
      expect(detailed).toBeLessThanOrEqual(2);
      if (eye.x > 20) expect(detailed).toBe(0);
    }
    visitors.updateDetail(new THREE.Vector3(6, 20, 4), true);
    for (const v of BATH_VISITORS) {
      expect(slot(root, v.id).getObjectByName("visitor_high")!.visible).toBe(false);
      expect(slot(root, v.id).getObjectByName("visitor_far")!.visible).toBe(true);
    }
  });
});
