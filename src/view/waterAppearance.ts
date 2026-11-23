// View-only water shading. Existing surfaces, transparency and water rules stay
// unchanged; this adds no geometry, render pass, texture or generated 3D asset.
import * as THREE from "three";
import type { AABB } from "../sim/geometry";

export type WaterKind = "bath" | "plunge" | "pond";
export const WATER_COLORS: Record<WaterKind, number> = {
  bath: 0x557f93,
  plunge: 0x53758f,
  pond: 0x536f78,
};
// A color clear keeps the existing zero-draw-call background. A texture gradient
// would require Three's additional fullscreen background pass.
export const SENTO_BACKGROUND_COLOR = 0xcddde2;

/** A bounded view effect; neither these samples nor the shader move the water. */
export const WATER_WAKE_CAPACITY = 12;
export const WATER_WAKE_LIFETIME = 1.6;
const WAKE_SPACING = .11;
const WAKE_INTERVAL = .075;
const MAX_SAMPLE_GAP = .25;
type WaterPosition = { x: number; z: number };

const VARYINGS = `
varying vec2 vSentoWaterUv;
varying vec2 vSentoWaterWorldXZ;
varying float vSentoWaterTop;
`;
const HERO_UNIFORMS = `
uniform float sentoHeroEnabled;
uniform vec4 sentoHeroBounds;
uniform vec3 sentoHeroColor;
uniform vec4 sentoWake[${WATER_WAKE_CAPACITY}];
`;
const WATER_DIFFUSE = `
  // Limit the first finished area to the main bath's top face. The inset
  // softens the transition at its rim and prevents ripples crossing its walls.
  vec2 sentoEdgeDistance = min(vSentoWaterWorldXZ - sentoHeroBounds.xy,
    sentoHeroBounds.zw - vSentoWaterWorldXZ);
  float sentoHero = sentoHeroEnabled * step(0.9, vSentoWaterTop)
    * smoothstep(0.0, 0.16, min(sentoEdgeDistance.x, sentoEdgeDistance.y));
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
  diffuseColor.rgb = mix(diffuseColor.rgb,
    sentoHeroColor * (0.97 + 0.025 * sentoBroad + 0.015 * sentoCross), sentoHero);
`;

const WATER_NORMAL = `
  if (sentoHero > 0.0) {
    // Analytic surface slopes bend the reflected light, unlike painted waves.
    // Distances are metres, so the water keeps its scale on every bath mesh.
    vec2 sentoSlope = vec2(0.027, 0.014)
      * cos(dot(vSentoWaterWorldXZ, vec2(3.8, 1.9)) - sentoWaterTime * 0.85);
    sentoSlope += vec2(-0.012, 0.021)
      * cos(dot(vSentoWaterWorldXZ, vec2(-2.1, 3.6)) + sentoWaterTime * 0.63);
    for (int i = 0; i < ${WATER_WAKE_CAPACITY}; i++) {
      vec4 wake = sentoWake[i];
      float age = sentoWaterTime - wake.z;
      if (wake.w > 0.0 && age >= 0.0 && age < ${WATER_WAKE_LIFETIME.toFixed(1)}) {
        vec2 offset = vSentoWaterWorldXZ - wake.xy;
        float distanceToWake = length(offset);
        float ringDistance = distanceToWake - (0.09 + age * 0.28);
        float envelope = exp(-pow(ringDistance / 0.13, 2.0));
        float fade = smoothstep(0.0, 0.06, age)
          * pow(1.0 - age / ${WATER_WAKE_LIFETIME.toFixed(1)}, 2.0);
        sentoSlope += offset / max(distanceToWake, 0.001)
          * cos(ringDistance * 28.0) * envelope * fade * wake.w * 0.035;
      }
    }
    // Keep accumulated wakes gentle even during a tight turn.
    sentoSlope *= min(1.0, 0.12 / max(length(sentoSlope), 0.0001));
    vec3 sentoWaveNormal = normalize(mat3(viewMatrix) * vec3(-sentoSlope.x, 1.0, -sentoSlope.y));
    normal = normalize(mix(normal, sentoWaveNormal, sentoHero));
  }
`;

/** Shared standard materials retain Three's lighting, fog and alpha pipeline. */
export class WaterAppearance {
  private time = { value: 0 };
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private heroBounds = { value: new THREE.Vector4() };
  private heroColor = { value: new THREE.Color(0x4c8587) };
  private wake = { value: Array.from({ length: WATER_WAKE_CAPACITY }, () => new THREE.Vector4(0, 0, 0, 0)) };
  private heroBath?: AABB;
  private previous?: WaterPosition & { time: number };
  private nextWake = 0;
  private wakeDistance = 0;
  private lastWakeTime = -Infinity;

