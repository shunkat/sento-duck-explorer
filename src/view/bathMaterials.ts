// Presentation-only refinement of the authored bath tiles. The source GLB,
// its UVs/textures and the game's geometry/collision remain unchanged.
import * as THREE from "three";
import { LEVEL } from "../level/layout";
import type { AABB } from "../sim/geometry";

const TILE_MATERIALS = new Set(["ceramic_cream", "ceramic_teal", "bath_floor"]);
const VERTEX_DECLARATIONS = `
varying vec3 vSentoBathWorld;
varying float vSentoBathUp;
`;
const FRAGMENT_DECLARATIONS = VERTEX_DECLARATIONS + `
uniform vec4 sentoBathBounds;
uniform vec4 sentoBathWaterBounds;
uniform vec4 sentoBathWashBounds;
uniform float sentoBathIsFloor;

float sentoBathRectDistance(vec2 p, vec4 bounds) {
  return length(max(max(bounds.xy - p, p - bounds.zw), vec2(0.0)));
}

float sentoBathScope(vec2 p) {
  vec2 inside = min(p - sentoBathBounds.xy, sentoBathBounds.zw - p);
  // Exactly zero outside the pilot area, with a soft transition inside it.
  return smoothstep(0.0, 0.28, min(inside.x, inside.y));
}

float sentoBathTileHeight(vec2 uv) {
  // The existing 512px base maps contain four tiles on each axis. Their
  // 1..4px grout ramp is centred at each repeated boundary, including -UVs.
  // vMapUv already includes the original map transform and glTF UV convention.
  vec2 cell = fract(uv * 4.0);
  vec2 edge = min(cell, vec2(1.0) - cell);
  return smoothstep(1.5 / 128.0, 4.5 / 128.0, min(edge.x, edge.y));
}

vec3 sentoBathRelief(vec3 surfacePosition, vec3 surfaceNormal, float height, float side) {
  // Surface-gradient bump mapping in view space: using unnormalised position
  // derivatives keeps the 0.8mm relief in world units at different distances.
  vec3 dx = dFdx(surfacePosition);
  vec3 dy = dFdy(surfacePosition);
  vec3 r1 = cross(dy, surfaceNormal);
  vec3 r2 = cross(surfaceNormal, dx);
  float determinant = dot(dx, r1) * side;
  vec3 gradient = sign(determinant) * (dFdx(height) * r1 + dFdy(height) * r2);
  if (abs(determinant) < 0.000000000001) return surfaceNormal;
  return normalize(abs(determinant) * surfaceNormal - gradient);
}
`;

const SURFACE = `
  float sentoBathMask = sentoBathScope(vSentoBathWorld.xz);
  float sentoBathTile = sentoBathTileHeight(vMapUv);
  float sentoBathPixelWidth = max(fwidth(vMapUv.x * 4.0), fwidth(vMapUv.y * 4.0));
  float sentoBathDetail = 1.0 - smoothstep(0.035, 0.18, sentoBathPixelWidth);
  // Static, broad wet patches stay near actual water and washing stations.
  // The variation is in metres, not texture UVs, so it does not repeat per tile.
  float sentoBathShore = 1.0 - smoothstep(0.10, 1.05,
    sentoBathRectDistance(vSentoBathWorld.xz, sentoBathWaterBounds));
  float sentoBathWash = 1.0 - smoothstep(0.05, 0.85,
    sentoBathRectDistance(vSentoBathWorld.xz, sentoBathWashBounds));
  float sentoBathPatch = 0.5 + 0.25 * sin(vSentoBathWorld.x * 3.1 + sin(vSentoBathWorld.z * 2.8))
    + 0.25 * sin(vSentoBathWorld.z * 4.3 - vSentoBathWorld.x * 1.7);
  float sentoBathWet = max(sentoBathShore, sentoBathWash) * smoothstep(0.22, 0.78, sentoBathPatch)
    * sentoBathIsFloor * smoothstep(0.75, 0.95, vSentoBathUp);
  // Wet ceramic darkens only slightly; the main cue is its tighter reflection.
  diffuseColor.rgb *= 1.0 - 0.075 * sentoBathWet * sentoBathMask;
`;

const ROUGHNESS = `
  // Porous grout stays matte. Glazed walls and dry floor tiles stay distinct.
  float sentoBathGlaze = mix(0.29, 0.49, sentoBathIsFloor);
  sentoBathGlaze = mix(sentoBathGlaze, 0.19, sentoBathWet);
  float sentoBathTileAverage = mix(0.94, sentoBathTile, sentoBathDetail);
  float sentoBathRoughness = mix(0.77, sentoBathGlaze, sentoBathTileAverage);
  roughnessFactor = mix(roughnessFactor, sentoBathRoughness, sentoBathMask);
`;

