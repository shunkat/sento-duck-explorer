// MiniMap: geometry from the Level, yaw direction, milk/door display, and dialog
// state. The test environment is Node without a DOM, so a small fake DOM models
// the semantics MiniMap relies on (events with bubbling, focus, <dialog>
// showModal/close with an async close event). It checks DOM logic only; real
// browser behavior (native Escape, modal inertness, layout) is not verified here.
import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/initialState";
import type { GameState } from "../src/core/types";
import { LEVEL, type Level } from "../src/level/layout";
import { box } from "../src/sim/geometry";
import { headingOnMap, labelAnchor, levelBounds, mapLabels, MiniMap, playerTransform } from "../src/view/minimap";

// ---------------------------------------------------------------------------
// Fake DOM
// ---------------------------------------------------------------------------
interface FakeEvent {
  type: string;
  target: FakeEl;
  key?: string;
  defaultPrevented: boolean;
  stopped: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

class FakeEl {
  parent: FakeEl | null = null;
  children: FakeEl[] = [];
  attrs = new Map<string, string>();
  listeners = new Map<string, ((e: FakeEvent) => void)[]>();
  text = "";
  id = "";
  type = "";
  autofocus = false;
  open = false;
  pendingClose = false;
  constructor(readonly tagName: string, readonly ownerDocument: FakeDoc) {}
  get className(): string { return this.attrs.get("class") ?? ""; }
  set className(v: string) { this.attrs.set("class", v); }
  get textContent(): string { return this.text + this.children.map((c) => c.textContent).join(""); }
  set textContent(v: string) { this.text = v; }
  get isConnected(): boolean {
    let e: FakeEl | null = this;
    while (e.parent) e = e.parent;
    return e === this.ownerDocument.root;
  }
  setAttribute(k: string, v: string): void { this.attrs.set(k, v); }
  getAttribute(k: string): string | null { return this.attrs.get(k) ?? null; }
  removeAttribute(k: string): void { this.attrs.delete(k); }
  append(...nodes: FakeEl[]): void {
    for (const n of nodes) { n.parent = this; this.children.push(n); }
  }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  addEventListener(t: string, fn: (e: FakeEvent) => void): void {
    this.listeners.set(t, [...(this.listeners.get(t) ?? []), fn]);
  }
  removeEventListener(t: string, fn: (e: FakeEvent) => void): void {
    this.listeners.set(t, (this.listeners.get(t) ?? []).filter((f) => f !== fn));
  }
  fire(type: string, extra: { key?: string } = {}): FakeEvent {
    const e: FakeEvent = {
      type, target: this, key: extra.key, defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.stopped = true; },
    };
    for (let n: FakeEl | null = this; n && !e.stopped; n = n.parent) for (const fn of n.listeners.get(type) ?? []) fn(e);
    return e;
  }
  focus(): void { this.ownerDocument.activeElement = this; }
  showModal(): void { this.open = true; }
  close(): void {
    if (!this.open) return;
    this.open = false;
    this.pendingClose = true; // the real close event is queued, not synchronous
  }
  /** Deliver the queued close event, like the browser's later task. */
  flushClose(): void {
    if (!this.pendingClose) return;
    this.pendingClose = false;
    this.fire("close");
  }
}

class FakeDoc {
  body: FakeEl;
  root: FakeEl;
  activeElement: FakeEl;
  constructor() {
    this.root = new FakeEl("html", this);
    this.body = new FakeEl("body", this);
    this.root.append(this.body);
    this.activeElement = this.body;
  }
  createElement(tag: string): FakeEl { return new FakeEl(tag, this); }
  createElementNS(_ns: string, tag: string): FakeEl { return new FakeEl(tag, this); }
}

const all = (e: FakeEl): FakeEl[] => [e, ...e.children.flatMap(all)];
const hasClass = (e: FakeEl, c: string): boolean => e.className.split(/\s+/).includes(c);
const byClass = (e: FakeEl, c: string): FakeEl[] => all(e).filter((x) => hasClass(x, c));
const one = (e: FakeEl, c: string): FakeEl => {
  const r = byClass(e, c);
  expect(r, c).toHaveLength(1);
  return r[0]!;
};

