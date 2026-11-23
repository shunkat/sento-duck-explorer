// Persistent 2D minimap (2026-11-22). A small always-visible button shows the whole
// sento as a flat SVG; tapping it opens a native modal <dialog> with the same map
// at viewport size, Japanese room labels and a legend. View-only: reads Level and
// GameState, never mutates them, and never handles C (the root routes C to toggle()).
// North is up: x → right, z → down. Yaw 0 faces -Z (north), π/2 faces +X (east).
import { MILK_IDS, type GameState, type HighDoorId, type MilkId, type Vec2, type ZoneId } from "../core/types";
import type { FixtureKind, Level } from "../level/layout";
import type { AABB } from "../sim/geometry";

const SVG_NS = "http://www.w3.org/2000/svg";
const WATER_FILL = "#8cc8ea";
/** Fixtures that hold water: drawn as a rim with water inside. */
const WATER_FIXTURES: ReadonlySet<FixtureKind> = new Set<FixtureKind>(["outdoorBath", "plunge", "basin"]);

/** Zones that are outdoors (street, open-air bath, garden, pond). Everything else is indoors. */
export const OUTDOOR_ZONES: ReadonlySet<ZoneId> = new Set<ZoneId>(["street", "open_air", "pond_entrance", "pond"]);

export interface MapBounds extends AABB {
  width: number;
  height: number;
}

/** Bounds of everything the map draws, taken from the Level (no hardcoded world size). */
export function levelBounds(level: Level, pad = 0.6): MapBounds {
  const boxes: AABB[] = [
    ...level.zones.map((z) => z.box),
    ...level.walls,
    ...level.fixtures.map((f) => f.box),
    ...level.npcs,
    ...level.doors.map((d) => d.box),
    ...Object.values(level.highDoors).map((d) => d.blocker),
    level.narrowHole.box,
    level.womensEntrance.doorway,
    level.womensEntrance.step,
  ];
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.minX);
    minZ = Math.min(minZ, b.minZ);
    maxX = Math.max(maxX, b.maxX);
    maxZ = Math.max(maxZ, b.maxZ);
  }
  // Drawn points (milk bottles, start) may lie outside every box in a custom level.
  for (const p of [level.start, ...MILK_IDS.map((id) => level.nodes[id])]) {
    minX = Math.min(minX, p.x);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x);
    maxZ = Math.max(maxZ, p.z);
  }
  minX -= pad; minZ -= pad; maxX += pad; maxZ += pad;
  return { minX, minZ, maxX, maxZ, width: maxX - minX, height: maxZ - minZ };
}

/** Unit direction on the map (x right, z down) that a yaw points to: yaw 0 → north (0,-1), π/2 → east (1,0). */
export function headingOnMap(yaw: number): Vec2 {
  return { x: Math.sin(yaw), z: -Math.cos(yaw) };
}

const num = (v: number): number => Number(v.toFixed(3));

/** SVG transform for the player marker, drawn pointing up (north) at rotation 0. SVG rotate is clockwise, like yaw. */
export function playerTransform(pos: Vec2, yaw: number): string {
  const deg = (yaw * 180) / Math.PI;
  return `translate(${num(pos.x)} ${num(pos.z)}) rotate(${num(deg)})`;
}

/** Large-map label groups. Sub-zones share one label so names do not overprint. */
export const LABEL_GROUPS: readonly { text: string; zones: readonly ZoneId[] }[] = [
  { text: "浴室", zones: ["bath"] },
  { text: "更衣室", zones: ["changing"] },
  { text: "受付", zones: ["reception"] },
  { text: "ロビー", zones: ["common"] },
  { text: "玄関", zones: ["genkan"] },
  { text: "外", zones: ["street"] },
  { text: "サウナ", zones: ["sauna_entry", "sauna_crowd"] },
  { text: "露天", zones: ["open_air"] },
  { text: "庭", zones: ["pond_entrance"] },
  { text: "池", zones: ["pond"] },
  { text: "キッズ", zones: ["kids_pool", "kids_passage", "kids_room"] },
];

const unionBox = (boxes: readonly AABB[]): AABB => ({
  minX: Math.min(...boxes.map((b) => b.minX)),
  minZ: Math.min(...boxes.map((b) => b.minZ)),
  maxX: Math.max(...boxes.map((b) => b.maxX)),
  maxZ: Math.max(...boxes.map((b) => b.maxZ)),
});

