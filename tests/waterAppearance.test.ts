import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { WaterAppearance } from "../src/view/waterAppearance";

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
});
