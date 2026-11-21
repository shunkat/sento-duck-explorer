// Entry point for final models (GLB). See .kiro/specs/final-assets and
// .kiro/specs/shoulder-view (Req 6). A URL is listed only after the model went
// through its approved production route, Blender/GLB and rights checks. Anything
// not listed keeps its placeholder primitive. The full environment and small
// props are connected; human rigs use the distance-driven view-layer gait.
//
// Source-specific credits/licenses are recorded in THIRD_PARTY_NOTICES.md and
// public/models/*.LICENSE.txt (Req 6.6); generated and free public assets differ.
import type { CharacterId, ItemId } from "../core/types";
import type { EnvironmentModelId } from "./environmentModels";

export const CHARACTER_MODEL_URLS: Partial<Record<CharacterId, string>> = {
  duck: "models/duck.glb",
  child: "models/child.glb",
  adult: "models/adult.glb",
};

export const ITEM_MODEL_URLS: Partial<Record<ItemId, string>> = {
  hat: "models/hat_sauna_duck.glb",
  coin: "models/coin_500.glb",
  key: "models/sauna_key.glb",
};

// Add URLs only after the real pipeline, measurements and rights checks finish.
export const ENVIRONMENT_MODEL_URLS: Partial<Record<EnvironmentModelId, string>> = {
  bath_stool: "models/bath_stool.glb",
  wash_basin: "models/wash_basin.glb",

  sento_environment: "models/sento_environment.glb",
  bath_stool_lod_medium: "models/bath_stool_lod_medium.glb",
  bath_stool_lod_far: "models/bath_stool_lod_far.glb",
  wash_basin_lod_medium: "models/wash_basin_lod_medium.glb",
  wash_basin_lod_far: "models/wash_basin_lod_far.glb",
  soap: "models/soap.glb",
  towel: "models/towel.glb",
  npc_staff_lod_far: "models/npc_staff_lod_far.glb",
  npc_seated_lod_far: "models/npc_seated_lod_far.glb",
  npc_bath_standing_lod_far: "models/npc_bath_standing_lod_far.glb",
};
