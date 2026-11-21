// Static level and fallback primitives, with pipeline-produced character/item
// models following the view each frame. Gameplay state remains in core.
import * as THREE from "three";
import { CHARACTER_NAME, ITEM_NAME, ZONE_NAME } from "../core/text";
import type { CharacterId, HumanId, ItemId } from "../core/types";
import { CHARACTER_RADIUS, type DecorKind, type FixtureKind, type Level } from "../level/layout";
import type { AABB } from "../sim/geometry";
import type { Pose } from "./camera";
import { BODY_HEIGHT, type Vec3, type View } from "./deriveView";
import type { ModelLibrary } from "./models";
import { EnvironmentModels } from "./environmentModels";
import { createEnvironmentLight } from "./environmentLight";
import { WorldEnvironment } from "./worldEnvironment";
import { SENTO_BACKGROUND_COLOR, WaterAppearance } from "./waterAppearance";
import { batchOpaqueMeshes } from "./staticMeshes";
import { applyOutfit, checkHumanContract, type Clothing, TOWEL_DEPTH, TOWEL_THICKNESS, TOWEL_WIDTH, headAnchor, towelPose } from "./humanModel";
import { CEILING_Y, type FacingTracker, forwardOf, HOLE_LID_Y, bodyOpacity, modelRotationY, placeAtSocket, placeCharacterAtSocket, WALL_HEIGHT } from "./shoulder";
import {
  CHARACTER_LABEL_GAP,
  LABEL_CANVAS_H,
  ITEM_LABEL_Y,
  itemLabelShown,
  LABEL_CENTER_Y,
  LABEL_HIDE_DISTANCE,
  LABEL_PRIORITY,
  LABEL_TEXT_PX,
  type LabelKind,
  type ScreenRect,
  declutter,
  labelPixelHeight,
  labelWorldHeight,
  zoneLabelAnchor,
} from "./labels";

const ZONE_COLORS: Record<string, number> = {
  bath: 0x6fa8dc, bathwater: 0x2f6fb3, splash: 0x9fc5e8, narrow_hole: 0x8e7cc3,
  changing: 0xf6b26b, reception: 0xe06666, common: 0xcc7755, exterior: 0x888888,
  sauna_entry: 0xb45f06, sauna_crowd: 0x8a4a12, open_air: 0x93c47d,
  pond_entrance: 0x6aa84f, pond: 0x2f7f8f, pond_goal: 0xffd24a,
};
/** Rooms on the clear route: their names rank with fixtures, above other rooms (review N-5). */
const ROUTE_ZONES = new Set(["reception", "changing", "bath", "narrow_hole", "sauna_entry", "open_air", "pond_entrance", "pond_goal"]);

/** Zones with a ceiling in the shoulder view (hidden in the overview). */
const INDOOR = new Set(["reception", "common", "exterior", "changing", "bath", "sauna_entry", "sauna_crowd"]);

/** Provisional fixture colours (placeholders, not final assets). */
const FIXTURE_COLORS: Record<FixtureKind, number> = {
  screen: 0xd9c9a8, locker: 0xff9900, shoeLocker: 0xb08850, bench: 0x9b6b3d, desk: 0x8b5a2b, shelf: 0x6b4a2b,
  stool: 0xf2f2f2, basin: 0x9ab8c8, plunge: 0x9ab8c8, outdoorBath: 0x7b7f78, heater: 0x4a4a4a,
  holeSide: 0xd8d0e8, hedge: 0x3f7a3a, fence: 0x9c7b55, pondEdge: 0x8a8f86, rock: 0x8a8f86, shrub: 0x4f8a45,
  step: 0xc9a46a, staff: 0x2f4f6f,
};
const DECOR_COLORS: Record<DecorKind, number> = {
  mat: 0x6b8fb8, border: 0xdfe6ea, mirror: 0xcfe3f0, tap: 0xb0b0b0, bucket: 0xe8c547, shelf: 0xdfe6ea,
  shower: 0xb0b0b0, curtain: 0x2a3f7a, deck: 0xa07850, stone: 0xb0aca0, norenMen: 0x2c5aa0, norenWomen: 0xc0392b,
};
/** View-only: the carried Duck is drawn this far in front of its carrier's placeholder (models: sockets). */
const CARRY_FORWARD = 0.3;
/** Wall height while the overview shows the map as a cutaway. */
const OVERVIEW_WALL_HEIGHT = 1.0;

/** Half height of each item primitive: its group sits at the primitive's center. */
const ITEM_PRIMITIVE_HALF_HEIGHT: Record<ItemId, number> = { coin: 0.015, key: 0.02, hat: 0.08 };

