// Entry point for final models (GLB). See .kiro/specs/final-assets and
// .kiro/specs/shoulder-view (Req 6). A URL is listed only after the model went
// through image → Image to 3D → Blender → GLB and its rights checks. Anything
// not listed keeps its placeholder primitive. Environment geometry and the
// remaining small props are still placeholders; human meshes have no rig yet.
//
// Listed models are Meshy-generated, Blender-adjusted, CC BY 4.0. Their credit
// is in THIRD_PARTY_NOTICES.md and public/models/*.LICENSE.txt (Req 6.6).
import type { CharacterId, ItemId } from "../core/types";

export const CHARACTER_MODEL_URLS: Partial<Record<CharacterId, string>> = {
  duck: "models/duck.glb",
  child: "models/child.glb",
  adult: "models/adult.glb",
};

export const ITEM_MODEL_URLS: Partial<Record<ItemId, string>> = {
  hat: "models/hat_sauna_duck.glb",
};
