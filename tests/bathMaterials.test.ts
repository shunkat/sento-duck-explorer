import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { BathMaterials } from "../src/view/bathMaterials";
import { box } from "../src/sim/geometry";
import { LEVEL } from "../src/level/layout";

const bounds = () => box(4.2, 0.1, 11.9, 8.9);
const tile = (name: string) => {
  const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), roughness: 0.62 });
  material.name = name;
  return material;
};
function compiled(material: THREE.Material) {
  const shader = {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  } as Parameters<THREE.Material["onBeforeCompile"]>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

describe("bath tile material pilot", () => {
  it("shares refinements across world batches without changing source materials, geometry or other surfaces", () => {
    const bath = new BathMaterials(bounds());
    const source = tile("ceramic_teal");
    const wood = tile("cedar");
    const wall = new THREE.Mesh(new THREE.BoxGeometry(), source);
    const second = new THREE.Mesh(wall.geometry, source);
    const mixed = new THREE.Mesh(new THREE.BoxGeometry(), [source, wood]);
    const mural = new THREE.Mesh(new THREE.BoxGeometry(), tile("fuji_mural"));
    const noMap = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    noMap.material.name = "bath_floor";
    const noUv = new THREE.Mesh(new THREE.BufferGeometry(), source);
    const root = new THREE.Group().add(wall, second, mixed, mural, noMap, noUv);
    const before = root.children.map(o => (o as THREE.Mesh).material);
    const geometry = wall.geometry;
    bath.apply(root);
    const material = wall.material;
    expect(material).not.toBe(source);
    expect(second.material).toBe(material);
    expect(mixed.material).toEqual([material, wood]);
    expect([mural.material, noMap.material, noUv.material]).toEqual(before.slice(3));
    expect(wall.geometry).toBe(geometry);
    expect(material.map).toBe(source.map);
    expect(source.roughness).toBe(0.62);
    for (const key of ["transparent", "opacity", "depthWrite", "side", "blending", "fog", "forceSinglePass"] as const) {
      expect(material[key], key).toBe(source[key]);
    }
    bath.apply(root);
    expect(wall.material).toBe(material);
    expect(second.material).toBe(material);
    expect(mixed.material).toEqual([material, wood]);
    bath.dispose();
    expect(root.children.map(o => (o as THREE.Mesh).material)).toEqual(before);
  });

  it("releases only its material clones and leaves another owner's replacement intact", () => {
    const bath = new BathMaterials(bounds());
    const source = tile("bath_floor");
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), source);
    const originalDispose = vi.fn();
    const textureDispose = vi.fn();
    source.addEventListener("dispose", originalDispose);
    source.map!.addEventListener("dispose", textureDispose);
    bath.apply(mesh);
    const cloneDispose = vi.fn();
    mesh.material.addEventListener("dispose", cloneDispose);
    const other = tile("bath_floor");
    mesh.material = other;
    bath.dispose();
    bath.dispose();
    expect(mesh.material).toBe(other);
    expect(cloneDispose).toHaveBeenCalledTimes(1);
    expect(originalDispose).not.toHaveBeenCalled();
    expect(textureDispose).not.toHaveBeenCalled();
  });

  it("patches the installed standard shader, retains prior hooks and keeps world bounds and wet areas independent of UVs", () => {
    const region = bounds();
    const bath = new BathMaterials(region);
    const source = tile("bath_floor");
    source.onBeforeCompile = shader => { shader.uniforms.existingOwner = { value: 7 }; };
    source.customProgramCacheKey = () => "existing-owner";
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), source);
    bath.apply(mesh);
    region.minX = -100;
    const shader = compiled(mesh.material);
    expect(shader.uniforms.existingOwner!.value).toBe(7);
    expect(mesh.material.customProgramCacheKey()).toContain("existing-owner");
    expect(shader.uniforms.sentoBathBounds!.value.toArray()).toEqual([4.2, 0.1, 11.9, 8.9]);
    expect(shader.uniforms.sentoBathIsFloor!.value).toBe(1);
    const water = LEVEL.zones.find(z => z.id === "bathwater")!.box;
    expect(shader.uniforms.sentoBathWaterBounds!.value.toArray())
      .toEqual([water.minX, water.minZ, water.maxX, water.maxZ]);
    expect(shader.vertexShader).toContain("vSentoBathWorld = (modelMatrix * vec4(position, 1.0)).xyz;");
    expect(shader.fragmentShader).toContain("sentoBathTileHeight(vMapUv)");
    expect(shader.fragmentShader).toContain("roughnessFactor = mix(roughnessFactor, sentoBathRoughness, sentoBathMask);");
    expect(shader.fragmentShader).toContain("normal = normalize(mix(normal, sentoBathNormal, sentoBathMask));");
    // The zero-outside mask must blend both lighting and normals, rather than
    // lowering the shared material's roughness for every room in the GLB.
    expect(shader.fragmentShader).toContain("smoothstep(0.0, 0.28, min(inside.x, inside.y))");
    expect(mesh.material.roughness).toBe(source.roughness);
    for (const chunk of ["map_fragment", "alphatest_fragment", "lights_fragment_begin", "fog_fragment"]) {
      expect(shader.fragmentShader).toContain(`#include <${chunk}>`);
    }
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(), tile("ceramic_cream"));
    bath.apply(wall);
    expect(compiled(wall.material).uniforms.sentoBathIsFloor!.value).toBe(0);
  });

  it("matches the actual GLB tile-map contract used for the grout relief", () => {
    const bytes = readFileSync(new URL("../public/models/sento_environment.glb", import.meta.url));
    const jsonLength = bytes.readUInt32LE(12);
    const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
    const binaryStart = 20 + jsonLength + 8;
    for (const name of ["ceramic_cream", "ceramic_teal", "bath_floor"]) {
      const material = gltf.materials.find((m: { name: string }) => m.name === name);
      const map = material.pbrMetallicRoughness.baseColorTexture;
      const texture = gltf.textures[map.index];
      const sampler = gltf.samplers[texture.sampler];
      // glTF defaults to repeat; the shader's fract() must match this wrapping.
      expect(sampler.wrapS ?? 10497).toBe(10497);
      expect(sampler.wrapT ?? 10497).toBe(10497);
      expect(map.texCoord ?? 0).toBe(0);
      expect(material.normalTexture).toBeUndefined();
      const image = gltf.images[texture.source];
      expect(image.mimeType).toBe("image/png");
      const view = gltf.bufferViews[image.bufferView];
      const start = binaryStart + (view.byteOffset ?? 0);
      expect([bytes.readUInt32BE(start + 16), bytes.readUInt32BE(start + 20)]).toEqual([512, 512]);
    }
  });

  it("rejects invalid pilot bounds before touching any material", () => {
    expect(() => new BathMaterials({ minX: 0, minZ: 0, maxX: 0, maxZ: 1 })).toThrow();
    expect(() => new BathMaterials({ minX: 0, minZ: 0, maxX: Infinity, maxZ: 1 })).toThrow();
  });
});
