import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { WATER_WAKE_CAPACITY, WATER_WAKE_LIFETIME, WaterAppearance } from "../src/view/waterAppearance";

function compiled(material: THREE.Material) {
  const shader = {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  } as Parameters<THREE.Material["onBeforeCompile"]>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

describe("shared water appearance", () => {
  it("retains the original alpha/depth/pass settings and uses the standard lighting shader", () => {
    const appearance = new WaterAppearance();
    for (const opacity of [.75, .9, 1]) {
      const material = appearance.material("bath", opacity);
      const original = new THREE.MeshStandardMaterial({ transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
      for (const key of ["transparent", "opacity", "depthWrite", "depthTest", "side", "blending", "fog", "forceSinglePass"] as const) {
        expect(material[key], key).toBe(original[key]);
      }
      expect(appearance.material("bath", opacity)).toBe(material);
      const shader = compiled(material);
      // Check against this installed Three version: the patch must land while
      // retaining alpha, light, fog and shadow chunks for the ordinary material.
      expect(shader.vertexShader).toContain("vSentoWaterWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;");
      expect(shader.fragmentShader).toContain("diffuseColor.rgb *= 1.0 - 0.16 * sentoRim;");
      for (const chunk of ["alphamap_fragment", "alphatest_fragment", "lights_fragment_begin", "fog_fragment"]) {
        expect(shader.fragmentShader).toContain(`#include <${chunk}>`);
      }
      expect(shader.vertexShader).toContain("#include <shadowmap_vertex>");
      expect(material.map).toBeNull();
    }
  });

  it("shares the same time source across water kinds and supports a finite static first frame", () => {
    const appearance = new WaterAppearance();
    const bath = compiled(appearance.material("bath", .9));
    const pond = compiled(appearance.material("pond", .75));
    expect(bath.uniforms.sentoWaterTime).toBe(pond.uniforms.sentoWaterTime);
    expect(bath.uniforms.sentoWaterTime!.value).toBe(0);
    appearance.update(32.5);
    expect(bath.uniforms.sentoWaterTime!.value).toBe(32.5);
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY]) appearance.update(invalid);
    expect(bath.uniforms.sentoWaterTime!.value).toBe(32.5);
    appearance.update(0);
    expect(pond.uniforms.sentoWaterTime!.value).toBe(0);
  });

  it("restricts the detailed normal and Fresnel response to the named bath's upper face", () => {
    const bath = { minX: 1, minZ: 2, maxX: 8, maxZ: 9 };
    const appearance = new WaterAppearance(bath);
    const shader = compiled(appearance.material("bath", .9));
    expect(shader.uniforms.sentoHeroEnabled!.value).toBe(1);
    expect(shader.uniforms.sentoHeroBounds!.value.toArray()).toEqual([1, 2, 8, 9]);
    bath.minX = -100; // The caller cannot accidentally change the shader boundary.
    expect(shader.uniforms.sentoHeroBounds!.value.x).toBe(1);
    expect(shader.vertexShader).toContain("vSentoWaterTop = normalize(mat3(modelMatrix) * normal).y;");
    expect(shader.fragmentShader).toContain("step(0.9, vSentoWaterTop)");
    expect(shader.fragmentShader).toContain("normal = normalize(mix(normal, sentoWaveNormal, sentoHero));");
    expect(shader.fragmentShader).toContain("roughnessFactor = mix(roughnessFactor, 0.22, sentoHero);");
    expect(shader.fragmentShader).toContain("material.specularColorBlended = mix(material.specularColorBlended, vec3(0.02), sentoHero);");
    for (const kind of ["pond", "plunge"] as const) {
      expect(compiled(appearance.material(kind, .9)).uniforms.sentoHeroEnabled!.value).toBe(0);
    }
    for (const invalid of [undefined, { ...bath, maxX: -101 }, { ...bath, maxZ: Number.NaN }]) {
      expect(compiled(new WaterAppearance(invalid).material("bath", .9)).uniforms.sentoHeroEnabled!.value).toBe(0);
    }
  });
});

const HERO_BATH = { minX: 0, minZ: 0, maxX: 20, maxZ: 10 };
function wakeFixture() {
  const appearance = new WaterAppearance(HERO_BATH);
  const shader = compiled(appearance.material("bath", .9));
  const samples = shader.uniforms.sentoWake!.value as THREE.Vector4[];
  const active = () => samples.filter(sample => sample.w > 0);
  const move = (steps = 30, startTime = 0) => {
    for (let i = 0; i <= steps; i++) appearance.update(startTime + i / 60, { x: 1 + i / 40, z: 2 });
  };
  return { appearance, samples, active, move };
}

describe("Duck water wake", () => {
  it("emits only from resolved travel, keeps a fixed sample bank and fades after stopping", () => {
    const { appearance, samples, active, move } = wakeFixture();
    appearance.update(0, { x: 1, z: 2 });
    for (let i = 1; i < 60; i++) appearance.update(i / 60, { x: 1, z: 2 });
    expect(active()).toHaveLength(0);
    // Restart the clock to begin the same measured 1.5 m/s movement.
    move(180);
    expect(active().length).toBeGreaterThan(0);
    expect(samples).toHaveLength(WATER_WAKE_CAPACITY);
    expect(active().length).toBeLessThanOrEqual(WATER_WAKE_CAPACITY);
    expect(active().every(s => s.x > 1 && s.x < 5.5 && s.y === 2 && s.w <= 1)).toBe(true);
    const newestBirth = Math.max(...active().map(sample => sample.z));
    for (let t = 3.05; t <= 3 + WATER_WAKE_LIFETIME + .15; t += .05) {
      appearance.update(t, { x: 5.5, z: 2 });
    }
    expect(newestBirth).toBeLessThanOrEqual(3);
    expect(active()).toHaveLength(0);
  });

  it("does not invent movement between high-rate render samples or on a repeated timestamp", () => {
    const { appearance, active } = wakeFixture();
    for (let frame = 0; frame <= 120; frame++) {
      appearance.update(frame / 120, { x: 1 + Math.floor(frame / 2) / 40, z: 2 });
    }
    expect(active().length).toBeGreaterThan(0);
    const before = active().map(s => s.toArray());
    appearance.update(1, { x: 2.5, z: 2 });
    expect(active().map(s => s.toArray())).toEqual(before);
  });

  it.each([
    ["hidden stage", .52, null],
    ["teleport", .52, { x: 15, z: 2 }],
    ["zero-time reposition", .5, { x: 2, z: 2 }],
    ["clock rewind", 0, { x: 1.75, z: 2 }],
    ["long pause", 1, { x: 1.75, z: 2 }],
    ["invalid time", Number.NaN, { x: 1.75, z: 2 }],
    ["invalid position", .52, { x: Number.NaN, z: 2 }],
  ])("clears old waves after %s without producing a connecting trail", (_reason, time, duck) => {
    const { appearance, active, move } = wakeFixture();
    move();
    expect(active().length).toBeGreaterThan(0);
    appearance.update(time, duck);
    expect(active()).toHaveLength(0);
  });

  it("leaves no wake outside the bath and does not join an exit to a later reentry", () => {
    const { appearance, active, move } = wakeFixture();
    move();
    const old = active().map(s => s.toArray());
    appearance.update(.52, { x: 1.75, z: 0 });
    appearance.update(.54, { x: 1.75, z: -.02 });
    expect(active().map(s => s.toArray())).toEqual(old);
    appearance.update(.56, { x: 15, z: 5 });
    expect(active().map(s => s.toArray())).toEqual(old);
    appearance.update(.58, { x: 15.025, z: 5 });
    expect(active().map(s => s.toArray())).toEqual(old);
    // Age the remaining samples while the Duck is out of the selected bath.
    appearance.update(3, { x: 15, z: -1 });
    expect(active()).toHaveLength(0);
  });
});
