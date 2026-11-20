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