const NORMAL = `
  float sentoBathHeight = 0.0008 * sentoBathTile * sentoBathDetail;
  vec3 sentoBathNormal = sentoBathRelief(-vViewPosition, normal, sentoBathHeight, faceDirection);
  normal = normalize(mix(normal, sentoBathNormal, sentoBathMask));
`;

type MaterialSlot = THREE.Material | THREE.Material[];
type Binding = { before: MaterialSlot; after: MaterialSlot };
const vectorBounds = (b: AABB) => new THREE.Vector4(b.minX, b.minZ, b.maxX, b.maxZ);

/** Own one material bank per installed environment; dispose when it is replaced. */
export class BathMaterials {
  private readonly materials = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
  private readonly owned = new Set<THREE.Material>();
  private readonly bindings = new Map<THREE.Mesh, Binding>();
  private readonly bounds: THREE.Vector4;
  private readonly water: THREE.Vector4;
  private readonly washing: THREE.Vector4;
  private disposed = false;

  constructor(bounds: AABB) {
    if (![bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ].every(Number.isFinite)
      || bounds.maxX <= bounds.minX || bounds.maxZ <= bounds.minZ) {
      throw new Error("Bath material bounds must be finite and have positive area.");
    }
    this.bounds = vectorBounds(bounds);
    const bath = LEVEL.zones.find(zone => zone.id === "bathwater")!;
    this.water = vectorBounds(bath.box);
    const stations = LEVEL.fixtures.filter(fixture => fixture.kind === "stool");
    this.washing = new THREE.Vector4(
      Math.min(...stations.map(f => f.box.minX)) - 0.3, 0.1,
      Math.max(...stations.map(f => f.box.maxX)) + 0.3,
      Math.max(...stations.map(f => f.box.maxZ)) + 0.15,
    );
  }

  apply(root: THREE.Object3D): void {
    if (this.disposed) throw new Error("BathMaterials has been disposed.");
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !object.geometry.getAttribute("uv")) return;
      if (this.bindings.has(object)) return;
      const before = object.material as MaterialSlot;
      const after = Array.isArray(before) ? before.map(m => this.refine(m)) : this.refine(before);
      if (Array.isArray(before) && Array.isArray(after) && before.every((m, i) => m === after[i])) return;
      if (before === after) return;
      object.material = after;
      this.bindings.set(object, { before, after });
    });
  }

  private refine(source: THREE.Material): THREE.Material {
    if (this.owned.has(source) || !(source instanceof THREE.MeshStandardMaterial)
      || !TILE_MATERIALS.has(source.name) || !source.map) return source;
    const existing = this.materials.get(source);
    if (existing) return existing;
    const material = source.clone();
    const originalCompile = source.onBeforeCompile;
    const originalKey = source.customProgramCacheKey();
    const isFloor = source.name === "bath_floor" ? 1 : 0;
    material.onBeforeCompile = (shader, renderer) => {
      originalCompile.call(material, shader, renderer);
      shader.uniforms.sentoBathBounds = { value: this.bounds };
      shader.uniforms.sentoBathWaterBounds = { value: this.water };
      shader.uniforms.sentoBathWashBounds = { value: this.washing };
      shader.uniforms.sentoBathIsFloor = { value: isFloor };
      shader.vertexShader = VERTEX_DECLARATIONS + shader.vertexShader
        .replace("#include <normal_vertex>", `#include <normal_vertex>
          vSentoBathUp = max(0.0, inverseTransformDirection(transformedNormal, viewMatrix).y);`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          vSentoBathWorld = (modelMatrix * vec4(position, 1.0)).xyz;`);
      shader.fragmentShader = FRAGMENT_DECLARATIONS + shader.fragmentShader
        .replace("#include <color_fragment>", "#include <color_fragment>\n" + SURFACE)
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n" + ROUGHNESS)
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + NORMAL);
    };
    material.customProgramCacheKey = () => `${originalKey}|sento-bath-materials-v1`;
    this.materials.set(source, material);
    this.owned.add(material);
    return material;
  }

  dispose(): void {
    if (this.disposed) return;
    for (const [mesh, binding] of this.bindings) {
      // Do not overwrite a material replaced by another owner after installation.
      if (mesh.material === binding.after) mesh.material = binding.before;
    }
    for (const material of this.owned) material.dispose();
    this.bindings.clear();
    this.materials.clear();
    this.owned.clear();
    this.disposed = true;
  }
}
