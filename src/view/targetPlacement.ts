// Placement rules for the E-target text (pure). The text is drawn in the world
// when its whole rectangle is on screen and nothing blocks the view of it;
// otherwise a compact HUD prompt is used instead.
import type { Vec3 } from "./deriveView";
export interface Rect { x0: number; y0: number; x1: number; y1: number }
export interface Margin { top: number; right: number; bottom: number; left: number }
/** Text rectangle centred horizontally above a screen anchor. */
export function labelRect(anchor: { x: number; y: number }, w: number, h: number, gap = 6): Rect {
  return { x0: anchor.x - w / 2, y0: anchor.y - gap - h, x1: anchor.x + w / 2, y1: anchor.y - gap };
}
/** The whole rectangle (not only its anchor) lies inside the viewport minus the margins. */
export function rectInside(r: Rect, viewport: { w: number; h: number }, m: Margin): boolean {
  return r.x0 >= m.left && r.y0 >= m.top && r.x1 <= viewport.w - m.right && r.y1 <= viewport.h - m.bottom;
}
/** NDC (−1..1, y up) → CSS px (y down). `z` outside (−1,1) means behind the camera or beyond far. */
export function ndcToScreen(ndc: Vec3, viewport: { w: number; h: number }): { x: number; y: number; inFront: boolean } {
  return { x: ((ndc.x + 1) / 2) * viewport.w, y: ((1 - ndc.y) / 2) * viewport.h, inFront: ndc.z > -1 && ndc.z < 1 };
}
/** Where the prompt goes this frame. */
export type PromptPlace = "world" | "hud" | "none";
export function choosePromptPlace(args: {
  enabled: boolean; hasTarget: boolean; inFront: boolean; sight: boolean; rect: Rect | null;
  viewport: { w: number; h: number }; margin: Margin;
}): PromptPlace {
  if (!args.enabled || !args.hasTarget) return "none";
  if (args.inFront && args.sight && args.rect && rectInside(args.rect, args.viewport, args.margin)) return "world";
  return "hud";
}
