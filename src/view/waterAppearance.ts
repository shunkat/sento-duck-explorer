// View-only water shading. Existing surfaces, transparency and water rules stay
// unchanged; this adds no geometry, render pass, texture or generated 3D asset.
import * as THREE from "three";

export type WaterKind = "bath" | "plunge" | "pond";
export const WATER_COLORS: Record<WaterKind, number> = {
  bath: 0x557f93,
  plunge: 0x53758f,
  pond: 0x536f78,
};
// A color clear keeps the existing zero-draw-call background. A texture gradient
// would require Three's additional fullscreen background pass.
export const SENTO_BACKGROUND_COLOR = 0xcddde2;

const VARYINGS = `
varying vec2 vSentoWaterUv;
varying vec2 vSentoWaterWorldXZ;
`;
const WATER_DIFFUSE = `
  float sentoBroad = 0.5 + 0.5 * sin(dot(vSentoWaterWorldXZ, vec2(1.4, 0.8)) + sentoWaterTime * 0.18);
  float sentoCross = 0.5 + 0.5 * sin(dot(vSentoWaterWorldXZ, vec2(-0.65, 1.55)) - sentoWaterTime * 0.12);
  float sentoRipple = smoothstep(0.79, 0.96, sentoBroad * 0.65 + sentoCross * 0.35);
  // A narrow antialiased edge remains readable at rest and at both camera scales.
  // Existing box UVs avoid per-surface textures, uniforms or extra vertices.
  vec2 sentoEdgePixels = min(vSentoWaterUv, vec2(1.0) - vSentoWaterUv)
    / max(fwidth(vSentoWaterUv), vec2(0.0001));
  float sentoRim = 1.0 - smoothstep(0.8, 2.8, min(sentoEdgePixels.x, sentoEdgePixels.y));
  diffuseColor.rgb *= 0.95 + 0.04 * sentoBroad + 0.025 * sentoCross;
  diffuseColor.rgb *= 1.0 - 0.16 * sentoRim;
  diffuseColor.rgb += vec3(0.025, 0.035, 0.037) * sentoRipple * (1.0 - sentoRim);
`;

/** Shared standard materials retain Three's lighting, fog and alpha pipeline. */
export class WaterAppearance {
  private time = { value: 0 };
  private materials = new Map<string, THREE.MeshStandardMaterial>();

  material(kind: WaterKind, opacity: number): THREE.MeshStandardMaterial {
    const key = `${kind}/${opacity}`;
    const existing = this.materials.get(key);
    if (existing) return existing;
    const material = new THREE.MeshStandardMaterial({
      color: WATER_COLORS[kind], roughness: 0.82,
      transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
    });
    material.name = `sento_water_${kind}`;
    material.onBeforeCompile = shader => {
      shader.uniforms.sentoWaterTime = this.time;
      shader.vertexShader = VARYINGS + shader.vertexShader.replace("#include <begin_vertex>", `
        #include <begin_vertex>
        vSentoWaterUv = uv;
        vSentoWaterWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;
      `);
      shader.fragmentShader = VARYINGS + "\nuniform float sentoWaterTime;\n" + shader.fragmentShader
        .replace("#include <color_fragment>", "#include <color_fragment>\n" + WATER_DIFFUSE);
    };
    material.customProgramCacheKey = () => "sento-water-v1";
    this.materials.set(key, material);
    return material;
  }

  update(timeSeconds: number): void {
    if (Number.isFinite(timeSeconds)) this.time.value = Math.max(0, timeSeconds);
  }
}