function setup(level: Level = LEVEL) {
  const doc = new FakeDoc();
  const host = doc.createElement("div");
  doc.body.append(host);
  const calls: boolean[] = [];
  const map = new MiniMap(host as unknown as HTMLElement, level, (o) => calls.push(o));
  const button = one(host, "minimap-button");
  const dialog = one(host, "minimap-dialog");
  const close = one(host, "minimap-close");
  return { doc, host, map, calls, button, dialog, close };
}

const freshState = (): GameState => createInitialState(LEVEL);

// ---------------------------------------------------------------------------
// Pure geometry
// ---------------------------------------------------------------------------
describe("levelBounds", () => {
  it("covers the negative-x hole and vestibule, the street stub and the east pond", () => {
    const b = levelBounds(LEVEL, 0);
    expect(b.minX).toBeLessThanOrEqual(LEVEL.narrowHole.box.minX);
    expect(b.minX).toBeLessThan(LEVEL.womensEntrance.step.minX);
    expect(b.maxX).toBeGreaterThanOrEqual(LEVEL.zones.find((z) => z.id === "pond")!.box.maxX);
    expect(b.maxX).toBeGreaterThanOrEqual(LEVEL.zones.find((z) => z.id === "street")!.box.maxX);
    expect(b.minZ).toBeLessThanOrEqual(Math.min(...LEVEL.walls.map((w) => w.minZ)));
    expect(b.width).toBeCloseTo(b.maxX - b.minX);
  });

  it("includes milk and start points that lie outside every box", () => {
    const far: Level = {
      ...LEVEL,
      start: { x: -50, z: 40 },
      nodes: { milk1: { x: 99, z: -70 }, milk2: LEVEL.nodes.milk2 },
    };
    const b = levelBounds(far, 0);
    expect(b).toMatchObject({ minX: -50, maxX: 99, minZ: -70, maxZ: 40 });
  });
});

describe("yaw on the map", () => {
  it("yaw 0 faces north (up), π/2 east, π south, -π/2 west", () => {
    const near = (v: { x: number; z: number }, x: number, z: number) => {
      expect(v.x).toBeCloseTo(x);
      expect(v.z).toBeCloseTo(z);
    };
    near(headingOnMap(0), 0, -1);
    near(headingOnMap(Math.PI / 2), 1, 0);
    near(headingOnMap(Math.PI), 0, 1);
    near(headingOnMap(-Math.PI / 2), -1, 0);
  });

  it("the SVG rotation turns an up-pointing marker onto the heading", () => {
    for (const yaw of [0, 0.7, Math.PI / 2, 2.5, -1.2]) {
      const m = /translate\(([-\d.]+) ([-\d.]+)\) rotate\(([-\d.]+)\)/.exec(playerTransform({ x: 3, z: -4 }, yaw))!;
      expect([Number(m[1]), Number(m[2])]).toEqual([3, -4]);
      const a = (Number(m[3]) * Math.PI) / 180; // SVG rotate(a) maps (0,-1) to (sin a, -cos a)
      const h = headingOnMap(yaw);
      expect(Math.sin(a)).toBeCloseTo(h.x, 2);
      expect(-Math.cos(a)).toBeCloseTo(h.z, 2);
    }
  });
});

describe("labels", () => {
  const labels = mapLabels(LEVEL);
  it("names the priority rooms once each", () => {
    const texts = labels.map((l) => l.text);
    for (const t of ["浴室", "更衣室", "受付", "玄関", "外", "サウナ", "露天", "庭", "池", "キッズ"]) {
      expect(texts.filter((x) => x === t)).toHaveLength(1);
    }
  });

  it("keeps labels clear of the milk bottles", () => {
    for (const l of labels) {
      for (const n of Object.values(LEVEL.nodes)) expect(Math.hypot(l.pos.x - n.x, l.pos.z - n.z), l.text).toBeGreaterThanOrEqual(1);
    }
  });

  it("moves an anchor off a point at the center and stays in the box", () => {
    const b = box(0, 0, 4, 4);
    const p = labelAnchor(b, [{ x: 2, z: 2 }]);
    expect(Math.hypot(p.x - 2, p.z - 2)).toBeGreaterThan(1);
    expect(p.x).toBeGreaterThanOrEqual(b.minX);
    expect(p.x).toBeLessThanOrEqual(b.maxX);
    expect(labelAnchor(b, [])).toEqual({ x: 2, z: 2 });
  });
});

