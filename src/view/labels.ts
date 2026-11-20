// Screen-space sizing for 3D text labels (pure). Labels shrink with distance
// but stay within a readable pixel range, so a nearby label never covers the
// screen in Duck's low view and distant labels stay legible in the overview.
import type { Owner, ZoneId } from "../core/types";
import type { AABB } from "../sim/geometry";
import type { PerspectiveCamera, Vector3 } from "three";

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

export const LABEL_CENTER_Y: Record<LabelKind, number> = { character: 0, zone: 0.5, item: 0, fixture: 0.5 };

/**
 * Item label anchor above the item's group center (m). Item labels are
 * bottom-anchored there, so the whole label sits above the item model
 * (tallest: the hat, top ≤ 0.12 m above the center) (shoulder-view Req 7.5).
 */
export const ITEM_LABEL_Y = 0.25;

/**
 * Whether an item's label is drawn. In the shoulder view a held or worn item
 * (owned by a character) shows no label: the small model in the hand or on
 * Duck's head stays visible, and the status panel names the holder. Items
 * lying on a shelf, desk or node keep their label; the overview keeps all.
 */
export function itemLabelShown(owner: Owner, overview: boolean): boolean {
  return overview || owner.kind !== "character";
}

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
 * World-space height that renders as `px` pixels at camera-forward `depth`, for a
 * perspective camera with vertical field of view `fovDeg` and a viewport of
 * `viewportPx` CSS pixels in height.
 */
export function worldHeightForPixels(px: number, depth: number, fovDeg: number, viewportPx: number): number {
  const visible = 2 * depth * Math.tan((fovDeg * Math.PI) / 360);
  return (px * visible) / Math.max(1, viewportPx);
}

/** Use projection depth, not Euclidean distance, so off-axis sprites match declutter rectangles. */
export function labelWorldHeight(px: number, at: Vector3, camera: PerspectiveCamera, viewportPx: number): number | null {
  const m = camera.matrixWorldInverse.elements;
  const depth = -(m[2]! * at.x + m[6]! * at.y + m[10]! * at.z + m[14]!);
  if (depth <= camera.near || depth >= camera.far) return null;
  return worldHeightForPixels(px, depth, camera.fov, viewportPx);
}

/**
 * Draw priority (lower wins): the controlled character first, then the key
 * items (coin, key, hat), then the other characters, fixtures, and room names.
 */
export const LABEL_PRIORITY = { active: 0, item: 1, character: 2, fixture: 3, zone: 4 } as const;

export interface ScreenRect {
  /** Left, top, right, bottom in CSS px. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  priority: number;
}

/**
 * Place labels so none overlaps another: walk them by priority; a label that
 * overlaps one already placed is moved up or down by whole label heights
 * (up to two steps each way), and hidden only when no spot is free. Ties keep
 * the input order. Returns, per input rect, whether it is shown and its
 * vertical shift in px (negative = up) (review D-4, N-5).
 */
export function declutter(rects: readonly ScreenRect[], gap = 2): { show: boolean; dy: number }[] {
  const order = rects.map((_, i) => i).sort((a, b) => rects[a]!.priority - rects[b]!.priority || a - b);
  const placed: ScreenRect[] = [];
  const out = rects.map(() => ({ show: false, dy: 0 }));
  const hits = (r: ScreenRect, dy: number) =>
    placed.some((s) => r.x0 < s.x1 + gap && r.x1 + gap > s.x0 && r.y0 + dy < s.y1 + gap && r.y1 + dy + gap > s.y0);
  for (const i of order) {
    const r = rects[i]!;
    const step = r.y1 - r.y0 + gap;
    const dy = [0, -step, step, -2 * step, 2 * step].find((d) => !hits(r, d));
    if (dy === undefined) continue;
    placed.push({ ...r, y0: r.y0 + dy, y1: r.y1 + dy });
    out[i] = { show: true, dy };
  }
  return out;
}
