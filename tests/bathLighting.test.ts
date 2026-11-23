import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { BathLighting } from "../src/view/bathLighting";
import { createEnvironmentLight } from "../src/view/environmentLight";
import { LEVEL } from "../src/level/layout";
import { createInitialState } from "../src/core/initialState";
import { deriveView } from "../src/view/deriveView";

describe("bath lighting and contact shading", () => {
  it("keeps dynamic contacts on the dry floor and follows stage, movement and overview", () => {
    const lighting = new BathLighting(LEVEL), state = createInitialState(LEVEL);
    const player = lighting.root.getObjectByName("player_contact")!;
    const guardian = lighting.root.getObjectByName("guardian_contact")!;
    lighting.update(deriveView(state, LEVEL), false);
    expect(player.visible).toBe(false); // Duck floats, it has no floor shadow.
    state.player.stage = "adult";
    state.player.pos = { x: 7, z: 3 };
    state.guardian.pos = { x: 8, z: 3 };
    lighting.update(deriveView(state, LEVEL), false);
    expect(player.visible).toBe(true);
    expect(guardian.visible).toBe(true);
    expect(player.position.x).toBe(7);
    state.player.pos = { x: 7, z: 5.25 }; // Patch would straddle the water edge.
    state.guardian.pos = { x: 7, z: 6 };
    lighting.update(deriveView(state, LEVEL), false);
    expect(player.visible).toBe(false);
    expect(guardian.visible).toBe(false);
    state.player.pos = { x: 5, z: -2 }; // Outside the finished bath area.
    lighting.update(deriveView(state, LEVEL), true);
    expect(player.visible).toBe(false);
    expect(lighting.root.getObjectByName("bath_ceiling_lights")!.visible).toBe(false);
    lighting.update(deriveView(state, LEVEL), false);
    expect(lighting.root.getObjectByName("bath_ceiling_lights")!.visible).toBe(true);
    lighting.dispose();
  });

  it("uses only single-sided planes and local unshadowed lights, with reusable resources", () => {
    const lighting = new BathLighting(LEVEL);
    let triangles = 0, lights = 0;
    lighting.root.traverse(object => {
      if (object instanceof THREE.Mesh) {
        triangles += object.geometry.index!.count / 3;
        const material = object.material as THREE.Material;
        expect(material.side).toBe(THREE.FrontSide);
        if (object.name.endsWith("contact")) {
          expect(material.depthWrite).toBe(false);
          expect(material.transparent).toBe(true);
        }
      }
      if (object instanceof THREE.PointLight) {
        lights++;
        expect(object.castShadow).toBe(false);
        expect(object.distance).toBeLessThanOrEqual(4.8);
      }
    });
    expect(lights).toBe(2);
    expect(triangles).toBeLessThanOrEqual(24);
    lighting.dispose();
  });

  it("builds a finite six-face linear reflection probe without a live camera", () => {
    const probe = createEnvironmentLight();
    expect(probe.colorSpace).toBe(THREE.LinearSRGBColorSpace);
    expect(probe.images).toHaveLength(6);
    for (const face of probe.images as THREE.DataTexture[]) {
      expect(face.image.width).toBe(64);
      expect(face.image.height).toBe(64);
      const data = face.image.data as Uint8Array;
      expect(data.length).toBe(64 * 64 * 4);
      for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
    }
    probe.dispose();
  });
});
