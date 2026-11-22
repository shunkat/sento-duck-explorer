// Inspect actual production bytes. These checks do not substitute for GPU or play QA.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHARACTER_MODEL_URLS, ENVIRONMENT_MODEL_URLS, ITEM_MODEL_URLS } from "../src/view/modelEntry";
import { GROWTH_DECOR_KINDS, GROWTH_FIXTURE_KINDS, isStreetFixture, LEVEL } from "../src/level/layout";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url));
const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

describe("complete environment export", () => {
  it("ships every registered model with its measured bytes, embedded resources and license", () => {
    const manifest = JSON.parse(read("assets/manifest.json").toString());
    const urls = Object.values({ ...CHARACTER_MODEL_URLS, ...ITEM_MODEL_URLS, ...ENVIRONMENT_MODEL_URLS });
    expect(urls).toHaveLength(16); // 18 before the retired coin, key and hat stopped (2026-11-21); +1 guardian NPC (2026-11-22)
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
    // Growth and exit (2026-11-21) changed the layout after this export: trough joined to the tub, the
    // kids' corner, removed pond goal and sauna lock, front-exit door. The authored world is still the
    // 3f57ed2 export; the additions are always-drawn provisional primitives. Re-export is an open asset item.
    expect(sha(JSON.stringify(placement))).not.toBe(report.layout_sha256);
    expect(report.layout_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(LEVEL.fixtures.filter((f) => GROWTH_FIXTURE_KINDS.has(f.kind)).length).toBe(5);
    expect(LEVEL.fixtures.filter(isStreetFixture).length).toBe(3);
    expect(sha(read("public/models/sento_environment.glb"))).toBe(report.export_sha256);
    expect(report.source_placement_count).toBe(111);
    // Coverage is keyed by the authored export's order: leave out the growth additions.
    const authoredFixtures = LEVEL.fixtures.filter((f) => !GROWTH_FIXTURE_KINDS.has(f.kind) && !isStreetFixture(f));
    const authoredDecor = LEVEL.decor.filter((d) => !GROWTH_DECOR_KINDS.has(d.kind));
    const authoredZones = LEVEL.zones.filter((z) => !z.id.startsWith("kids_") && z.id !== "street");
    // The street door splits the x = 11 wall into two segments: one more structural wall than the export.
    const exportedWalls = Object.keys(report.coverage).filter((k) => k.startsWith("structural_walls_")).length;
    expect(placement.structural_walls.length).toBe(exportedWalls + 1);
    for (const [category, entries] of Object.entries({ structural_walls: placement.structural_walls.slice(0, exportedWalls),
      fixtures: authoredFixtures, decor: authoredDecor, npcs: LEVEL.npcs, zones: authoredZones })) {
      entries.forEach((_, i) => expect(report.coverage[`${category}_${String(i).padStart(2, "0")}`],
        `${category} placement ${i}`).toBeTruthy());
    }
    expect(report.clearances).toHaveLength(11);
    for (const opening of report.clearances) expect(opening.intersecting_triangles, opening.id).toBe(0);
    expect(report.npc_slots).toHaveLength(7);
    expect(report.degenerate_faces).toBe(0);
  });
});