// ---------------------------------------------------------------------------
// DOM structure and display
// ---------------------------------------------------------------------------
describe("MiniMap DOM", () => {
  it("builds a mini button, a labelled dialog and a large map with the expected hooks", () => {
    const { host, button, dialog, close } = setup();
    expect(one(button, "minimap-title").textContent).toBe("館内マップ");
    expect(one(button, "minimap-caption").textContent).toBe("タップで拡大");
    expect(one(button, "minimap-north").textContent).toContain("北");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe(dialog.id);
    expect(dialog.getAttribute("aria-labelledby")).toBe(one(dialog, "minimap-title").id);
    expect(close.autofocus).toBe(true);
    expect(one(dialog, "minimap-body").children.some((c) => hasClass(c, "minimap-svg"))).toBe(true);
    expect(byClass(host, "minimap-svg")).toHaveLength(2);
    expect(byClass(button, "minimap-labels")).toHaveLength(0); // mini hides room labels
    expect(byClass(dialog, "minimap-label").length).toBeGreaterThanOrEqual(10);
    expect(byClass(dialog, "minimap-legend")).toHaveLength(1);
    expect(byClass(dialog, "minimap-legend-water")).toHaveLength(1);
    expect(one(dialog, "minimap-note").textContent).toBe("一時停止中 · Esc / Cでも閉じる");
  });

  it("draws zones small-to-large in reverse, water, then walls and fixtures", () => {
    const { button } = setup();
    const svg = one(button, "minimap-svg");
    const zones = byClass(svg, "minimap-zone").map((z) => z.getAttribute("data-zone"));
    expect(zones).toEqual([...LEVEL.zones].reverse().map((z) => z.id));
    const order = svg.children.map((c) => c.className.split(" ")[0]);
    expect(order.indexOf("minimap-zones")).toBeLessThan(order.indexOf("minimap-water"));
    expect(order.indexOf("minimap-water")).toBeLessThan(order.indexOf("minimap-wall"));
    expect(order.indexOf("minimap-wall")).toBeLessThan(order.indexOf("minimap-fixtures"));
    expect(byClass(svg, "minimap-fixture-water-outdoorBath").length).toBeGreaterThan(0);
  });

  it("tracks the player, collected milk and door state without rebuilding geometry", () => {
    const { host, map } = setup();
    const staticBefore = all(host).length;
    const walls = byClass(host, "minimap-wall");
    expect(walls).toHaveLength(2);
    const state = freshState();
    Object.freeze(state.milk);
    const snapshot = JSON.stringify(state);

    map.update(state, 0);
    const players = byClass(host, "minimap-player");
    expect(players).toHaveLength(2);
    expect(players[0]!.getAttribute("transform")).toBe(playerTransform(state.player.pos, 0));
    const milk1 = byClass(host, "minimap-milk1");
    expect(milk1.every((m) => m.getAttribute("display") === null)).toBe(true);

    const next = { ...state, milk: { milk1: "collected", milk2: "available" }, doors: { ...state.doors, frontExit: "open" } } as GameState;
    map.update(next, Math.PI / 2);
    expect(milk1.every((m) => m.getAttribute("display") === "none")).toBe(true);
    expect(byClass(host, "minimap-milk2").every((m) => m.getAttribute("display") === null)).toBe(true);
    expect(players[0]!.getAttribute("transform")).toContain("rotate(90)");
    const door = byClass(host, "minimap-door-high").filter((d) => d.getAttribute("data-door") === "frontExit");
    expect(door.every((d) => d.getAttribute("data-state") === "open" && hasClass(d, "minimap-door-open"))).toBe(true);

    expect(all(host).length).toBe(staticBefore);
    byClass(host, "minimap-wall").forEach((wall, index) => expect(wall).toBe(walls[index]));
    expect(JSON.stringify(state)).toBe(snapshot); // display-only
  });
});

