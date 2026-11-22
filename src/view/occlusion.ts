// Is the straight line from the eye to a point blocked by something that is
// actually drawn? Uses the real scene meshes, so props, bodies, low fixtures
// and doors count exactly as far as they hit the depth buffer: visible,
// opaque, depth-writing meshes. Hidden LODs, faded bodies and transparent
// surfaces do not block.
import * as THREE from "three";
const _ray = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _hits: THREE.Intersection[] = [];
/** Opaque and writes depth: what a depth test against the text would hide it behind. */
export function blocksView(m: THREE.Material): boolean {
  return !m.transparent && m.opacity >= 1 && m.depthWrite && m.visible;
}
function collect(o: THREE.Object3D, ignore: ReadonlySet<THREE.Object3D>, out: THREE.Mesh[]): void {
  if (!o.visible || ignore.has(o)) return;
  if (o instanceof THREE.Mesh && !(o instanceof THREE.Sprite)) {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some(blocksView)) out.push(o);
  }
  for (const c of o.children) collect(c, ignore, out);
}
/** Meshes under `root` that can hide a point; invisible subtrees are skipped (the raycaster would not). */
export function occluders(root: THREE.Object3D, ignore: readonly THREE.Object3D[] = []): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  collect(root, new Set(ignore), out);
  return out;
}
/** True when a blocking mesh lies between `from` and `to` (the last 2 cm in front of `to` are free). */
export function lineBlocked(meshes: readonly THREE.Mesh[], from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): boolean {
  _from.set(from.x, from.y, from.z);
  _to.set(to.x, to.y, to.z);
  const dist = _from.distanceTo(_to);
  if (dist < 0.05) return false;
  _dir.subVectors(_to, _from).normalize();
  _ray.set(_from, _dir);
  _ray.near = 0;
  _ray.far = dist - 0.02;
  _hits.length = 0;
  for (const m of meshes) {
    m.updateWorldMatrix(true, false);
    m.raycast(_ray, _hits);
    if (_hits.length > 0) {
      // Only hits on a blocking material count (multi-material meshes).
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (_hits.some((h) => blocksView(mats[h.face?.materialIndex ?? 0] ?? mats[0]!))) return true;
      _hits.length = 0;
    }
  }
  return false;
}
