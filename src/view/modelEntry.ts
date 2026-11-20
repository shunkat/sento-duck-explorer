// Entry point for final character models (GLB). See .kiro/specs/final-assets
// and .kiro/specs/shoulder-view (Req 6). Empty on purpose: a URL is added only
// after the model has gone through image → Image to 3D → Blender → GLB and its
// rights checks. Until then the placeholder primitives are drawn.
import type { CharacterId } from "../core/types";

export const CHARACTER_MODEL_URLS: Partial<Record<CharacterId, string>> = {};
