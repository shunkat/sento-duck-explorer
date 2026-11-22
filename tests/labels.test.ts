import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { LEVEL } from "../src/level/layout";
import { OVERVIEW } from "../src/view/camera";
import { BODY_HEIGHT } from "../src/view/deriveView";
import { CAMERA_PROFILE } from "../src/view/shoulder";
import {
  CHARACTER_LABEL_GAP,
  declutter,
  LABEL_PRIORITY,
  type ScreenRect,
  LABEL_CANVAS_H,
  LABEL_CENTER_Y,
  LABEL_MAX_PX,
  LABEL_MIN_PX,
  LABEL_TEXT_PX,
  type LabelKind,
  labelPixelHeight,
  labelWorldHeight,
  worldHeightForPixels,
  zoneLabelAnchor,
} from "../src/view/labels";

const KINDS: LabelKind[] = ["character", "zone", "item", "fixture"];

describe("label screen size (Chrome feedback: labels covered the screen in Duck's view)", () => {
  it("keeps off-axis rendered size equal to the declutter size", () => {
    const camera = new PerspectiveCamera(55, 1280 / 720, 0.05, 200);
    camera.updateMatrixWorld();
    for (const x of [0, 2.3, 2.8, 3]) {
      const at = new Vector3(x, 0, -4);
      const wanted = labelPixelHeight("character", at.length());
      const canvasPx = wanted * LABEL_CANVAS_H / LABEL_TEXT_PX;
      const h = labelWorldHeight(canvasPx, at, camera, 720)!;
      const top = at.clone().add(new Vector3(0, h / 2, 0)).project(camera);
      const bottom = at.clone().add(new Vector3(0, -h / 2, 0)).project(camera);
      const actualCanvasPx = (top.y - bottom.y) * 720 / 2;
      expect(actualCanvasPx).toBeCloseTo(canvasPx, 8);
      expect(actualCanvasPx * LABEL_TEXT_PX / LABEL_CANVAS_H).toBeCloseTo(wanted, 8);
    }
  });

  it("excludes labels behind the camera or outside its near/far depth", () => {
    const camera = new PerspectiveCamera(55, 1, 0.05, 200);
    camera.position.set(2, 1, 3);
    camera.lookAt(3, 1, 3);
    camera.updateMatrixWorld();
    expect(labelWorldHeight(20, new Vector3(1, 1, 3), camera, 720)).toBeNull();
    expect(labelWorldHeight(20, new Vector3(2.01, 1, 3), camera, 720)).toBeNull();
    expect(labelWorldHeight(20, new Vector3(203, 1, 3), camera, 720)).toBeNull();
    expect(labelWorldHeight(20, new Vector3(6, 1, 3), camera, 720)).not.toBeNull();
  });

  it("stays within 12–22 px at any distance", () => {
    for (const kind of KINDS) {
      for (const d of [0.01, 0.3, 0.8, 1.5, 3, 6, 12, 25, 45, 100]) {
        const px = labelPixelHeight(kind, d);
        expect(px).toBeGreaterThanOrEqual(LABEL_MIN_PX);
        expect(px).toBeLessThanOrEqual(LABEL_MAX_PX[kind]);
        expect(px).toBeLessThanOrEqual(22);
      }
    }
  });

  it("does not grow when the camera comes closer than full-size distance", () => {
    expect(labelPixelHeight("zone", 0.5)).toBe(labelPixelHeight("zone", 3));
    expect(labelPixelHeight("zone", 20)).toBeLessThan(labelPixelHeight("zone", 5));
  });

  it("Duck's eye-line distance gives a capped size, the overview keeps the minimum", () => {
    const duckDist = Math.hypot(CAMERA_PROFILE.duck.dist, CAMERA_PROFILE.duck.eye);
    expect(labelPixelHeight("character", duckDist)).toBe(22);
    const overviewDist = OVERVIEW.eye.y;
    expect(labelPixelHeight("zone", overviewDist)).toBe(LABEL_MIN_PX);
  });

  it("world height maps back to the requested pixels", () => {
    const fov = 55;
    const viewport = 900;
    for (const d of [0.5, 2, 10, 40]) {
      const h = worldHeightForPixels(20, d, fov, viewport);
      const visible = 2 * d * Math.tan((fov * Math.PI) / 360);
      expect((h / visible) * viewport).toBeCloseTo(20, 9);
    }
    // Close labels get a small world size, so they cannot cover the screen.
    expect(worldHeightForPixels(22, 0.6, fov, viewport)).toBeLessThan(0.02);
  });
});

