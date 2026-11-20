import { describe, expect, it } from "vitest";
import { CAMERA_OFFSET, OVERVIEW } from "../src/view/camera";
import { LABEL_MAX_PX, LABEL_MIN_PX, type LabelKind, labelPixelHeight, worldHeightForPixels } from "../src/view/labels";

const KINDS: LabelKind[] = ["character", "zone", "item", "fixture"];

describe("label screen size (Chrome feedback: labels covered the screen in Duck's view)", () => {
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
    const duckDist = Math.hypot(CAMERA_OFFSET.duck.y, CAMERA_OFFSET.duck.z);
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
