// Inspect actual production bytes. These checks do not substitute for GPU or play QA.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHARACTER_MODEL_URLS, ENVIRONMENT_MODEL_URLS, ITEM_MODEL_URLS } from "../src/view/modelEntry";
import { GROWTH_FIXTURE_KINDS, isStreetFixture, LEVEL } from "../src/level/layout";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url));
const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

describe("complete environment export", () => {
  it("ships every registered model with its measured bytes, embedded resources and license", () => {
    const manifest = JSON.parse(read("assets/manifest.json").toString());
    const urls = Object.values({ ...CHARACTER_MODEL_URLS, ...ITEM_MODEL_URLS, ...ENVIRONMENT_MODEL_URLS });
    expect(urls).toHaveLength(17); // 18 before the retired coin, key and hat stopped (2026-11-21); +1 guardian NPC, +1 milk bottle (2026-11-22)
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
      doors: LEVEL.doors, nodes: LEVEL.nodes, highDoors: LEVEL.highDoors,
    };
    // growth_v02 re-export (2026-11-22) from the final growth geometry: the hash matches again.
    expect(sha(JSON.stringify(placement))).toBe(report.layout_sha256);
    expect(report.layout_sha256).toBe("01d4ef0eda8966fe87ec3ac4551bcce129bd697040ae6dd201a0cff50e9ceba8");
    expect(LEVEL.fixtures.filter((f) => GROWTH_FIXTURE_KINDS.has(f.kind)).length).toBe(5);
    expect(LEVEL.fixtures.filter(isStreetFixture).length).toBe(3);
    expect(sha(read("public/models/sento_environment.glb"))).toBe(report.export_sha256);
    expect(report.export_sha256).toBe("3c37930e66a6d27f2a32cc174b64cb54b6a713bfafd6322ef4959cbb7ec6eb00");
    expect(read("public/models/sento_environment.glb").length).toBe(6_931_636);
    expect(report.architecture_triangles).toBe(9907);
    expect(report.architecture_triangles).toBeLessThanOrEqual(10_000); // final-assets growth budget
    expect(report.npc_triangles).toBe(12_200);
    // Every current placement (growth additions included) is covered by the export.
    for (const [category, entries] of Object.entries({ structural_walls: placement.structural_walls,
      fixtures: LEVEL.fixtures, decor: LEVEL.decor, npcs: LEVEL.npcs, zones: LEVEL.zones })) {
      entries.forEach((_, i) => expect(report.coverage[`${category}_${String(i).padStart(2, "0")}`],
        `${category} placement ${i}`).toBeTruthy());
      expect(Object.keys(report.coverage).filter((k) => k.startsWith(`${category}_`) && /_\d\d$/.test(k)).length, category).toBe(entries.length);
    }
    // Every doorway, the child passage, both growth doors and the water joints are clear of geometry.
    const ids = report.clearances.map((c: { id: string }) => c.id);
    for (const d of LEVEL.doors) expect(ids, d.id).toContain(d.id);
    for (const id of ["growth_door_kidsGate", "growth_door_frontExit", "child_passage", "narrow_hole"]) expect(ids).toContain(id);
    for (const opening of report.clearances) expect(opening.intersecting_triangles, opening.id).toBe(0);
    expect(report.npc_slots).toHaveLength(7);
    expect(report.degenerate_faces).toBe(0);
  });
});