/**
 * Label position inside `b`: the center when it keeps `clearance` from every
 * point in `avoid` (milk bottles), otherwise the nearest grid spot that does,
 * otherwise the spot farthest from all of them.
 */
export function labelAnchor(b: AABB, avoid: readonly Vec2[], clearance = 1.4): Vec2 {
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const clear = (p: Vec2): number => avoid.reduce((m, a) => Math.min(m, Math.hypot(p.x - a.x, p.z - a.z)), Infinity);
  const center = { x: cx, z: cz };
  if (clear(center) >= clearance) return center;
  let best = center;
  let bestKey = -Infinity;
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {
      const p = {
        x: b.minX + (b.maxX - b.minX) * (0.15 + 0.7 * (i / 6)),
        z: b.minZ + (b.maxZ - b.minZ) * (0.15 + 0.7 * (j / 6)),
      };
      const c = clear(p);
      // Clear spots rank by closeness to the center; otherwise by how far they are from the bottles.
      const key = c >= clearance ? 1000 - Math.hypot(p.x - cx, p.z - cz) : c;
      if (key > bestKey) {
        bestKey = key;
        best = p;
      }
    }
  }
  return best;
}

export interface MapLabel {
  text: string;
  pos: Vec2;
}

/** Labels for the large map, from the Level's actual zones. */
export function mapLabels(level: Level): MapLabel[] {
  const avoid = [...MILK_IDS.map((id) => level.nodes[id])];
  const out: MapLabel[] = [];
  for (const g of LABEL_GROUPS) {
    const boxes = level.zones.filter((z) => g.zones.includes(z.id)).map((z) => z.box);
    if (boxes.length === 0) continue;
    out.push({ text: g.text, pos: labelAnchor(unionBox(boxes), avoid) });
  }
  return out;
}

type Attrs = Record<string, string | number>;

