import * as THREE from "three";

/** A compact authored room probe for PBR reflections. Frosted high windows and
 * ceiling strips give the wet surfaces something shaped to reflect. This is a
 * static approximation, not a capture of moving characters or the live scene.
 * Three.js prefilters it once; no reflection-camera passes or downloads.
 */
export function createEnvironmentLight(): THREE.CubeTexture {
  const size = 64;
  const softBox = (x: number, center: number, halfWidth: number, feather: number) =>
    1 - THREE.MathUtils.smoothstep(Math.abs(x - center), halfWidth - feather, halfWidth);
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
      const window = ray.x > 0 ? softBox(ray.z / ray.x, -.08, .58, .055) *
        softBox(ray.y / ray.x, .4, .19, .045) : 0;
      const strip = ray.y > 0 ? softBox(ray.x / ray.y, .12, .48, .06) *
        Math.max(softBox(ray.z / ray.y, -.6, .08, .035), softBox(ray.z / ray.y, .65, .08, .035)) : 0;
      // Bright plaster/tile bounce fills the room, including its lower hemisphere.
      // Keep shaped highlights distinct without making unlit directions murky.
      const level = .32 + .38 * (ray.y + 1) / 2;
      const daylight = window * .48;
      const warmStrip = strip * .34;
      const i = (y * size + x) * 4;
      data[i] = Math.round(255 * Math.min(1, level * 1.02 + daylight * .97 + warmStrip));
      data[i + 1] = Math.round(255 * Math.min(1, level * 1.015 + daylight + warmStrip * .96));
      data[i + 2] = Math.round(255 * Math.min(1, level + daylight * 1.04 + warmStrip * .88));
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
