// Entry point for final models (GLB). See .kiro/specs/final-assets and
// .kiro/specs/shoulder-view (Req 6). A URL is listed only after the model went
// through image → Image to 3D → Blender → GLB and its rights checks. Anything
// not listed keeps its placeholder primitive. Stools and basins are connected;
// the rest of the environment and small props remain placeholders, and human
// meshes have no rig yet.
//
// Listed models are Meshy-generated, Blender-adjusted, CC BY 4.0. Their credit
// is in THIRD_PARTY_NOTICES.md and public/models/*.LICENSE.txt (Req 6.6).
import type { CharacterId, ItemId } from "../core/types";
import type { EnvironmentModelId } from "./environmentModels";

export const CHARACTER_MODEL_URLS: Partial<Record<CharacterId, string>> = {
  duck: "models/duck.glb",
  child: "models/child.glb",
  adult: "models/adult.glb",
};

export const ITEM_MODEL_URLS: Partial<Record<ItemId, string>> = {
  hat: "models/hat_sauna_duck.glb",
};

// Add URLs only after the real pipeline, measurements and rights checks finish.
export const ENVIRONMENT_MODEL_URLS: Partial<Record<EnvironmentModelId, string>> = {
  bath_stool: "models/bath_stool.glb",
  wash_basin: "models/wash_basin.glb",
};

// Production candidates. These are deliberately NOT loaded. Promote individual
// entries into the registries above only after source, rights and visual QA.
export const PENDING_ENVIRONMENT_MODEL_URLS: Partial<Record<EnvironmentModelId, string>> = {
  sento_environment: "models/sento_environment.glb",
  bath_stool_lod_medium: "models/bath_stool_lod_medium.glb",
  bath_stool_lod_far: "models/bath_stool_lod_far.glb",
  wash_basin_lod_medium: "models/wash_basin_lod_medium.glb",
  wash_basin_lod_far: "models/wash_basin_lod_far.glb",
  soap: "models/soap.glb",
  towel: "models/towel.glb",
};
export const PENDING_ITEM_MODEL_URLS: Partial<Record<ItemId, string>> = {
  coin: "models/coin_500.glb",
  key: "models/sauna_key.glb",
};