function svgEl(doc: Document, name: string, cls?: string, attrs: Attrs = {}): SVGElement {
  const e = doc.createElementNS(SVG_NS, name) as SVGElement;
  if (cls) e.setAttribute("class", cls);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

const rectAttrs = (b: AABB): Attrs => ({ x: num(b.minX), y: num(b.minZ), width: num(b.maxX - b.minX), height: num(b.maxZ - b.minZ) });
const boxKey = (b: AABB): string => `${b.minX},${b.minZ},${b.maxX},${b.maxZ}`;
const rectPath = (b: AABB): string => `M${num(b.minX)} ${num(b.minZ)}H${num(b.maxX)}V${num(b.maxZ)}H${num(b.minX)}Z`;

/** Everything that changes while playing, for one SVG. Static geometry is never touched after construction. */
interface MapView {
  svg: SVGElement;
  player: SVGElement;
  milk: Record<MilkId, SVGElement>;
  doors: Record<HighDoorId, SVGElement>;
}

function buildMap(doc: Document, level: Level, bounds: MapBounds, large: boolean): MapView {
  const svg = svgEl(doc, "svg", `minimap-svg ${large ? "minimap-svg-large" : "minimap-svg-mini"}`, {
    viewBox: `${num(bounds.minX)} ${num(bounds.minZ)} ${num(bounds.width)} ${num(bounds.height)}`,
    preserveAspectRatio: "xMidYMid meet",
    focusable: "false",
  });
  if (large) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "館内マップ。北が上。あなたの位置と向き、残っている牛乳びんを表示");
  } else {
    svg.setAttribute("aria-hidden", "true");
  }

  // Zones: LEVEL.zones runs small-to-large, so draw in reverse and small zones stay visible on top.
  const zones = svgEl(doc, "g", "minimap-zones");
  for (const z of [...level.zones].reverse()) {
    const outdoor = OUTDOOR_ZONES.has(z.id);
    zones.append(
      svgEl(doc, "rect", `minimap-zone minimap-zone-${z.id} ${outdoor ? "minimap-outdoor" : "minimap-indoor"}`, {
        ...rectAttrs(z.box),
        "data-zone": z.id,
        fill: z.id === "pond" ? WATER_FILL : outdoor ? "#cfe3c4" : "#f3e7cf",
        stroke: "#00000033",
        "stroke-width": 0.06,
      }),
    );
  }
  svg.append(zones);

  // Swimmable water (tub, trough, kids' pool, NarrowHole) from Level.duckWater, under walls and fixtures.
  svg.append(svgEl(doc, "path", "minimap-water", { d: level.duckWater.map(rectPath).join(""), fill: WATER_FILL }));

  // Structural walls: those that are not also drawn as a fixture, merged into one path.
  const fixtureKeys = new Set(level.fixtures.map((f) => boxKey(f.box)));
  const wallBoxes = level.walls.filter((w) => !fixtureKeys.has(boxKey(w)));
  svg.append(svgEl(doc, "path", "minimap-wall", { d: wallBoxes.map(rectPath).join(""), fill: "#5b4636" }));

  // Fixtures keep their kind as a class for styling.
  const fixtures = svgEl(doc, "g", "minimap-fixtures");
  for (const f of level.fixtures) {
    const kind = f.kind;
    fixtures.append(svgEl(doc, "rect", `minimap-fixture minimap-fixture-${kind}`, { ...rectAttrs(f.box), fill: "#8a7a68" }));
    if (WATER_FIXTURES.has(kind)) {
      // Rim is the fixture box; the inset is the water inside it.
      const w = f.box.maxX - f.box.minX;
      const h = f.box.maxZ - f.box.minZ;
      const inset = Math.min(0.2, w * 0.3, h * 0.3);
      fixtures.append(
        svgEl(doc, "rect", `minimap-fixture-water minimap-fixture-water-${kind}`, {
          ...rectAttrs({ minX: f.box.minX + inset, minZ: f.box.minZ + inset, maxX: f.box.maxX - inset, maxZ: f.box.maxZ - inset }),
          fill: WATER_FILL,
        }),
      );
    }
  }
  for (const n of level.npcs) fixtures.append(svgEl(doc, "rect", "minimap-fixture minimap-npc", { ...rectAttrs(n), fill: "#a89c8c" }));
  svg.append(fixtures);

  // Doors. Level.doors are open doorways; the high-handle doors have a state. Their blockers
  // may repeat a Level.doors box (the front exit), which is then drawn once, as a high door.
  const highKeys = new Set(Object.values(level.highDoors).map((d) => boxKey(d.blocker)));
  const doorsG = svgEl(doc, "g", "minimap-doors");
  for (const d of level.doors) {
    if (highKeys.has(boxKey(d.box))) continue;
    doorsG.append(svgEl(doc, "rect", "minimap-door minimap-door-open", { ...rectAttrs(d.box), "data-door": d.id, fill: "#f3e7cf" }));
  }
  const doors = {} as Record<HighDoorId, SVGElement>;
  for (const id of Object.keys(level.highDoors) as HighDoorId[]) {
    const e = svgEl(doc, "rect", "minimap-door minimap-door-high minimap-door-closed", {
      ...rectAttrs(level.highDoors[id].blocker),
      "data-door": id,
      "data-state": "closed",
      fill: "#b0413e",
    });
    doors[id] = e;
    doorsG.append(e);
  }
  svg.append(doorsG);

  // Large map: Japanese labels, outlined so they stay readable over fills.
  if (large) {
    const labels = svgEl(doc, "g", "minimap-labels", { "text-anchor": "middle", "dominant-baseline": "central", "pointer-events": "none" });
    for (const l of mapLabels(level)) {
      const t = svgEl(doc, "text", "minimap-label", {
        x: num(l.pos.x),
        y: num(l.pos.z),
        "font-size": 0.9,
        fill: "#2b2118",
        stroke: "#ffffffcc",
        "stroke-width": 0.18,
        "paint-order": "stroke",
      });
      t.textContent = l.text;
      labels.append(t);
    }
    svg.append(labels);
  }

  // Milk bottles: a ring so they stand out from fixtures; hidden once collected.
  const milkR = Math.max(0.45, bounds.width * (large ? 0.011 : 0.025));
  const milk = {} as Record<MilkId, SVGElement>;
  const milkG = svgEl(doc, "g", "minimap-milks");
  for (const id of MILK_IDS) {
    const p = level.nodes[id];
    const g = svgEl(doc, "g", `minimap-milk minimap-${id}`, { transform: `translate(${num(p.x)} ${num(p.z)})`, "data-milk": id });
    g.append(svgEl(doc, "circle", "minimap-milk-dot", { r: num(milkR), fill: "#ffffff", stroke: "#1f6fb2", "stroke-width": num(milkR * 0.35) }));
    milk[id] = g;
    milkG.append(g);
  }
  svg.append(milkG);

  // Player: arrow pointing north at rotation 0, sized so the direction reads at mini scale.
  const r = Math.max(0.8, bounds.width * (large ? 0.016 : 0.035));
  const player = svgEl(doc, "g", "minimap-player", { transform: playerTransform(level.start, 0) });
  player.append(
    svgEl(doc, "circle", "minimap-player-halo", { r: num(r * 1.2), fill: "#ffffffcc" }),
    svgEl(doc, "polygon", "minimap-player-arrow", {
      points: `0,${num(-r * 1.25)} ${num(r * 0.8)},${num(r * 0.8)} 0,${num(r * 0.4)} ${num(-r * 0.8)},${num(r * 0.8)}`,
      fill: "#e0442c",
      stroke: "#ffffff",
      "stroke-width": num(r * 0.15),
      "stroke-linejoin": "round",
    }),
  );
  svg.append(player);

  return { svg, player, milk, doors };
}

