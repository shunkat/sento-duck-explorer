import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { WorldEnvironment, WORLD_ENVIRONMENT_NODES } from "../src/view/worldEnvironment";
import { ModelLibrary } from "../src/view/models";
import { NPC_LOD_IDS, NPC_SLOTS } from "../src/view/backgroundNpcs";

const material = new THREE.MeshStandardMaterial();
function world(): THREE.Group {
  const root = new THREE.Group();
  WORLD_ENVIRONMENT_NODES.forEach((name, i) => {
    const part = new THREE.Group();
    part.name = name;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.position.set(3 + i, .5 + i, -2);
    part.add(mesh);
    root.add(part);
  });
  for (const [suffix] of NPC_SLOTS) {
    const slot = new THREE.Group(); slot.name = `npc_slot_${suffix}`;
    const high = new THREE.Mesh(new THREE.BoxGeometry(.4, .4, .4), material);
    high.name = `npc_high_${suffix}`; slot.add(high);
    root.getObjectByName("environment_static")!.add(slot);
  }
  return root;
}
function library(get: () => THREE.Object3D): ModelLibrary {
  return new ModelLibrary({ loadAsync: async url => ({ scene: url === "npc-fixture"
    ? new THREE.Mesh(new THREE.BoxGeometry(.4, .4, .4), material) : get() }), parseAsync: async () => ({ scene: get() }) });
}
async function loadNpcs(lib: ModelLibrary): Promise<void> {
  for (const id of NPC_LOD_IDS) await lib.load(id, "npc-fixture");
}
afterEach(() => vi.restoreAllMocks());

describe("authored world environment", () => {
  it("replaces all owned fallback surfaces and applies cutaway/door state without moving geometry", async () => {
    const parent = new THREE.Group(), fallback = new THREE.Group();
    const priorBatch = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4), material);
    fallback.add(priorBatch); parent.add(fallback);
    const adapter = new WorldEnvironment(parent, fallback);
    const source = world(), lib = library(() => source);
    await loadNpcs(lib);
    adapter.setView(true, false); // A model may load after the camera/state changed.
    await lib.load("sento_environment", "world-fixture");
    adapter.use(lib); adapter.use(lib);
    expect(parent.children).toHaveLength(2);
    expect(fallback.visible).toBe(false);
    const result = parent.children.find(o => o.name === "sento_environment")!;
    const before = new THREE.Box3().setFromObject(source, true);
    expect(new THREE.Box3().setFromObject(result, true).equals(before)).toBe(true);
    expect(result.getObjectByName("environment_static")!.visible).toBe(true);
    expect(result.getObjectByName("environment_upper")!.visible).toBe(false);
    expect(result.getObjectByName("environment_ceiling")!.visible).toBe(false);
    expect(result.getObjectByName("sauna_door")!.visible).toBe(false);
    for (const node of source.children) expect(node.visible).toBe(true);
    expect(source.parent).toBeNull();
    for (const [overview, locked] of [[false, true], [true, true], [false, false]] as const) {
      adapter.setView(overview, locked);
      expect(result.getObjectByName("environment_upper")!.visible).toBe(!overview);
      expect(result.getObjectByName("environment_ceiling")!.visible).toBe(!overview);
      expect(result.getObjectByName("sauna_door")!.visible).toBe(locked);
      expect(new THREE.Box3().setFromObject(result, true).equals(before)).toBe(true);
    }
  });

  it("keeps the previous display on malformed parts, unowned geometry, or non-world transforms", async () => {
    const parent = new THREE.Group(), fallback = new THREE.Group(); parent.add(fallback);
    const adapter = new WorldEnvironment(parent, fallback);
    let candidate: THREE.Object3D = world();
    const lib = library(() => candidate);
    await loadNpcs(lib);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    candidate.remove(candidate.getObjectByName("sauna_door")!);
    await lib.load("sento_environment", "missing-door"); adapter.use(lib); adapter.use(lib);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(fallback.visible).toBe(true);
    candidate = world();
    await lib.load("sento_environment", "valid"); adapter.use(lib);
    const accepted = parent.getObjectByName("sento_environment");
    for (const invalid of [() => {
      const m = world(); m.position.x = 1; return m;
    }, () => {
      const m = world(); m.add(new THREE.Mesh(new THREE.BoxGeometry(), material)); return m;
    }, () => {
      const m = world(); m.getObjectByName("environment_upper")!.add(m.getObjectByName("environment_static")!); return m;
    }, () => {
      const m = world(); const mesh = m.children[0]!.children[0] as THREE.Mesh;
      mesh.geometry.getAttribute("position").setX(0, Number.NaN); return m;
    }]) {
      candidate = invalid();
      await lib.load("sento_environment", "invalid"); adapter.use(lib);
      expect(parent.getObjectByName("sento_environment")).toBe(accepted);
      expect(fallback.visible).toBe(false);
    }
    expect(parent.children).toHaveLength(2);
  });
});

describe("growth door contract (2026-11-22, optional pair)", () => {
  const withDoors = (opts: { only?: "growth_kids_gate"; moved?: boolean } = {}) => {
    const root = world();
    for (const name of opts.only ? [opts.only] : ["growth_kids_gate", "growth_front_exit"]) {
      const node = new THREE.Group(); node.name = name;
      if (opts.moved) node.position.set(1, 0, 0);
      node.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, .2), material));
      const upper = new THREE.Group(); upper.name = `${name}_upper`;
      upper.add(new THREE.Mesh(new THREE.BoxGeometry(1, .7, .2), material));
      node.add(upper);
      root.add(node);
    }
    return root;
  };
  const load = async (root: THREE.Object3D) => {
    const parent = new THREE.Group(), fallback = new THREE.Group();
    parent.add(fallback);
    const adapter = new WorldEnvironment(parent, fallback);
    const lib = library(() => root);
    await lib.load("sento_environment", "world");
    await loadNpcs(lib);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    adapter.use(lib);
    return { adapter, parent };
  };

  it("today's export without door nodes still loads and reports no growth doors", async () => {
    const { adapter } = await load(world());
    expect(adapter.active).toBe(true);
    expect(adapter.hasGrowthDoors).toBe(false);
  });

  it("with both door nodes: closed shows them, open hides the whole node, _upper hides only in the Overview", async () => {
    const { adapter, parent } = await load(withDoors());
    expect(adapter.hasGrowthDoors).toBe(true);
    const gate = parent.getObjectByName("growth_kids_gate")!;
    const gateUpper = parent.getObjectByName("growth_kids_gate_upper")!;
    const exit = parent.getObjectByName("growth_front_exit")!;
    adapter.setView(false, false, { kidsGate: false, frontExit: false });
    expect([gate.visible, gateUpper.visible, exit.visible]).toEqual([true, true, true]);
    adapter.setView(true, false, { kidsGate: false, frontExit: false });
    expect([gate.visible, gateUpper.visible]).toEqual([true, false]);
    adapter.setView(false, false, { kidsGate: true, frontExit: false });
    expect([gate.visible, exit.visible]).toEqual([false, true]);
  });

  it("rejects one door alone or a moved door node (keeps the current display)", async () => {
    expect((await load(withDoors({ only: "growth_kids_gate" }))).adapter.active).toBe(false);
    expect((await load(withDoors({ moved: true }))).adapter.active).toBe(false);
  });
});
