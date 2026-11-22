// Authored world-space environment. These nodes own visibility; no runtime
// normalization or layout inference may move the architectural geometry.
import * as THREE from "three";
import type { ModelLibrary } from "./models";
import { BackgroundNpcs, NPC_LOD_IDS } from "./backgroundNpcs";

export const WORLD_ENVIRONMENT_ID = "sento_environment";
export const WORLD_ENVIRONMENT_NODES = ["environment_static", "environment_upper", "environment_ceiling", "sauna_door"] as const;
type Part = typeof WORLD_ENVIRONMENT_NODES[number];
type Parts = Record<Part, THREE.Object3D>;
/**
 * Optional dynamic doors of the growth export (2026-11-22, `.local` level export
 * contract): direct children of the root with identity transform, hidden while
 * open; their `<name>_upper` child is hidden in the Overview. Both or neither.
 */
export const WORLD_DOOR_NODES = { kidsGate: "growth_kids_gate", frontExit: "growth_front_exit" } as const;
type DoorId = keyof typeof WORLD_DOOR_NODES;
type Doors = Record<DoorId, { node: THREE.Object3D; upper: THREE.Object3D | null }>;

const isIdentity = (o: THREE.Object3D) => o.position.lengthSq() <= 1e-12 &&
  o.quaternion.angleTo(new THREE.Quaternion()) <= 1e-6 && o.scale.distanceTo(new THREE.Vector3(1, 1, 1)) <= 1e-6;

/** The door pair, null when absent, or "invalid" when it breaks the contract. */
function inspectDoors(root: THREE.Object3D): Doors | null | "invalid" {
  const found: Partial<Doors> = {};
  for (const [id, name] of Object.entries(WORLD_DOOR_NODES) as [DoorId, string][]) {
    const matches: THREE.Object3D[] = [];
    root.traverse(o => { if (o.name === name) matches.push(o); });
    if (matches.length > 1) return "invalid";
    const node = matches[0];
    if (!node) continue;
    let meshes = 0;
    node.traverse(o => { if (o instanceof THREE.Mesh) meshes++; });
    if (node.parent !== root || !isIdentity(node) || !meshes) return "invalid";
    found[id] = { node, upper: node.getObjectByName(`${name}_upper`) ?? null };
  }
  const n = Object.keys(found).length;
  if (n === 0) return null;
  return n === 2 ? found as Doors : "invalid";
}

function inspect(root: THREE.Object3D): { parts: Parts; doors: Doors | null } | null {
  if (!isIdentity(root)) return null;
  const doors = inspectDoors(root);
  if (doors === "invalid") return null;
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
  const owners = [...Object.values(found), ...(doors ? Object.values(doors).map(d => d.node) : [])];
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    let owner: THREE.Object3D | null = o;
    while (owner && !owners.includes(owner)) owner = owner.parent;
    if (!owner) valid = false;
    const p = o.geometry.getAttribute("position");
    if (!p?.count) { valid = false; return; }
    for (let i = 0; i < p.count; i++) {
      if (![p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite)) { valid = false; break; }
    }
    if (!o.matrixWorld.elements.every(Number.isFinite)) valid = false;
  });
  return valid ? { parts: found, doors } : null;
}

export class WorldEnvironment {
  private attempted?: (THREE.Object3D | undefined)[];
  private current?: { root: THREE.Object3D; parts: Parts; doors: Doors | null; npcs: BackgroundNpcs };
  private doorsOpen: Record<DoorId, boolean> = { kidsGate: false, frontExit: false };
  private overview = false;
  private doorLocked = true;
  private eye = new THREE.Vector3();

  constructor(private parent: THREE.Object3D, private fallback: THREE.Object3D) {}

  get active(): boolean { return this.current !== undefined; }

  /** True when the loaded export draws the growth doors and fixed growth geometry itself. */
  get hasGrowthDoors(): boolean { return this.current?.doors != null; }

  use(lib: ModelLibrary): void {
    const source = lib.get(WORLD_ENVIRONMENT_ID)?.root;
    const bank = [source, ...NPC_LOD_IDS.map(id => lib.get(id)?.root)];
    if (bank.some(model => !model) || bank.every((model, i) => this.attempted?.[i] === model)) return;
    this.attempted = bank;
    if (!source) return;
    const root = source.clone(true);
    const inspected = inspect(root);
    const npcs = inspected ? BackgroundNpcs.create(root, lib) : null;
    if (!inspected || !npcs) {
      console.warn("World environment failed its named-part/geometry contract; keeping the current display.");
      return;
    }
    this.current?.root.removeFromParent();
    root.name = WORLD_ENVIRONMENT_ID;
    this.parent.add(root);
    this.current = { root, parts: inspected.parts, doors: inspected.doors, npcs };
    this.fallback.visible = false;
    this.setView(this.overview, this.doorLocked);
    npcs.update(this.eye, this.overview);
  }

  setView(overview: boolean, doorLocked = this.doorLocked, doorsOpen = this.doorsOpen): void {
    this.overview = overview;
    this.doorLocked = doorLocked;
    this.doorsOpen = doorsOpen;
    if (!this.current) return;
    for (const [id, d] of Object.entries(this.current.doors ?? {}) as [DoorId, Doors[DoorId]][]) {
      d.node.visible = !doorsOpen[id];
      if (d.upper) d.upper.visible = !overview;
    }
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
