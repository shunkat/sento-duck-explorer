// Authored world-space environment. These nodes own visibility; no runtime
// normalization or layout inference may move the architectural geometry.
import * as THREE from "three";
import type { ModelLibrary } from "./models";

export const WORLD_ENVIRONMENT_ID = "sento_environment";
export const WORLD_ENVIRONMENT_NODES = ["environment_static", "environment_upper", "environment_ceiling", "sauna_door"] as const;
type Part = typeof WORLD_ENVIRONMENT_NODES[number];
type Parts = Record<Part, THREE.Object3D>;

function inspect(root: THREE.Object3D): Parts | null {
  if (root.position.lengthSq() > 1e-12 || root.quaternion.angleTo(new THREE.Quaternion()) > 1e-6 ||
      root.scale.distanceTo(new THREE.Vector3(1, 1, 1)) > 1e-6) return null;
  const found = {} as Parts;
  for (const name of WORLD_ENVIRONMENT_NODES) {
    const matches: THREE.Object3D[] = [];
    root.traverse(o => { if (o.name === name) matches.push(o); });
    if (matches.length !== 1) return null;
    found[name] = matches[0]!;
    let meshes = 0;
    matches[0]!.traverse(o => { if (o instanceof THREE.Mesh) meshes++; });
    if (!meshes) return null;
  }
  // A part must not own another part: otherwise hiding upper walls could
  // accidentally hide the entire building or the locked door.
  for (const part of Object.values(found)) {
    for (let p = part.parent; p && p !== root; p = p.parent) {
      if (Object.values(found).includes(p)) return null;
    }
  }
  root.updateMatrixWorld(true);
  let valid = true;
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    let owner: THREE.Object3D | null = o;
    while (owner && !Object.values(found).includes(owner)) owner = owner.parent;
    if (!owner) valid = false;
    const p = o.geometry.getAttribute("position");
    if (!p?.count) { valid = false; return; }
    for (let i = 0; i < p.count; i++) {
      if (![p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite)) { valid = false; break; }
    }
    if (!o.matrixWorld.elements.every(Number.isFinite)) valid = false;
  });
  return valid ? found : null;
}

export class WorldEnvironment {
  private attempted?: THREE.Object3D;
  private current?: { root: THREE.Object3D; parts: Parts };
  private overview = false;
  private doorLocked = true;

  constructor(private parent: THREE.Object3D, private fallback: THREE.Object3D) {}

  use(lib: ModelLibrary): void {
    const source = lib.get(WORLD_ENVIRONMENT_ID)?.root;
    if (!source || source === this.attempted) return;
    this.attempted = source;
    const root = source.clone(true);
    const parts = inspect(root);
    if (!parts) {
      console.warn("World environment failed its named-part/geometry contract; keeping the current display.");
      return;
    }
    this.current?.root.removeFromParent();
    root.name = WORLD_ENVIRONMENT_ID;
    this.parent.add(root);
    this.current = { root, parts };
    this.fallback.visible = false;
    this.setView(this.overview, this.doorLocked);
  }

  setView(overview: boolean, doorLocked = this.doorLocked): void {
    this.overview = overview;
    this.doorLocked = doorLocked;
    if (!this.current) return;
    const p = this.current.parts;
    p.environment_static.visible = true;
    p.environment_upper.visible = !overview;
    p.environment_ceiling.visible = !overview;
    p.sauna_door.visible = doorLocked;
  }
}