  constructor(heroBath?: AABB) {
    if (heroBath && Object.values(heroBath).every(Number.isFinite)
      && heroBath.maxX > heroBath.minX && heroBath.maxZ > heroBath.minZ) {
      this.heroBath = { ...heroBath };
      this.heroBounds.value.set(heroBath.minX, heroBath.minZ, heroBath.maxX, heroBath.maxZ);
    }
  }

  private resetWake(): void {
    for (const sample of this.wake.value) sample.set(0, 0, 0, 0);
    this.previous = undefined;
    this.nextWake = this.wakeDistance = 0;
    this.lastWakeTime = -Infinity;
  }

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
      shader.uniforms.sentoHeroEnabled = { value: kind === "bath" && this.heroBath ? 1 : 0 };
      shader.uniforms.sentoHeroBounds = this.heroBounds;
      shader.uniforms.sentoHeroColor = this.heroColor;
      shader.uniforms.sentoWake = this.wake;
      shader.vertexShader = VARYINGS + shader.vertexShader.replace("#include <begin_vertex>", `
        #include <begin_vertex>
        vSentoWaterUv = uv;
        vSentoWaterWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;
        vSentoWaterTop = normalize(mat3(modelMatrix) * normal).y;
      `);
      shader.fragmentShader = VARYINGS + "\nuniform float sentoWaterTime;\n" + HERO_UNIFORMS + shader.fragmentShader
        .replace("#include <color_fragment>", "#include <color_fragment>\n" + WATER_DIFFUSE)
        .replace("#include <roughnessmap_fragment>", `
          #include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.22, sentoHero);
        `)
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + WATER_NORMAL)
        .replace("#include <lights_physical_fragment>", `
          #include <lights_physical_fragment>
          // Water's dielectric F0 is about 0.02. Retain Standard's Fresnel
          // response: reflections strengthen at grazing view angles.
          material.specularColor = mix(material.specularColor, vec3(0.02), sentoHero);
          material.specularColorBlended = mix(material.specularColorBlended, vec3(0.02), sentoHero);
        `);
    };
    material.customProgramCacheKey = () => "sento-water-v2";
    this.materials.set(key, material);
    return material;
  }

  update(timeSeconds: number, duck?: WaterPosition | null): void {
    if (!Number.isFinite(timeSeconds)) { this.resetWake(); return; }
    const time = Math.max(0, timeSeconds);
    const rewound = time < this.time.value;
    this.time.value = time;
    for (const sample of this.wake.value) {
      if (time - sample.z >= WATER_WAKE_LIFETIME) sample.w = 0;
    }
    if (rewound) this.resetWake();
    const bath = this.heroBath;
    if (!bath || !duck || !Number.isFinite(duck.x) || !Number.isFinite(duck.z)) {
      this.resetWake();
      return;
    }
    if (duck.x <= bath.minX || duck.x >= bath.maxX || duck.z <= bath.minZ || duck.z >= bath.maxZ) {
      // The old wake can fade inside this bath, but cannot follow the Duck
      // into the connecting waterway or another vessel.
      this.previous = undefined;
      this.wakeDistance = 0;
      return;
    }
    const previous = this.previous;
    this.previous = { x: duck.x, z: duck.z, time };
    if (!previous) return;
    const dt = time - previous.time;
    const distance = Math.hypot(duck.x - previous.x, duck.z - previous.z);
    // A 60 Hz simulation can repeat a position in a faster rendered frame.
    // Zero-time position changes, clock resets, long pauses and teleports
    // must not leave a trail across the bath. Duck's normal speed is 1.5 m/s.
    if (dt > MAX_SAMPLE_GAP || dt < 0 || (dt === 0 && distance > 0)
      || distance > Math.max(.065, dt * 3)) {
      this.resetWake();
      this.previous = { x: duck.x, z: duck.z, time };
      return;
    }
    if (dt === 0 || distance < .0001) return;
    this.wakeDistance += distance;
    if (this.wakeDistance < WAKE_SPACING || time - this.lastWakeTime < WAKE_INTERVAL) return;
    this.wake.value[this.nextWake]!.set(
      (duck.x + previous.x) / 2, (duck.z + previous.z) / 2, time,
      Math.min(1, distance / dt / 1.5),
    );
    this.nextWake = (this.nextWake + 1) % WATER_WAKE_CAPACITY;
    this.wakeDistance = 0;
    this.lastWakeTime = time;
  }
}
