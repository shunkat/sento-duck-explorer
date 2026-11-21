// Inspect actual production bytes. These checks do not substitute for GPU or play QA.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHARACTER_MODEL_URLS, ENVIRONMENT_MODEL_URLS, ITEM_MODEL_URLS } from "../src/view/modelEntry";
import { LEVEL } from "../src/level/layout";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url));
const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

describe("complete environment export", () => {
  it("ships every registered model with its measured bytes, embedded resources and license", () => {
    const manifest = JSON.parse(read("assets/manifest.json").toString());
    const urls = Object.values({ ...CHARACTER_MODEL_URLS, ...ITEM_MODEL_URLS, ...ENVIRONMENT_MODEL_URLS });
    expect(urls).toHaveLength(18);
    let totalBytes = 0;
    for (const url of urls) {
      const id = url.slice("models/".length, -4);
      const asset = manifest.assets[id];
      const bytes = read(`public/${url}`);
      totalBytes += bytes.length;
      expect([sha(bytes), bytes.length], id).toEqual([asset.measured.sha256, asset.measured.glb_bytes]);
      const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
      expect(gltf.buffers.every((b: { uri?: string }) => !b.uri), id).toBe(true);
      expect((gltf.images ?? []).every((image: { uri?: string; bufferView?: number }) =>
        !image.uri && Number.isInteger(image.bufferView)), id).toBe(true);
      expect(gltf.cameras ?? [], id).toHaveLength(0);
      expect(gltf.extensions?.KHR_lights_punctual?.lights ?? [], id).toHaveLength(0);
      expect(read(`public/${url.replace(/\.glb$/, ".LICENSE.txt")}`).length, id).toBeGreaterThan(100);
    }
    expect(totalBytes / 1_000_000).toBeLessThanOrEqual(manifest.scene_limits.stage2_download_mb);
    console.info("Registered model download bytes:", totalBytes);
  });

  it("keeps the inspected environment tied to the current authoritative layout and clear openings", () => {
    const report = JSON.parse(read("assets/sento_environment/quality/measurements.json").toString());
    const fixtureBoxes = new Set(LEVEL.fixtures.map(f => f.box));
    const placement = {
      zones: LEVEL.zones, structural_walls: LEVEL.walls.filter(b => !fixtureBoxes.has(b)),
      fixtures: LEVEL.fixtures, decor: LEVEL.decor, npcs: LEVEL.npcs,
      crowdGaps: LEVEL.crowdGaps, narrowHole: LEVEL.narrowHole, duckWater: LEVEL.duckWater,
      saunaDoorBlocker: LEVEL.saunaDoorBlocker, doors: LEVEL.doors, nodes: LEVEL.nodes,
    };
    expect(sha(JSON.stringify(placement))).toBe(report.layout_sha256);
    expect(sha(read("public/models/sento_environment.glb"))).toBe(report.export_sha256);
    expect(report.source_placement_count).toBe(111);
    for (const [category, entries] of Object.entries({ structural_walls: placement.structural_walls,
      fixtures: LEVEL.fixtures, decor: LEVEL.decor, npcs: LEVEL.npcs, zones: LEVEL.zones })) {
      entries.forEach((_, i) => expect(report.coverage[`${category}_${String(i).padStart(2, "0")}`],
        `${category} placement ${i}`).toBeTruthy());
    }
    expect(report.clearances).toHaveLength(11);
    for (const opening of report.clearances) expect(opening.intersecting_triangles, opening.id).toBe(0);
    expect(report.npc_slots).toHaveLength(7);
    expect(report.seating_board_clearances).toHaveLength(5);
    for (const seat of report.seating_board_clearances) {
      expect(seat.intersecting_npc_triangles, seat.slot).toBe(0);
    }
    expect(report.all_seating_boards_clear).toBe(true);
    expect(report.raw_degenerate_npc_triangles).toBe(0);
    // The old bmesh area calculation missed 16 zero-area bench triangles.
    // NPC replacement preserves architecture bytes and does not add any.
    expect(report.raw_degenerate_architecture_triangles).toBe(16);
    expect(report.degenerate_faces).toBe(report.raw_degenerate_architecture_triangles);
  });

  it("uses the independent adults in all seven embedded NPC slots", () => {
    const bytes = read("public/models/sento_environment.glb");
    const world = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const slots = world.nodes.filter((node: { name?: string }) => node.name?.startsWith("npc_slot_"));
    expect(slots).toHaveLength(7);
    const roles = new Set<string>();
    for (const slot of slots) {
      const role = slot.extras.npc_role;
      roles.add(role);
      expect(slot.extras.source_author, slot.name).toBe("Quaternius");
      expect(slot.extras.source_sha256, slot.name).toBe(sha(read(`public/models/${role}.glb`)));
      expect(slot.extras.source_glb, slot.name).toBe(`public/models/${role}.glb`);
      const visit = (index: number): void => {
        const node = world.nodes[index];
        if (node.mesh !== undefined) {
          expect(node.extras.source_author, node.name).toBe("Quaternius");
          expect(node.extras.source_sha256, node.name).toBe(slot.extras.source_sha256);
        }
        for (const child of node.children ?? []) visit(child);
      };
      for (const child of slot.children ?? []) visit(child);
    }
    expect([...roles].sort()).toEqual(["npc_bath_standing", "npc_seated", "npc_staff"]);
  });
});
