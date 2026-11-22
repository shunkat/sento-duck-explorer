// Touch-only presentation. World sizes, collision and manual view angles stay
// unchanged; the narrow canvas gets a centred, more distant camera instead.
import type { CharacterId } from "../core/types";
import { CAMERA_PROFILE, type CameraProfile } from "./shoulder";

export const MOBILE_FRAMING_SECONDS = 0.3;
export const MOBILE_OPACITY_MIN = 0.25;

const MOBILE_PROFILE: Record<CharacterId, CameraProfile> = {
  duck: { dist: 1.7, eye: 0.42, side: 0.03, look: 0.22 },
  child: { dist: 2.9, eye: 1.5, side: 0.04, look: 0.4 },
  adult: { dist: 3.6, eye: 2, side: 0.05, look: 0.65 },
};
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Zero/hidden/non-finite resizes keep the last usable aspect. */
export function usableAspect(width: number, height: number, previous: number): number {
  const aspect = width / height;
  return width > 0 && height > 0 && Number.isFinite(aspect) && aspect > 0 ? aspect : previous;
}

/** Continuous compression response, with an opaque free-space region. */
export function compressedBodyOpacity(distance: number, preferredDistance: number): number {
  const clear = clamp01((distance / preferredDistance - 0.35) / 0.5);
  return mix(MOBILE_OPACITY_MIN, 1, smooth(clear));
}

/** A bounded-time transition separate from the existing growth interpolation. */
export class MobileCameraFraming {
  private aspect = 1;
  private amount = 0;
  private portrait = 0;
  private fromAmount = 0;
  private fromPortrait = 0;
  private toAmount = 0;
  private toPortrait = 0;
  private elapsed = MOBILE_FRAMING_SECONDS;

  setViewport(width: number, height: number, touch: boolean, immediate: boolean): void {
    this.aspect = usableAspect(width, height, this.aspect);
    const amount = touch ? 1 : 0;
    // Landscape remains 55 degrees; portrait reaches 65 at aspect <= 1/2.
    const portrait = clamp01((1 - this.aspect) * 2);
    if (immediate) {
      this.amount = this.fromAmount = this.toAmount = amount;
      this.portrait = this.fromPortrait = this.toPortrait = portrait;
      this.elapsed = MOBILE_FRAMING_SECONDS;
    } else if (amount !== this.toAmount || portrait !== this.toPortrait) {
      this.fromAmount = this.amount;
      this.fromPortrait = this.portrait;
      this.toAmount = amount;
      this.toPortrait = portrait;
      this.elapsed = 0;
    }
  }

  update(dt: number): void {
    this.elapsed = Math.min(MOBILE_FRAMING_SECONDS, this.elapsed + dt);
    const t = smooth(this.elapsed / MOBILE_FRAMING_SECONDS);
    this.amount = mix(this.fromAmount, this.toAmount, t);
    this.portrait = mix(this.fromPortrait, this.toPortrait, t);
  }

  profile(id: CharacterId): CameraProfile {
    const pc = CAMERA_PROFILE[id];
    const mobile = MOBILE_PROFILE[id];
    return {
      dist: mix(pc.dist, mobile.dist, this.amount),
      eye: mix(pc.eye, mobile.eye, this.amount),
      side: mix(pc.side, mobile.side, this.amount),
      look: mix(pc.look, mobile.look, this.amount),
    };
  }

  get fov(): number { return 55 + 10 * this.portrait * this.amount; }
}
