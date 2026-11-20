// ModelAdapter tests. No WebGL: the fixture is parsed in memory.
// tests/fixtures/test_box_duck.glb is a test fixture, not a final asset.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { type GltfSource, ModelLibrary, SOCKET_NAMES, checkBounds, measureModel } from "../src/view/models";

function fixtureBytes(): ArrayBuffer {
  const b = readFileSync(new URL("./fixtures/test_box_duck.glb", import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

const manifest = JSON.parse(readFileSync(new URL("../assets/manifest.json", import.meta.url), "utf8"));

describe("ModelLibrary", () => {
  it("returns null for an id that was never loaded", () => {
    expect(new ModelLibrary().get("duck")).toBeNull();
  });

  it("parses the fixture and finds every socket", async () => {
    const lib = new ModelLibrary();
    await lib.parse("fixture", fixtureBytes());
    const m = lib.get("fixture");
    expect(m).not.toBeNull();
    for (const name of SOCKET_NAMES) expect(m!.sockets[name]).toBeDefined();
    expect(m!.sockets.socket_carry!.position.y).toBeCloseTo(0.9);
    expect(m!.sockets.socket_hat!.position.toArray()).toEqual([0, expect.closeTo(0.28), expect.closeTo(0.03)]);
  });

  it("falls back (null and a warning) when loading fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing: GltfSource = {
      loadAsync: () => Promise.reject(new Error("404")),
      parseAsync: () => Promise.reject(new Error("bad")),
    };
    const lib = new ModelLibrary(failing);
    await lib.load("duck", "/models/duck.glb");
    await lib.parse("hat", new ArrayBuffer(4));
    expect(lib.get("duck")).toBeNull();
    expect(lib.get("hat")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("falls back on invalid GLB bytes with the real loader", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const lib = new ModelLibrary();
    await lib.parse("broken", new TextEncoder().encode("not a glb").buffer as ArrayBuffer);
    expect(lib.get("broken")).toBeNull();
    warn.mockRestore();
  });
});

describe("manifest bounds check", () => {
  it("measures the fixture and accepts it against the duck limits", async () => {
    const lib = new ModelLibrary();
    await lib.parse("fixture", fixtureBytes());
    const measured = measureModel(lib.get("fixture")!.root);
    expect(measured.height).toBeCloseTo(0.3);
    expect(measured.maxWidth).toBeCloseTo(0.3);
    expect(checkBounds(measured, manifest.assets.duck.limits)).toEqual([]);
  });

  it("reports violations", () => {
    const limits = { height: [0.28, 0.32] as [number, number], max_width: 0.36 };
    expect(checkBounds({ height: 0.4, maxWidth: 0.2 }, limits)).toHaveLength(1);
    expect(checkBounds({ height: 0.2, maxWidth: 0.5 }, limits)).toHaveLength(2);
  });

  it("has no measured bounds in the manifest yet (no final asset)", () => {
    for (const a of Object.values<{ measured: unknown }>(manifest.assets)) expect(a.measured).toBeNull();
  });
});
