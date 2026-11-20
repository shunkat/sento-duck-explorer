// Screen-space sizing for 3D text labels (pure). Labels shrink with distance
// but stay within a readable pixel range, so a nearby label never covers the
// screen in Duck's low view and distant labels stay legible in the overview.

export type LabelKind = "character" | "zone" | "item" | "fixture";

export const LABEL_MIN_PX = 12;
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