let nextId = 0;

const STOP_EVENTS = ["click", "pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend"] as const;

export class MiniMap {
  private readonly doc: Document;
  private readonly button: HTMLButtonElement;
  private readonly dialog: HTMLDialogElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly views: MapView[];
  private readonly cleanups: (() => void)[] = [];
  private open = false;
  private disposed = false;
  private previousFocus: HTMLElement | null = null;
  private lastPlayer = "";
  private lastMilk: Partial<Record<MilkId, boolean>> = {};
  private lastDoor: Partial<Record<HighDoorId, string>> = {};

  constructor(
    private readonly root: HTMLElement,
    level: Level,
    private readonly onExpandedChange: (open: boolean) => void,
  ) {
    const doc = (this.doc = root.ownerDocument);
    const bounds = levelBounds(level);
    const uid = ++nextId;
    const dialogId = `minimap-dialog-${uid}`;
    const titleId = `minimap-title-${uid}`;

    const mini = buildMap(doc, level, bounds, false);
    const large = buildMap(doc, level, bounds, true);
    this.views = [mini, large];

    // Persistent mini button.
    const button = (this.button = doc.createElement("button"));
    button.type = "button";
    button.className = "minimap-button";
    button.setAttribute("aria-label", "館内マップを開く（タップで拡大）");
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", dialogId);
    button.setAttribute("aria-expanded", "false");
    const miniTitle = doc.createElement("span");
    miniTitle.className = "minimap-title";
    miniTitle.setAttribute("aria-hidden", "true");
    miniTitle.textContent = "館内マップ";
    const caption = doc.createElement("span");
    caption.className = "minimap-caption";
    caption.setAttribute("aria-hidden", "true");
    caption.textContent = "タップで拡大";
    const north = doc.createElement("span");
    north.className = "minimap-north";
    north.setAttribute("aria-hidden", "true");
    north.textContent = "↑北";
    button.append(miniTitle, north, mini.svg, caption);

    // Modal dialog with the large map.
    const dialog = (this.dialog = doc.createElement("dialog"));
    dialog.id = dialogId;
    dialog.className = "minimap-dialog";
    dialog.setAttribute("aria-labelledby", titleId);
    const header = doc.createElement("header");
    header.className = "minimap-header";
    const title = doc.createElement("h2");
    title.id = titleId;
    title.className = "minimap-title";
    title.textContent = "館内マップ";
    const close = (this.closeButton = doc.createElement("button"));
    close.type = "button";
    close.className = "minimap-close";
    close.setAttribute("aria-label", "館内マップを閉じる");
    close.autofocus = true;
    close.textContent = "閉じる";
    header.append(title, close);
    const body = doc.createElement("div");
    body.className = "minimap-body";
    body.append(large.svg);
    const note = doc.createElement("p");
    note.className = "minimap-note";
    note.textContent = "一時停止中 · Esc / Cでも閉じる";
    dialog.append(header, body, this.buildLegend(doc), note);

    root.append(button, dialog);

    this.listen(button, "click", () => this.setExpanded(true));
    this.listen(close, "click", () => this.setExpanded(false));
    // Native Escape: take over the cancel so we close through one path and notify once.
    this.listen(dialog, "cancel", (e) => {
      e.preventDefault();
      this.setExpanded(false);
    });
    this.listen(dialog, "keydown", (e) => {
      if ((e as KeyboardEvent).key === "Escape") {
        e.preventDefault();
        this.setExpanded(false);
      }
    });
    // The dialog closed some other way (e.g. form method=dialog): sync state. No-op after our own close.
    // A stale close event from an earlier close must not shut a dialog that was reopened since.
    this.listen(dialog, "close", () => {
      if (!this.dialog.open) this.setExpanded(false);
    });
    // Taps on the map controls must not reach gameplay handlers on ancestors.
    for (const ev of STOP_EVENTS) {
      this.listen(button, ev, (e) => e.stopPropagation());
      this.listen(dialog, ev, (e) => e.stopPropagation());
    }
  }

