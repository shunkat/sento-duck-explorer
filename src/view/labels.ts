// Screen-space sizing for 3D text labels (pure). Labels shrink with distance
// but stay within a readable pixel range, so a nearby label never covers the
// screen in Duck's low view and distant labels stay legible in the overview.
import type { ZoneId } from "../core/types";
import type { AABB } from "../sim/geometry";

export type LabelKind = "character" | "zone" | "item" | "fixture";

export const LABEL_MIN_PX = 12;
/** Canvas text height inside the label texture (the rest is padding). */
export const LABEL_TEXT_PX = 44;
export const LABEL_CANVAS_H = 64;
/** Largest on-screen text height per kind (px). */
export const LABEL_MAX_PX: Record<LabelKind, number> = {
  character: 22,
  zone: 20,
  item: 16,
  fixture: 16,
};
/** Distance (m) at which a label reaches its maximum size. Closer stays at max. */
const FULL_SIZE_DISTANCE = 5;
/** Closer than this, the label is hidden (the camera is practically inside it). */
export const LABEL_HIDE_DISTANCE = 0.6;

/**
 * Sprite anchor per kind (0 = bottom edge). Character labels sit above their
 * anchor so they never cover the body below (overview: 子ども/大人 hid their bodies).
 */
/** Gap (m) between a character's head and the bottom of its name label. */
export const CHARACTER_LABEL_GAP = 0.1;

export const LABEL_CENTER_Y: Record<LabelKind, number> = { character: 0, zone: 0.5, item: 0.5, fixture: 0.5 };

/**
 * Where a zone's name label sits. Small inner zones that characters stand in
 * (湯船 is the start) get it at their front edge instead of the center, so it
 * does not hide a character in the overview.
 */
export function zoneLabelAnchor(id: ZoneId, b: AABB): { x: number; y: number; z: number } {
  if (id === "narrow_hole") return { x: b.minX + 0.8, y: 0.45, z: b.minZ - 0.3 };
  const x = (b.minX + b.maxX) / 2;
  if (id === "bathwater" || id === "splash" || id === "pond_goal") return { x, y: 0.35, z: b.maxZ - 0.3 };
  return { x, y: 0.35, z: (b.minZ + b.maxZ) / 2 };
}

/** Text height on screen in CSS pixels for a label at `distance` meters. */
export function labelPixelHeight(kind: LabelKind, distance: number): number {
  const max = LABEL_MAX_PX[kind];
  if (!(distance > 0)) return max;
  const px = (max * FULL_SIZE_DISTANCE) / distance;
  return Math.min(max, Math.max(LABEL_MIN_PX, px));
}

/**
 * World-space height that renders as `px` pixels at `distance`, for a
 * perspective camera with vertical field of view `fovDeg` and a viewport of
 * `viewportPx` CSS pixels in height.
 */
export function worldHeightForPixels(px: number, distance: number, fovDeg: number, viewportPx: number): number {
  const visible = 2 * distance * Math.tan((fovDeg * Math.PI) / 360);
  return (px * visible) / Math.max(1, viewportPx);
}
