// Authored world-space environment. These nodes own visibility; no runtime
// normalization or layout inference may move the architectural geometry.
import * as THREE from "three";
import type { ModelLibrary } from "./models";
import { BackgroundNpcs, NPC_LOD_IDS } from "./backgroundNpcs";

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
  private attempted?: (THREE.Object3D | undefined)[];
  private current?: { root: THREE.Object3D; parts: Parts; npcs: BackgroundNpcs };
  private overview = false;
  private doorLocked = true;
  private eye = new THREE.Vector3();

  constructor(private parent: THREE.Object3D, private fallback: THREE.Object3D) {}

  get active(): boolean { return this.current !== undefined; }

  use(lib: ModelLibrary): void {
    const source = lib.get(WORLD_ENVIRONMENT_ID)?.root;
    const bank = [source, ...NPC_LOD_IDS.map(id => lib.get(id)?.root)];
    if (bank.some(model => !model) || bank.every((model, i) => this.attempted?.[i] === model)) return;
    this.attempted = bank;
    if (!source) return;
    const root = source.clone(true);
    const parts = inspect(root);
    const npcs = parts ? BackgroundNpcs.create(root, lib) : null;
    if (!parts || !npcs) {
      console.warn("World environment failed its named-part/geometry contract; keeping the current display.");
      return;
    }
    this.current?.root.removeFromParent();
    root.name = WORLD_ENVIRONMENT_ID;
    this.parent.add(root);
    this.current = { root, parts, npcs };
    this.fallback.visible = false;
    this.setView(this.overview, this.doorLocked);
    npcs.update(this.eye, this.overview);
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
    this.current.npcs.update(this.eye, overview);
  }

  updateDetail(eye: THREE.Vector3): void {
    this.eye.copy(eye);
    this.current?.npcs.update(eye, this.overview);
  }
}
