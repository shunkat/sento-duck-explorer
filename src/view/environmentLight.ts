import * as THREE from "three";

/** A small, continuous neutral sky/room probe for the PBR materials.
 * Metal has little diffuse response, so hemisphere lights alone leave it dark.
 * Three.js prefilters this static cube once; it adds no scene geometry/downloads.
 */
export function createEnvironmentLight(): THREE.CubeTexture {
  const size = 32;
  const windowDirection = new THREE.Vector3(.6, .65, .45).normalize();
  const faces: THREE.DataTexture[] = [];
  for (let face = 0; face < 6; face++) {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = 2 * (x + .5) / size - 1, v = 2 * (y + .5) / size - 1;
      const direction = [
        [1, -v, -u], [-1, -v, u], [u, 1, v],
        [u, -1, -v], [u, -v, 1], [-u, -v, -1],
      ][face]!;
      const ray = new THREE.Vector3(...direction).normalize();
      const softWindow = Math.pow(Math.max(0, ray.dot(windowDirection)), 16) * .38;
      const level = .24 + .43 * (ray.y + 1) / 2 + softWindow;
      const i = (y * size + x) * 4;
      data[i] = Math.round(255 * Math.min(1, level * 1.02));
      data[i + 1] = Math.round(255 * Math.min(1, level));
      data[i + 2] = Math.round(255 * Math.min(1, level * .97));
      data[i + 3] = 255;
    }
    faces.push(new THREE.DataTexture(data, size, size));
  }
  const probe = new THREE.CubeTexture(faces);
  probe.name = "sento_static_reflection_light";
  probe.colorSpace = THREE.LinearSRGBColorSpace;
  probe.needsUpdate = true;
  return probe;
}