const CHAR_COLORS: Record<CharacterId, number> = { duck: 0xffe033, child: 0x3fa0ff, adult: 0x3fc76a };

interface Label {
  sprite: THREE.Sprite;
  kind: LabelKind;
  /** Width / height of the label texture. */
  aspect: number;
  /** Hidden while this character is active (the ring already marks it). */
  owner?: CharacterId;
  /** Item labels: hidden while the item is held or worn (Req 7.5). */
  item?: ItemId;
  /** Overrides the kind's priority (route rooms rank with fixtures, review N-5). */
  priority?: number;
}

function makeLabelSprite(text: string, color: string): { sprite: THREE.Sprite; aspect: number } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `bold ${LABEL_TEXT_PX}px system-ui, "Hiragino Sans", sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 24;
  canvas.width = w;
  canvas.height = LABEL_CANVAS_H;
  ctx.font = font;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, w, LABEL_CANVAS_H);
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 12, LABEL_CANVAS_H / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.renderOrder = 10;
  return { sprite, aspect: w / LABEL_CANVAS_H };
}

/** Transform of `o` in the space of its ancestor `root` (world matrices brought up to date). */
function relativeMatrix(o: THREE.Object3D, root: THREE.Object3D): THREE.Matrix4 {
  root.updateWorldMatrix(true, true);
  return new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(o.matrixWorld);
}

function boxMesh(b: AABB, height: number, y0: number, color: number, opacity = 1, material?: THREE.Material): THREE.Mesh {
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  const mat = material ?? new THREE.MeshStandardMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), mat);
  mesh.position.set(b.minX + w / 2, y0 + height / 2, b.minZ + d / 2);
  return mesh;
}

const originalFadeSinglePass = new WeakMap<THREE.Material, boolean>();

/** Fade model meshes, keeping labels opaque; rebuild the shader at the opaque boundary. */
export function setBodyOpacity(root: THREE.Object3D, opacity: number): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const transparent = opacity < 1;
      // Obstruction fading is a visibility aid. Avoid the renderer's second
      // back/front pass for DoubleSide transparency, then restore the authored
      // flag when the temporary fade ends. Geometry and side stay unchanged.
      if (transparent && m.side === THREE.DoubleSide) {
        if (!originalFadeSinglePass.has(m)) originalFadeSinglePass.set(m, m.forceSinglePass);
        m.forceSinglePass = true;
      } else if (originalFadeSinglePass.has(m)) {
        m.forceSinglePass = originalFadeSinglePass.get(m)!;
        originalFadeSinglePass.delete(m);
      }
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        // Three's OPAQUE shader define otherwise keeps alpha at 1 even after
        // the opacity uniform changes on a previously opaque character.
        m.needsUpdate = true;
      }
      m.opacity = opacity;
      m.depthWrite = !transparent;
    }
  });
}

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private environmentFallback = new THREE.Group();
  private environmentModels = new EnvironmentModels(this.scene);
  private worldEnvironment = new WorldEnvironment(this.scene, this.environmentFallback);
  private waterAppearance = new WaterAppearance();
  private fixtureWater: { mesh: THREE.Mesh; rimHeight: number }[] = [];
  private camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
  private chars = {} as Record<CharacterId, THREE.Group>;
  private rings = {} as Record<CharacterId, THREE.Mesh>;
  private items = {} as Record<ItemId, THREE.Object3D>;
  private doorBlocker: THREE.Mesh;
  private labels: Label[] = [];
  /** Full-height walls, cut down in the overview. */
  /** Meshes cut down to OVERVIEW_WALL_HEIGHT in the overview, with their own full height. */
  private tallWalls: { mesh: THREE.Mesh; height: number }[] = [];
  /** Ceilings and the NarrowHole lintel, hidden in the overview. */
  private roofs: THREE.Object3D[] = [];
  /** Primitive meshes per character; hidden when a model replaces them. */
  private primitives = {} as Record<CharacterId, THREE.Object3D[]>;
  private models: Partial<Record<CharacterId, THREE.Object3D>> = {};
  /** `socket_hat` of a loaded Duck model; the hat follows its position and rotation. */
  private duckHatSocket: THREE.Object3D | null = null;
  private itemModels: Partial<Record<ItemId, THREE.Object3D>> = {};
  /** Provisional towels of the two humans. */
  private towels = {} as Record<HumanId, THREE.Object3D>;
  private towelAttempted?: THREE.Object3D;
  /** Head top and right hand of a loaded human model, in its group's local space. */
  private humanBody: Partial<Record<HumanId, { headTop: number; hand?: { x: number; y: number; z: number } }>> = {};
  /** Last ClothingState seen per human (the game starts in the bath). */
  private clothing: Record<"child" | "adult", Clothing> = { child: "unclothed", adult: "unclothed" };
  private viewportHeight = 1;
  private viewportWidth = 1;
  private tmp = new THREE.Vector3();

  private label(text: string, kind: LabelKind, color = "#fff", owner?: CharacterId): THREE.Sprite {
    const { sprite, aspect } = makeLabelSprite(text, color);
    sprite.center.set(0.5, LABEL_CENTER_Y[kind]);
    // Room and fixture names stay behind walls in the shoulder view.
    if (kind === "zone" || kind === "fixture") sprite.material.depthTest = true;
    this.labels.push({ sprite, kind, aspect, owner });
    return sprite;
  }

  /**
   * Keep every label within a readable on-screen size (12–22 px text), then
   * hide labels that would overlap one with higher priority: the controlled
   * character, key items, other characters, fixtures, rooms (review D-4).
   * The controlled character's own label shows only in the overview (the ring
   * marks it in the shoulder view).
   */
  private sizeLabels(active: CharacterId, overview: boolean, items: View["items"]): void {
    const camPos = this.camera.position;
    const cand: { l: Label; rect: ScreenRect }[] = [];
    for (const l of this.labels) {
      l.sprite.getWorldPosition(this.tmp);
      const dist = this.tmp.distanceTo(camPos);
      const own = l.owner === active;
      const held = l.item !== undefined && !itemLabelShown(items[l.item].owner, overview);
      const hidden = (own && !overview) || held || dist < LABEL_HIDE_DISTANCE;
      l.sprite.visible = !hidden;
      if (hidden) continue;
      const textPx = labelPixelHeight(l.kind, dist);
      const hPx = (textPx * LABEL_CANVAS_H) / LABEL_TEXT_PX;
      const h = labelWorldHeight(hPx, this.tmp, this.camera, this.viewportHeight);
      if (h === null) {
        l.sprite.visible = false;
        continue;
      }
      l.sprite.scale.set(h * l.aspect, h, 1);
      const ndc = this.tmp.project(this.camera);
      const px = ((ndc.x + 1) / 2) * this.viewportWidth;
      const py = ((1 - ndc.y) / 2) * this.viewportHeight;
      const wPx = hPx * l.aspect;
      const top = py - (1 - LABEL_CENTER_Y[l.kind]) * hPx;
      const priority = own ? LABEL_PRIORITY.active : (l.priority ?? LABEL_PRIORITY[l.kind]);
      cand.push({ l, rect: { x0: px - wPx / 2, y0: top, x1: px + wPx / 2, y1: top + hPx, priority } });
    }
    const keep = declutter(cand.map((c) => c.rect));
    cand.forEach((c, i) => {
      const k = keep[i]!;
      c.l.sprite.visible = k.show;
      // Sprite center is in label units (0 = bottom at the anchor): lowering it moves the label up.
      const hPx = c.rect.y1 - c.rect.y0;
      c.l.sprite.center.y = LABEL_CENTER_Y[c.l.kind] + k.dy / hPx;
    });
  }

  /** A fixture-kind label above the center of `b`. */
  private fixtureLabel(text: string, b: AABB, y: number, color = "#fff"): void {
    const l = this.label(text, "fixture", color);
    l.position.set((b.minX + b.maxX) / 2, y, (b.minZ + b.maxZ) / 2);
    this.scene.add(l);
  }

  constructor(container: HTMLElement, level: Level) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(SENTO_BACKGROUND_COLOR);
    this.scene.environment = createEnvironmentLight();
    this.scene.environmentIntensity = .65;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.3));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(10, 25, 12);
    this.scene.add(sun);
    this.environmentFallback.name = "environment_fallback";
    this.scene.add(this.environmentFallback);
    const staticSurfaces: THREE.Mesh[] = [];

    // Floors per zone, with name labels.
    for (const z of [...level.zones].reverse()) {
      const sub = z.id === "bathwater" || z.id === "splash" || z.id === "narrow_hole" || z.id === "pond_goal";
      // Water and state overlays remain independent from the authored solid floors.
      const surfaceParent = ["bathwater", "narrow_hole", "pond", "pond_goal", "splash"].includes(z.id)
        ? this.scene : this.environmentFallback;
      const opacity = sub ? 0.9 : 0.75;
      const water = z.id === "pond" ? "pond" : z.id === "bathwater" || z.id === "narrow_hole" ? "bath" : null;
      // Splash/goal overlays retain their existing semantic colors and alpha.
      surfaceParent.add(boxMesh(z.box, 0.02, sub ? 0.012 : 0, ZONE_COLORS[z.id] ?? 0xffffff, opacity,
        water ? this.waterAppearance.material(water, opacity) : undefined));
      const label = this.label(ZONE_NAME[z.id], "zone");
      if (ROUTE_ZONES.has(z.id)) this.labels[this.labels.length - 1]!.priority = LABEL_PRIORITY.fixture;
      const at = zoneLabelAnchor(z.id, z.box);
      label.position.set(at.x, at.y, at.z);
      this.scene.add(label);
    }
    const hole = level.narrowHole.box;
    // Water surfaces from the same data Duck swims on (the tub is drawn by its zone).
    const tubBox = level.zones.find((z) => z.id === "bathwater")!.box;
    for (const w of level.duckWater) {
      if (w.minX === tubBox.minX && w.maxX === tubBox.maxX && w.minZ === tubBox.minZ && w.maxZ === tubBox.maxZ) continue;
      this.scene.add(boxMesh(w, 0.02, 0.014, ZONE_COLORS.bathwater!, 0.9, this.waterAppearance.material("bath", 0.9)));
    }
    // Fixtures at their own height; every other wall is full height.
    const fixtureBoxes = new Set<AABB>(level.fixtures.map((f) => f.box));
    const fullHeightWalls: THREE.Mesh[] = [];
    for (const w of level.walls) {
      if (fixtureBoxes.has(w)) continue;
      fullHeightWalls.push(boxMesh(w, WALL_HEIGHT, 0, 0xe8e8e8));
    }
    // These walls share one height and bottom. Keep their Y origin at the
    // center, so the existing overview scale/translation remains exact.
    for (const mesh of batchOpaqueMeshes(fullHeightWalls, new THREE.Vector3(0, WALL_HEIGHT / 2, 0))) {
      this.tallWalls.push({ mesh, height: WALL_HEIGHT });
      this.environmentFallback.add(mesh);
    }
    for (const f of level.fixtures) {
      const fm = boxMesh(f.box, f.height, 0, FIXTURE_COLORS[f.kind]);
      if (f.height > OVERVIEW_WALL_HEIGHT) this.tallWalls.push({ mesh: fm, height: f.height });
      if (f.kind === "stool") this.scene.add(fm);
      else if (f.height > OVERVIEW_WALL_HEIGHT) this.environmentFallback.add(fm);
      else staticSurfaces.push(fm);
      if (f.kind === "stool") this.environmentModels.register("bath_stool", fm, f.box, 0, f.height);
      // Rimmed water that cannot be entered (cold plunge, outdoor bath, kakeyu basin) shows its water.
      if (f.kind === "plunge" || f.kind === "outdoorBath" || f.kind === "basin") {
        const r = 0.12;
        const w = { minX: f.box.minX + r, minZ: f.box.minZ + r, maxX: f.box.maxX - r, maxZ: f.box.maxZ - r };
        const surface = boxMesh(w, 0.02, f.height + 0.002, f.kind === "plunge" ? 0x7fc4e8 : ZONE_COLORS.bathwater!, 0.9,
          this.waterAppearance.material(f.kind === "plunge" ? "plunge" : "bath", 0.9));
        this.scene.add(surface);
        this.fixtureWater.push({ mesh: surface, rimHeight: f.height });
      }
      if (f.label) this.fixtureLabel(f.label, f.box, f.height + 0.35);
      // Receptionist (provisional): the fixture box is the body; add a head.
      if (f.kind === "staff") {
        const hx = (f.box.maxX - f.box.minX) / 4;
        const hz = (f.box.maxZ - f.box.minZ) / 4;
        staticSurfaces.push(boxMesh({ minX: f.box.minX + hx, minZ: f.box.minZ + hz, maxX: f.box.maxX - hx, maxZ: f.box.maxZ - hz }, 0.25, f.height, 0xf1c9a5));
      }
    }
    for (const d of level.decor) {
      const dm = boxMesh(d.box, d.height, d.y0, DECOR_COLORS[d.kind], d.kind === "mirror" ? 0.85 : 1);
      if (d.kind === "bucket") this.scene.add(dm);
      else if (d.kind === "mirror") this.environmentFallback.add(dm);
      else staticSurfaces.push(dm);
      if (d.kind === "bucket") this.environmentModels.register("wash_basin", dm, d.box, d.y0, d.height);
      if (d.label) this.fixtureLabel(d.label, d.box, d.y0 + d.height + 0.3);
    }
    // NarrowHole alcove: lid over the corridor and the wall part above the opening.
    const lid = boxMesh({ minX: hole.minX - 0.2, minZ: hole.minZ - 0.2, maxX: hole.maxX, maxZ: hole.maxZ + 0.2 }, 0.05, HOLE_LID_Y, 0xd8d0e8);
    this.roofs.push(lid);
    this.environmentFallback.add(lid);
    const lintel = boxMesh({ minX: hole.maxX - 0.1, minZ: hole.minZ, maxX: hole.maxX + 0.1, maxZ: hole.maxZ }, WALL_HEIGHT - HOLE_LID_Y, HOLE_LID_Y, 0xe8e8e8);
    this.roofs.push(lintel);
    this.environmentFallback.add(lintel);
    for (const z of level.zones) {
      if (!INDOOR.has(z.id)) continue;
      const c = boxMesh(z.box, 0.05, CEILING_Y, 0x3a3f4a);
      this.roofs.push(c);
      this.environmentFallback.add(c);
    }
    // Sauna: occupied bench rows (seated bathers on a bench), placeholder shapes.
    for (const n of level.npcs) {
      staticSurfaces.push(boxMesh(n, 0.45, 0, 0x8a5a32));
      staticSurfaces.push(boxMesh({ minX: n.minX + 0.1, minZ: n.minZ + 0.05, maxX: n.maxX - 0.1, maxZ: n.maxZ - 0.05 }, 0.75, 0.45, 0xc27ba0));
    }
    if (level.npcs.length > 0) {
      const b = level.npcs.reduce((u, n) => ({ minX: Math.min(u.minX, n.minX), minZ: Math.min(u.minZ, n.minZ), maxX: Math.max(u.maxX, n.maxX), maxZ: Math.max(u.maxZ, n.maxZ) }));
      this.fixtureLabel("座っている人たち（押さない）", b, 1.6, "#ffd");
    }

    this.doorBlocker = boxMesh(level.saunaDoorBlocker, 2.2, 0, 0x5b3a1a);
    this.environmentFallback.add(this.doorBlocker);
    this.fixtureLabel("サウナの扉", level.saunaDoorBlocker, 1.6, "#fda");

    // Interaction spots without a fixture of their own.
    const e = level.channelEntrance;
    this.fixtureLabel("水路の入口（子どもがアヒルを下ろす）", { minX: e.x, maxX: e.x, minZ: e.z, maxZ: e.z }, 0.9, "#bdf");
    for (const soap of level.soaps) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.18), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      m.position.set(soap.pos.x, 0.05, soap.pos.z);
      this.scene.add(m);
      this.environmentModels.register("soap", m, { minX: soap.pos.x - 0.15, maxX: soap.pos.x + 0.15,
        minZ: soap.pos.z - 0.09, maxZ: soap.pos.z + 0.09 }, 0.01, 0.08);
      this.fixtureLabel("石鹸（走らない）", { minX: soap.pos.x, maxX: soap.pos.x, minZ: soap.pos.z, maxZ: soap.pos.z }, 0.5);
    }
    this.environmentFallback.add(...batchOpaqueMeshes(staticSurfaces));

    // Characters: Duck sphere, Child small capsule, Adult tall capsule.
    for (const id of ["duck", "child", "adult"] as const) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: CHAR_COLORS[id] });
      const r = id === "duck" ? 0.15 : id === "child" ? 0.25 : 0.35;
      const body =
        id === "duck"
          ? new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat)
          : new THREE.Mesh(new THREE.CapsuleGeometry(r, BODY_HEIGHT[id] - 2 * r, 8, 16), mat);
      g.add(body);
      this.primitives[id] = [body];
      // Front marker (+Z, the model front): beak for Duck, a face plate for humans,
      // so the back is readable in the shoulder view. Placeholder only.
      const front =
        id === "duck"
          ? new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0xff8800 }))
          : new THREE.Mesh(new THREE.BoxGeometry(r * 1.1, r * 0.6, 0.06), new THREE.MeshStandardMaterial({ color: 0xffe0c0 }));
      if (id === "duck") {
        front.rotation.x = Math.PI / 2;
        front.position.set(0, 0.03, 0.17);
      } else {
        front.position.set(0, BODY_HEIGHT[id] / 2 - r * 0.9, r * 0.95);
      }
      g.add(front);
      this.primitives[id].push(front);
      if (id !== "duck") {
        // Provisional towel (not a final asset): a child of the character group, so it
        // follows movement, turning and outfit changes; its place comes from state.
        const towel = new THREE.Mesh(
          new THREE.BoxGeometry(TOWEL_WIDTH, TOWEL_THICKNESS, TOWEL_DEPTH),
          new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.9 }),
        );
        towel.name = "towel_provisional";
        g.add(towel);
        this.towels[id] = towel;
      }
      const label = this.label(CHARACTER_NAME[id], "character", "#fff", id);
      label.position.set(0, BODY_HEIGHT[id] / 2 + CHARACTER_LABEL_GAP, 0);
      g.add(label);
      this.scene.add(g);
      this.chars[id] = g;

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r + 0.08, r + 0.16, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      this.scene.add(ring);
      this.rings[id] = ring;
    }

    // Items as independent primitives.
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0xffc107, metalness: 0.6, roughness: 0.3 }));
    const key = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.08), new THREE.MeshStandardMaterial({ color: 0xd0d0d0, metalness: 0.7 }));
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.16, 20), new THREE.MeshStandardMaterial({ color: 0xe53935 }));
    for (const [id, mesh] of [["coin", coin], ["key", key], ["hat", hat]] as const) {
      const g = new THREE.Group();
      g.add(mesh);
      const l = this.label(ITEM_NAME[id], "item", "#ffe");
      this.labels[this.labels.length - 1]!.item = id;
      l.position.set(0, ITEM_LABEL_Y, 0);
      g.add(l);
      this.scene.add(g);
      this.items[id] = g;
    }
  }

  /** Connect loaded assets through the existing, tested model-placement path. */
  useModels(lib: ModelLibrary): void {
    this.environmentModels.use(lib);
    // The full world has a different geometry allocation. Keep the playable
    // fallback until every washing-station LOD can satisfy that allocation.
    if (this.environmentModels.hasWashingDetailSet()) this.worldEnvironment.use(lib);
    // Authored hollow vessels need the water below their real rim. The legacy
    // solid-box fallback retains its original above-top surface until replaced.
    for (const { mesh, rimHeight } of this.fixtureWater) {
      mesh.position.y = rimHeight + (this.worldEnvironment.active ? -.035 : .012);
    }
    const towel = lib.get("towel");
    if (towel) this.setTowelModel(towel.root);
    for (const id of ["duck", "child", "adult"] as const) {
      const model = lib.get(id);
      if (!model || this.models[id] === model.root) continue;
      try {
        this.setCharacterModel(id, model.root);
      } catch (error) {
        console.warn(`Model for ${id} failed its display contract; keeping the current model.`, error);
      }
    }
    for (const id of ["coin", "key", "hat"] as const) {
      const model = lib.get(id);
      if (model && this.itemModels[id] !== model.root) this.setItemModel(id, model.root);
    }
  }

  /** Center wrapper keeps the existing head/hand pose math unchanged. */
  private setTowelModel(source: THREE.Object3D): void {
    if (source === this.towelAttempted) return;
    this.towelAttempted = source;
    const template = source.clone(true);
    template.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(template, true);
    const size = bounds.getSize(new THREE.Vector3());
    if (![...size.toArray(), ...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite) ||
        [size.x, size.y, size.z].some(n => n <= 1e-6)) {
      console.warn("Towel model has invalid bounds; keeping the current display.");
      return;
    }
    template.position.sub(bounds.getCenter(new THREE.Vector3()));
    const scale = Math.min(TOWEL_WIDTH / size.x, TOWEL_THICKNESS / size.y, TOWEL_DEPTH / size.z);
    for (const id of ["child", "adult"] as const) {
      const previous = this.towels[id];
      const wrapper = new THREE.Group();
      wrapper.name = "towel";
      const model = template.clone(true);
      // Character occlusion fade is per person; never share mutable materials
      // between the two towels or with the source in ModelLibrary.
      model.traverse(o => {
        if (o instanceof THREE.Mesh) o.material = Array.isArray(o.material)
          ? o.material.map(m => m.clone()) : o.material.clone();
      });
      const fitted = new THREE.Group();
      fitted.scale.setScalar(scale);
      fitted.add(model);
      wrapper.add(fitted);
      wrapper.position.copy(previous.position);
      wrapper.quaternion.copy(previous.quaternion);
      this.chars[id].add(wrapper);
      previous.removeFromParent();
      this.towels[id] = wrapper;
    }
  }

  /**
   * Show a loaded model instead of the primitive (shoulder-view Req 6.2). The
   * model follows the final-assets contract: meters, +Y up, front +Z, origin at
   * the bottom center. The group sits at the mesh center, so the root is
   * lowered by the center-to-bottom distance.
   */
  setCharacterModel(id: CharacterId, root: THREE.Object3D): void {
    // Humans: show only the outfit for the current ClothingState before the first render.
    if (id !== "duck") {
      const problems = checkHumanContract(id, root);
      if (problems.length) throw new Error(`${id} model contract: ${problems.join(", ")}`);
      applyOutfit(root, this.clothing[id]);
    }
    const old = this.models[id];
    if (old) this.chars[id].remove(old);
    for (const p of this.primitives[id]) p.visible = false;
    // Same rule as final-assets: rootY = centerY − radius (Duck), centerY − height / 2 (humans).
    const centerToBottom = id === "duck" ? CHARACTER_RADIUS.duck : BODY_HEIGHT[id] / 2;
    root.position.set(0, -centerToBottom, 0);
    this.chars[id].add(root);
    this.models[id] = root;
    if (id === "duck") this.duckHatSocket = root.getObjectByName("socket_hat") ?? null;
    // Name label at the model's socket_label, if it has one (final-assets sockets).
    const sl = root.getObjectByName("socket_label");
    const label = this.chars[id].children.find((o) => o instanceof THREE.Sprite);
    if (sl && label) label.position.set(sl.position.x, sl.position.y - centerToBottom, sl.position.z);
    if (id !== "duck") {
      // Towel anchors from the model: top of the bounds (head) and socket_hand_r, in group space.
      root.updateMatrix();
      const box = new THREE.Box3();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh && o !== this.towels[id]) {
          o.geometry.computeBoundingBox();
          box.union(o.geometry.boundingBox!.clone().applyMatrix4(relativeMatrix(o, this.chars[id])));
        }
      });
      const hand = root.getObjectByName("socket_hand_r");
      const handPos = hand ? new THREE.Vector3().setFromMatrixPosition(relativeMatrix(hand, this.chars[id])) : undefined;
      this.humanBody[id] = {
        headTop: headAnchor(BODY_HEIGHT[id], box.isEmpty() ? undefined : box.max.y),
        hand: handPos ? { x: handPos.x, y: handPos.y, z: handPos.z } : undefined,
      };
    }
  }

  /**
   * Show a loaded item model instead of its primitive. Item GLBs have their
   * origin at the base center (the hat: inner base), so off a socket the
   * model is lowered to where the primitive's bottom was; on Duck's
   * `socket_hat` the base sits on the socket itself.
   */
  setItemModel(id: ItemId, root: THREE.Object3D): void {
    const g = this.items[id];
    const old = this.itemModels[id];
    if (old) g.remove(old);
    for (const o of g.children) if (o instanceof THREE.Mesh) o.visible = false;
    g.add(root);
    this.itemModels[id] = root;
  }

  private setOverview(on: boolean): void {
    this.worldEnvironment.setView(on);
    for (const { mesh, height } of this.tallWalls) {
      const h = on ? OVERVIEW_WALL_HEIGHT : height;
      mesh.scale.y = h / height;
      mesh.position.y = h / 2;
    }
    for (const r of this.roofs) r.visible = !on;
    // Overview: cut walls must not chop room names; shoulder view: names stay behind walls.
    for (const l of this.labels) if (l.kind === "zone" || l.kind === "fixture") l.sprite.material.depthTest = !on;
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h);
    this.viewportHeight = h;
    this.viewportWidth = w;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Resolve actual model poses before computing the camera, including carried Duck's socket. */
  positionCharacters(view: View, timeSeconds: number, facing: FacingTracker): Vec3 {
    this.waterAppearance.update(timeSeconds);
    const carrierId = view.characters.duck.carrier ?? "adult";
    const carry = forwardOf(facing.yaw(carrierId));
    const duckShift = view.characters.duck.carried ? { x: carry.x * CARRY_FORWARD, z: carry.z * CARRY_FORWARD } : { x: 0, z: 0 };
    for (const id of ["duck", "child", "adult"] as const) {
      const c = view.characters[id];
      let y = c.pos.y;
      if (id === "duck" && !c.carried) y += Math.sin(timeSeconds * 3) * 0.015; // gentle bobbing
      const shift = id === "duck" ? duckShift : { x: 0, z: 0 };
      this.chars[id].position.set(c.pos.x + shift.x, y, c.pos.z + shift.z);
      this.chars[id].rotation.y = modelRotationY(facing.yaw(id));
      if (id !== "duck" && c.towel) {
        const t = towelPose(c.towel, { height: c.height, radius: c.radius, ...this.humanBody[id] });
        this.towels[id].position.set(t.x, t.y, t.z);
        this.towels[id].rotation.set(t.rotX, 0, 0);
      }
      if (id !== "duck" && this.clothing[id] !== c.clothing) {
        this.clothing[id] = c.clothing;
        const m = this.models[id];
        if (m) applyOutfit(m, c.clothing);
      }
      const ring = this.rings[id];
      ring.visible = c.active;
      ring.position.set(c.pos.x, 0.04, c.pos.z);
    }
    // All character transforms are current before resolving sockets. Adult:
    // the Duck GLB's bottom on `socket_carry`. Child has no carry socket, so
    // Duck's center sits at the real right hand (`socket_hand_r`), turned
    // like the Child (no socket tilt), never above the head or on Adult.
    if (view.characters.duck.carried) {
      if (carrierId === "adult") {
        const carrySocket = this.models.adult?.getObjectByName("socket_carry");
        if (carrySocket) placeCharacterAtSocket(this.chars.duck, carrySocket, CHARACTER_RADIUS.duck);
      } else {
        const hand = this.models.child?.getObjectByName("socket_hand_r");
        if (hand) {
          this.chars.child.updateWorldMatrix(true, true);
          hand.getWorldPosition(this.chars.duck.position);
          this.chars.duck.rotation.set(0, modelRotationY(facing.yaw("child")), 0);
        }
      }
    }
    const focus = this.chars[view.active].position;
    return { x: focus.x, y: focus.y, z: focus.z };
  }

  render(view: View, pose: Pose, overview: boolean): void {
    this.setOverview(overview);
    const act = this.chars[view.active].position;
    for (const id of ["duck", "child", "adult"] as const) {
      const c = view.characters[id];
      const fade = overview || c.active ? 1 : bodyOpacity(pose.eye, act, this.chars[id].position, c.radius);
      setBodyOpacity(this.chars[id], fade);
    }
    for (const id of ["coin", "key", "hat"] as const) {
      const it = view.items[id];
      this.items[id].visible = it.visible;
      if (id === "hat" && view.hatAttachedToDuck) {
        if (this.duckHatSocket) {
          placeAtSocket(this.items.hat, this.duckHatSocket);
          this.itemModels.hat?.position.set(0, 0, 0);
        } else {
          // Even a fallback Duck may sit on a loaded Adult's real carry
          // socket. Follow its actual group, not the old forward offset.
          placeCharacterAtSocket(this.items.hat, this.chars.duck, it.pos.y - view.characters.duck.pos.y);
          this.itemModels.hat?.position.set(0, -ITEM_PRIMITIVE_HALF_HEIGHT.hat, 0);
        }
        continue;
      }
      const hand = it.owner.kind === "character" && it.owner.id !== "duck"
        ? this.models[it.owner.id]?.getObjectByName("socket_hand_r") : null;
      if (hand) {
        placeAtSocket(this.items[id], hand);
        this.itemModels[id]?.position.set(0, 0, 0);
        continue;
      }
      if (it.owner.kind === "character" && it.owner.id === "duck") {
        // Follow the Duck as actually drawn (e.g. in Child's hand), keeping the view offset.
        const d = view.characters.duck.pos;
        const g = this.chars.duck.position;
        this.items[id].position.set(g.x + it.pos.x - d.x, g.y + it.pos.y - d.y, g.z + it.pos.z - d.z);
        this.items[id].quaternion.identity();
        this.itemModels[id]?.position.set(0, -ITEM_PRIMITIVE_HALF_HEIGHT[id], 0);
        continue;
      }
      this.items[id].position.set(it.pos.x, it.pos.y, it.pos.z);
      this.items[id].quaternion.identity();
      this.itemModels[id]?.position.set(0, -ITEM_PRIMITIVE_HALF_HEIGHT[id], 0);
    }
    this.doorBlocker.visible = view.saunaDoorLocked;
    this.worldEnvironment.setView(overview, view.saunaDoorLocked);
    this.camera.position.set(pose.eye.x, pose.eye.y, pose.eye.z);
    this.camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
    this.environmentModels.updateDetail(this.camera.position, overview);
    this.worldEnvironment.updateDetail(this.camera.position);
    this.camera.updateMatrixWorld();
    this.sizeLabels(view.active, overview, view.items);
    this.renderer.render(this.scene, this.camera);
  }
}