  get expanded(): boolean {
    return this.open;
  }

  toggle(): void {
    this.setExpanded(!this.open);
  }

  /** Opens or closes the large map. Reports transitions only. */
  setExpanded(open: boolean): void {
    if (this.disposed || open === this.open) return;
    this.open = open;
    this.button.setAttribute("aria-expanded", String(open));
    if (open) {
      const active = this.doc.activeElement as HTMLElement | null;
      this.previousFocus = active && typeof active.focus === "function" && active !== this.doc.body ? active : null;
      if (!this.dialog.open) this.dialog.showModal();
      this.closeButton.focus();
    } else {
      if (this.dialog.open) this.dialog.close();
      const prev = this.previousFocus;
      this.previousFocus = null;
      const target = prev && prev.isConnected && prev !== this.closeButton ? prev : this.button;
      target.focus();
    }
    this.onExpandedChange(open);
  }

  /** Display-only refresh: moves the player marker, hides collected milk, shows door state. */
  update(state: GameState, yaw: number): void {
    if (this.disposed) return;
    const t = playerTransform(state.player.pos, yaw);
    if (t !== this.lastPlayer) {
      this.lastPlayer = t;
      for (const v of this.views) v.player.setAttribute("transform", t);
    }
    for (const id of MILK_IDS) {
      const visible = state.milk[id] === "available";
      if (this.lastMilk[id] === visible) continue;
      this.lastMilk[id] = visible;
      for (const v of this.views) {
        if (visible) v.milk[id].removeAttribute("display");
        else v.milk[id].setAttribute("display", "none");
      }
    }
    for (const id of Object.keys(state.doors) as HighDoorId[]) {
      const s = state.doors[id];
      if (this.lastDoor[id] === s) continue;
      this.lastDoor[id] = s;
      for (const v of this.views) {
        const d = v.doors[id];
        if (!d) continue;
        d.setAttribute("data-state", s);
        d.setAttribute("class", `minimap-door minimap-door-high minimap-door-${s}`);
        d.setAttribute("fill", s === "open" ? "#f3e7cf" : "#b0413e");
      }
    }
  }

  /** Detaches listeners and elements. An open map is closed first so the root resumes the game. */
  dispose(): void {
    if (this.disposed) return;
    if (this.open) this.setExpanded(false);
    this.disposed = true;
    for (const c of this.cleanups) c();
    this.cleanups.length = 0;
    this.button.remove();
    this.dialog.remove();
  }

  private listen(target: EventTarget, type: string, fn: (e: Event) => void): void {
    target.addEventListener(type, fn);
    this.cleanups.push(() => target.removeEventListener(type, fn));
  }

  private buildLegend(doc: Document): HTMLElement {
    const ul = doc.createElement("ul");
    ul.className = "minimap-legend";
    const items: [string, string][] = [
      ["minimap-legend-player", "あなた（矢印が向き・上が北）"],
      ["minimap-legend-milk", "牛乳びん"],
      ["minimap-legend-water", "水（湯船・池）"],
      ["minimap-legend-indoor", "屋内"],
      ["minimap-legend-outdoor", "屋外"],
      ["minimap-legend-door", "高い取っ手の戸"],
    ];
    for (const [cls, text] of items) {
      const li = doc.createElement("li");
      li.className = "minimap-legend-item";
      const sw = doc.createElement("span");
      sw.className = `minimap-swatch ${cls}`;
      sw.setAttribute("aria-hidden", "true");
      const label = doc.createElement("span");
      label.className = "minimap-legend-text";
      label.textContent = text;
      li.append(sw, label);
      ul.append(li);
    }
    return ul;
  }
}
