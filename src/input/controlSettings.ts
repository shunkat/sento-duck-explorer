// Look-control and rendering preferences. Display/input preferences only:
// independent of game state and checkpoints, and never needed to play.
export const CONTROL_STORAGE_KEY = "sento-duck-explorer.controls";
export interface ControlStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface ControlValues {
  /** Look speed multiplier. */
  sensitivity: number;
  /** Mouse up moves the view down instead of up. */
  invertY: boolean;
  /** Never request Pointer Lock; look only by dragging. */
  dragOnly: boolean;
  /** Lower render resolution (presentation only). */
  lightweight: boolean;
}
export const SENSITIVITY_MIN = 0.4;
export const SENSITIVITY_MAX = 2.5;
export const DEFAULT_CONTROLS: ControlValues = { sensitivity: 1, invertY: false, dragOnly: false, lightweight: false };
function storageOrUndefined(): ControlStorage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}
/** Validate stored JSON field by field; anything unusable falls back to the default. */
export function parseControls(raw: string | null | undefined): ControlValues {
  const out = { ...DEFAULT_CONTROLS };
  if (!raw) return out;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return out;
    const o = v as Record<string, unknown>;
    if (typeof o.sensitivity === "number" && Number.isFinite(o.sensitivity)) {
      out.sensitivity = Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, o.sensitivity));
    }
    if (typeof o.invertY === "boolean") out.invertY = o.invertY;
    if (typeof o.dragOnly === "boolean") out.dragOnly = o.dragOnly;
    if (typeof o.lightweight === "boolean") out.lightweight = o.lightweight;
  } catch { /* Keep the defaults. */ }
  return out;
}
export class ControlSettings {
  values: ControlValues;
  private storage: ControlStorage | undefined;
  constructor(storage: ControlStorage | undefined = storageOrUndefined()) {
    this.storage = storage;
    let raw: string | null = null;
    try { raw = storage?.getItem(CONTROL_STORAGE_KEY) ?? null; } catch { /* Unavailable storage: defaults. */ }
    this.values = parseControls(raw);
  }
  update(patch: Partial<ControlValues>): void {
    this.values = parseControls(JSON.stringify({ ...this.values, ...patch }));
    try { this.storage?.setItem(CONTROL_STORAGE_KEY, JSON.stringify(this.values)); } catch { /* The session value still applies. */ }
  }
}
