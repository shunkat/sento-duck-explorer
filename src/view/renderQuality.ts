// Render resolution caps (presentation only; never physics, speed or rules).
/** Desktop standard cap, unchanged. */
export const DESKTOP_PIXEL_RATIO_CAP = 2;
/** Phones and tablets: 1.5² / 2² = 56.25 % of the old pixels (43.75 % fewer). */
export const MOBILE_PIXEL_RATIO_CAP = 1.5;
/** Lightweight setting, any device: 1.25² / 2² = 39.06 % of the old pixels (60.94 % fewer). */
export const LIGHT_PIXEL_RATIO_CAP = 1.25;
export function pixelRatioCap(opts: { coarsePointer: boolean; lightweight: boolean }): number {
  if (opts.lightweight) return LIGHT_PIXEL_RATIO_CAP;
  return opts.coarsePointer ? MOBILE_PIXEL_RATIO_CAP : DESKTOP_PIXEL_RATIO_CAP;
}
export function effectivePixelRatio(devicePixelRatio: number, cap: number): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(dpr, cap);
}