// ---------------------------------------------------------------------------
// Dialog state (fake DOM: semantics, not browser behavior)
// ---------------------------------------------------------------------------
describe("MiniMap dialog", () => {
  it("opens on tap: modal, close button focused, aria-expanded, one callback; taps do not bubble", () => {
    const { doc, host, map, calls, button, dialog, close } = setup();
    let bubbled = 0;
    for (const t of ["click", "pointerdown", "touchstart"]) host.addEventListener(t, () => bubbled++);
    button.focus();
    button.fire("pointerdown");
    button.fire("click");
    expect(map.expanded).toBe(true);
    expect(dialog.open).toBe(true);
    expect(doc.activeElement).toBe(close);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(calls).toEqual([true]);
    expect(bubbled).toBe(0);
  });

  it("close button closes once and restores the previous focus", () => {
    const { doc, host, map, calls, dialog, close } = setup();
    const other = doc.createElement("canvas");
    host.append(other);
    other.focus();
    map.setExpanded(true);
    close.fire("click");
    expect(map.expanded).toBe(false);
    expect(dialog.open).toBe(false);
    expect(doc.activeElement).toBe(other);
    expect(calls).toEqual([true, false]);
    dialog.flushClose();
    expect(calls).toEqual([true, false]);
  });

  it("falls back to the mini button when the previous focus is gone or absent", () => {
    const a = setup();
    a.map.setExpanded(true);
    a.map.setExpanded(false);
    expect(a.doc.activeElement).toBe(a.button);

    const b = setup();
    const gone = b.doc.createElement("div");
    b.host.append(gone);
    gone.focus();
    b.map.setExpanded(true);
    gone.remove();
    b.map.setExpanded(false);
    expect(b.doc.activeElement).toBe(b.button);
  });

  it("Escape (cancel or keydown) closes with exactly one callback and cancel is prevented", () => {
    const a = setup();
    a.map.setExpanded(true);
    expect(a.dialog.fire("cancel").defaultPrevented).toBe(true);
    a.dialog.fire("cancel");
    expect(a.calls).toEqual([true, false]);

    const b = setup();
    b.map.setExpanded(true);
    b.dialog.fire("keydown", { key: "Escape" });
    b.dialog.fire("keydown", { key: "Escape" });
    expect(b.calls).toEqual([true, false]);
    b.map.setExpanded(true);
    b.dialog.fire("keydown", { key: "a" });
    expect(b.map.expanded).toBe(true);
  });

  it("toggle and repeated setExpanded report transitions only", () => {
    const { map, calls } = setup();
    map.setExpanded(false);
    map.toggle();
    map.setExpanded(true);
    map.toggle();
    expect(calls).toEqual([true, false]);
  });

  it("a stale async close event does not close a dialog that was reopened", () => {
    const { map, calls, dialog } = setup();
    map.setExpanded(true);
    map.setExpanded(false);
    map.setExpanded(true); // before the queued close event is delivered
    dialog.flushClose();
    expect(map.expanded).toBe(true);
    expect(dialog.open).toBe(true);
    expect(calls).toEqual([true, false, true]);
  });

  it("an external close of the dialog syncs the state once", () => {
    const { map, calls, dialog } = setup();
    map.setExpanded(true);
    dialog.close(); // e.g. a form method=dialog
    dialog.flushClose();
    expect(map.expanded).toBe(false);
    expect(calls).toEqual([true, false]);
  });

  it("dispose closes an open map (so the root resumes), detaches elements and ignores later calls", () => {
    const { host, map, calls, button, dialog } = setup();
    map.setExpanded(true);
    map.dispose();
    map.dispose();
    expect(calls).toEqual([true, false]);
    expect(host.children).toHaveLength(0);
    button.fire("click");
    map.setExpanded(true);
    map.update(freshState(), 1);
    expect(map.expanded).toBe(false);
    expect(dialog.open).toBe(false);
    expect(calls).toEqual([true, false]);
  });
});