describe("overview labels do not hide the characters (browser pilot: C view hid 子ども/大人/湯船)", () => {
  it("character labels end above their bodies, and the 湯船 label clears Duck at the start", () => {
    const vh = 657;
    const cam = new PerspectiveCamera(55, 1280 / vh, 0.05, 200);
    cam.position.set(OVERVIEW.eye.x, OVERVIEW.eye.y, OVERVIEW.eye.z);
    cam.lookAt(OVERVIEW.target.x, OVERVIEW.target.y, OVERVIEW.target.z);
    cam.updateMatrixWorld();
    const screenY = (v: Vector3) => ((1 - v.clone().project(cam).y) / 2) * vh;
    const labelPx = (kind: LabelKind, at: Vector3) =>
      (labelPixelHeight(kind, at.distanceTo(cam.position)) * LABEL_CANVAS_H) / LABEL_TEXT_PX;
    for (const id of ["duck", "child", "adult"] as const) {
      const p = LEVEL.start; // every stage body is drawn at the player
      const h = BODY_HEIGHT[id];
      const bodyTop = screenY(new Vector3(p.x, h, p.z));
      const anchor = new Vector3(p.x, h + CHARACTER_LABEL_GAP, p.z);
      const labelBottom = screenY(anchor) + LABEL_CENTER_Y.character * labelPx("character", anchor);
      expect(labelBottom).toBeLessThanOrEqual(bodyTop);
    }
    const bath = LEVEL.zones.find((z) => z.id === "bathwater")!;
    const a = zoneLabelAnchor(bath.id, bath.box);
    const at = new Vector3(a.x, a.y, a.z);
    const h = labelPx("zone", at);
    const zoneTop = screenY(at) - (1 - LABEL_CENTER_Y.zone) * h;
    const zoneBottom = screenY(at) + LABEL_CENTER_Y.zone * h;
    const duck = LEVEL.start;
    const duckTop = screenY(new Vector3(duck.x, BODY_HEIGHT.duck, duck.z));
    const duckBottom = screenY(new Vector3(duck.x, 0, duck.z));
    expect(zoneTop > duckBottom || zoneBottom < duckTop).toBe(true);
  });
});

describe("label declutter (review D-4, N-5)", () => {
  const r = (x: number, y: number, priority: number): ScreenRect => ({ x0: x, y0: y, x1: x + 60, y1: y + 20, priority });

  it("the higher-priority label stays in place; the other moves aside instead of vanishing", () => {
    // zone first in the input, active character second: the character keeps its spot.
    const [zone, char] = declutter([r(0, 0, LABEL_PRIORITY.zone), r(10, 5, LABEL_PRIORITY.active)]);
    expect(char).toEqual({ show: true, dy: 0 });
    expect(zone!.show).toBe(true);
    expect(zone!.dy).not.toBe(0);
    expect(declutter([r(0, 0, LABEL_PRIORITY.zone), r(200, 0, LABEL_PRIORITY.fixture)])).toEqual([
      { show: true, dy: 0 },
      { show: true, dy: 0 },
    ]);
  });

  it("orders: controlled character > key items > other characters > fixtures > rooms", () => {
    const p = LABEL_PRIORITY;
    expect(p.active).toBeLessThan(p.item);
    expect(p.item).toBeLessThan(p.character);
    expect(p.character).toBeLessThan(p.fixture);
    expect(p.fixture).toBeLessThan(p.zone);
    const out = declutter([r(0, 0, p.zone), r(5, 0, p.character), r(10, 0, p.item), r(300, 0, p.zone)]);
    expect(out[2]).toEqual({ show: true, dy: 0 }); // the item keeps its spot
    expect(out[3]).toEqual({ show: true, dy: 0 }); // far away: untouched
    expect(out[0]!.show && out[1]!.show).toBe(true); // both moved, still shown (N-5)
  });

  it("hides a label only when every nearby spot is taken", () => {
    const stack = [-2, -1, 0, 1, 2].map((k) => r(0, k * 22, LABEL_PRIORITY.item));
    const out = declutter([...stack, r(0, 0, LABEL_PRIORITY.zone)]);
    expect(out.slice(0, 5).every((o) => o.show)).toBe(true);
    expect(out[5]!.show).toBe(false);
  });

  it("no two shown labels overlap for a random set, after the moves", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const rects = Array.from({ length: 60 }, () => r(rnd() * 800, rnd() * 400, Math.floor(rnd() * 5)));
    const out = declutter(rects, 0);
    const shown = rects.flatMap((q, i) => (out[i]!.show ? [{ ...q, y0: q.y0 + out[i]!.dy, y1: q.y1 + out[i]!.dy }] : []));
    for (let i = 0; i < shown.length; i++)
      for (let j = i + 1; j < shown.length; j++) {
        const a = shown[i]!;
        const b = shown[j]!;
        expect(a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0).toBe(false);
      }
  });
});
