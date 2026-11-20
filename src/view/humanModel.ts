// Child / Adult GLB contract (view only). Under the model root:
//   outfit_clothed, outfit_bath  — exactly one is visible, chosen by ClothingState
//   head_shared                  — optional, always visible when present
//   socket_hand_r, socket_label  — both humans; socket_carry — Adult only (y 0.90 m)
// Both outfits share the bottom-center origin. Materials, textures and triangle
// budgets are checked by the asset pipeline, not here (no DOM image API in tests).
import { Vector3, type Object3D } from "three";
import type { HumanId } from "../core/types";

export type Clothing = "clothed" | "unclothed";

/** Show the outfit for `clothing` (unclothed = bath). Returns false when the root lacks an outfit group. */
export function applyOutfit(root: Object3D, clothing: Clothing): boolean {
  const clothed = root.getObjectByName("outfit_clothed");
  const bath = root.getObjectByName("outfit_bath");
  const head = root.getObjectByName("head_shared");
  if (head) head.visible = true;
  if (!clothed || !bath) return false;
  clothed.visible = clothing === "clothed";
  bath.visible = clothing !== "clothed";
  return true;
}

/** One message per contract break; empty when the root fits. */
export function checkHumanContract(id: HumanId, root: Object3D): string[] {
  const out: string[] = [];
  for (const n of ["outfit_clothed", "outfit_bath", "socket_hand_r", "socket_label"]) {
    if (!root.getObjectByName(n)) out.push(`missing ${n}`);
  }
  const carry = root.getObjectByName("socket_carry");
  if (id === "adult") {
    if (!carry) out.push("missing socket_carry");
    else {
      root.updateWorldMatrix(true, true);
      const y = root.worldToLocal(carry.getWorldPosition(new Vector3())).y;
      if (Math.abs(y - 0.9) > 0.05) out.push(`socket_carry at y ${y.toFixed(3)}, expected 0.90`);
    }
  } else if (carry) out.push("socket_carry is Adult only");
  return out;
}

export type TowelPlace = "held" | "head";

/** Where a human's towel sits, in the character group's local space (group origin = body center, front +Z). */
export interface TowelPose {
  x: number;
  y: number;
  z: number;
  /** Rotation about local X: 0 = folded flat on the head, π/2 = hanging from the hand. */
  rotX: number;
}

/**
 * Towel pose from the body: on the head it lies flat on `headTop` (model
 * bounds, or the placeholder body top); in the hand it hangs at `hand` (the
 * model's `socket_hand_r`), or beside the right side of the placeholder body
 * (right = −X for a +Z front). Provisional towel; not a final asset.
 */
export function towelPose(
  place: TowelPlace,
  body: { height: number; radius: number; headTop?: number; hand?: { x: number; y: number; z: number } },
): TowelPose {
  if (place === "head") return { x: 0, y: (body.headTop ?? body.height / 2) + TOWEL_THICKNESS / 2, z: 0, rotX: 0 };
  // Held: the towel hangs with its top at the hand (it never floats apart from the
  // hand). If deeper water is ever drawn, change the arm pose; never move the towel alone.
  const h = body.hand ?? { x: -(body.radius + 0.05), y: -0.05 * body.height, z: 0.05 };
  return { x: h.x, y: h.y - TOWEL_DEPTH / 2, z: h.z, rotX: Math.PI / 2 };
}
/** How far a model's mesh top may differ from BODY_HEIGHT before it is clamped (hair, bounds noise). */
export const HEAD_TOP_TOLERANCE = 0.08;

/**
 * Head anchor for the towel in the character group's local space (origin =
 * body center, so the body top is height / 2). The human GLBs have no head
 * socket, and `socket_label` is the name-tag height above the head, so it is
 * not used: the mesh bounds top is taken, clamped to BODY_HEIGHT ± tolerance.
 */
export function headAnchor(bodyHeight: number, boundsTopLocal?: number): number {
  const top = bodyHeight / 2;
  if (boundsTopLocal === undefined || !Number.isFinite(boundsTopLocal)) return top;
  return Math.min(top + HEAD_TOP_TOLERANCE, Math.max(top - HEAD_TOP_TOLERANCE, boundsTopLocal));
}

/** Provisional towel box (m): width × thickness × depth. */
export const TOWEL_WIDTH = 0.26;
export const TOWEL_THICKNESS = 0.04;
export const TOWEL_DEPTH = 0.18;
