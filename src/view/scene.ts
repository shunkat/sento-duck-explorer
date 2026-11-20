// Placeholder-model scene. Static level built once; dynamic meshes follow the
// view model each frame. Shapes are primitives only (Req 9.1, 9.2, 9.5).
import * as THREE from "three";
import { CHARACTER_NAME, ITEM_NAME, ZONE_NAME } from "../core/text";
import type { CharacterId, ItemId } from "../core/types";
import type { Level } from "../level/layout";
import type { AABB } from "../sim/geometry";
import type { Pose } from "./camera";
import { BODY_HEIGHT, type View } from "./deriveView";
import { type ModelLibrary, placeHatOnSocket } from "./models";
import { LABEL_HIDE_DISTANCE, type LabelKind, labelPixelHeight, worldHeightForPixels } from "./labels";

const ZONE_COLORS: Record<string, number> = {
  bath: 0x6fa8dc, bathwater: 0x2f6fb3, splash: 0x9fc5e8, narrow_hole: 0x8e7cc3,
  changing: 0xf6b26b, reception: 0xe06666, common: 0xcc7755, exterior: 0x888888,
  sauna_entry: 0xb45f06, sauna_crowd: 0x8a4a12, open_air: 0x93c47d,
  pond_entrance: 0x6aa84f, pond: 0x2f7f8f, pond_goal: 0xffd24a,
};
const CHAR_COLORS: Record<CharacterId, number> = { duck: 0xffe033, child: 0x3fa0ff, adult: 0x3fc76a };

/** Canvas text height inside the label texture (the rest is padding). */
const LABEL_TEXT_PX = 44;
const LABEL_CANVAS_H = 64;

interface Label {
  sprite: THREE.Sprite;
  kind: LabelKind;
  /** Width / height of the label texture. */
  aspect: number;
  /** Hidden while this character is active (the ring already marks it). */
  owner?: CharacterId;
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

function boxMesh(b: AABB, height: number, y0: number, color: number, opacity = 1): THREE.Mesh {
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  const mat = new THREE.MeshStandardMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), mat);
  mesh.position.set(b.minX + w / 2, y0 + height / 2, b.minZ + d / 2);
  return mesh;
}

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
  private chars = {} as Record<CharacterId, THREE.Group>;
  private rings = {} as Record<CharacterId, THREE.Mesh>;
  private items = {} as Record<ItemId, THREE.Object3D>;
  private doorBlocker: THREE.Mesh;
  private labels: Label[] = [];
  /** Primitive meshes of each character and item; hidden when a model replaces them. */
  private primitives = {} as Record<CharacterId, THREE.Object3D[]>;
  private itemPrimitives = {} as Record<ItemId, THREE.Object3D>;
  /** Loaded models in use (all absent unless useModels found them). */
  private modelRoots: Partial<Record<CharacterId, THREE.Object3D>> = {};
  private modelLib: ModelLibrary | null = null;
  private lastPos: Partial<Record<CharacterId, { x: number; z: number }>> = {};
  private viewportHeight = 1;
  private tmp = new THREE.Vector3();

  private label(text: string, kind: LabelKind, color = "#fff", owner?: CharacterId): THREE.Sprite {
    const { sprite, aspect } = makeLabelSprite(text, color);
    this.labels.push({ sprite, kind, aspect, owner });
    return sprite;
  }

  /** Keep every label within a readable on-screen size (12–22 px text). */
  private sizeLabels(active: CharacterId): void {
    const camPos = this.camera.position;
    for (const l of this.labels) {
      l.sprite.getWorldPosition(this.tmp);
      const dist = this.tmp.distanceTo(camPos);
      const hidden = l.owner === active || dist < LABEL_HIDE_DISTANCE;
      l.sprite.visible = !hidden;
      if (hidden) continue;
      const textPx = labelPixelHeight(l.kind, dist);
      const h = worldHeightForPixels((textPx * LABEL_CANVAS_H) / LABEL_TEXT_PX, dist, this.camera.fov, this.viewportHeight);
      l.sprite.scale.set(h * l.aspect, h, 1);
    }
  }

  constructor(container: HTMLElement, level: Level) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x1d2330);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.3));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(10, 25, 12);
    this.scene.add(sun);

    // Floors per zone, with name labels.
    for (const z of [...level.zones].reverse()) {
      const sub = z.id === "bathwater" || z.id === "splash" || z.id === "narrow_hole" || z.id === "pond_goal";
      this.scene.add(boxMesh(z.box, 0.02, sub ? 0.012 : 0, ZONE_COLORS[z.id] ?? 0xffffff, sub ? 0.9 : 0.75));
      const label = this.label(ZONE_NAME[z.id], "zone");
      label.position.set((z.box.minX + z.box.maxX) / 2, 0.35, (z.box.minZ + z.box.maxZ) / 2);
      if (z.id === "narrow_hole") label.position.set(z.box.minX + 0.8, 0.45, z.box.minZ - 0.3);
      this.scene.add(label);
    }
    for (const w of level.walls) this.scene.add(boxMesh(w, 1.0, 0, 0xe8e8e8, 0.55));
    for (const n of level.npcs) this.scene.add(boxMesh(n, 1.6, 0, 0xc27ba0));
    const crowd = this.label("サウナの人混み（押さない）", "fixture", "#ffd");
    crowd.position.set(9.5, 2.0, 10);
    this.scene.add(crowd);

    this.doorBlocker = boxMesh(level.saunaDoorBlocker, 1.4, 0, 0x5b3a1a);
    this.scene.add(this.doorBlocker);
    const doorLabel = this.label("サウナの扉", "fixture", "#fda");
    doorLabel.position.set((level.saunaDoorBlocker.minX + level.saunaDoorBlocker.maxX) / 2, 1.6, 7.7);
    this.scene.add(doorLabel);

    // Fixtures.
    const locker = boxMesh({ minX: level.locker.x + 0.3, minZ: level.locker.z - 0.6, maxX: level.locker.x + 0.7, maxZ: level.locker.z + 0.6 }, 1.6, 0, 0xff9900);
    this.scene.add(locker);
    const lockerLabel = this.label("ロッカー（G）", "fixture");
    lockerLabel.position.set(level.locker.x + 0.5, 1.9, level.locker.z);
    this.scene.add(lockerLabel);
    const d = level.nodes.reception_desk;
    this.scene.add(boxMesh({ minX: d.x - 1.2, minZ: d.z - 0.9, maxX: d.x + 1.6, maxZ: d.z - 0.4 }, 0.9, 0, 0x8b5a2b));
    const deskLabel = this.label("受付台", "fixture");
    deskLabel.position.set(d.x, 1.4, d.z - 0.6);
    this.scene.add(deskLabel);
    const shelf = level.nodes.sauna_hat_shelf;
    this.scene.add(boxMesh({ minX: shelf.x + 0.2, minZ: shelf.z - 0.4, maxX: shelf.x + 0.5, maxZ: shelf.z + 0.4 }, 0.6, 0, 0x6b4a2b));
    for (const soap of level.soaps) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.18), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      m.position.set(soap.pos.x, 0.05, soap.pos.z);
      this.scene.add(m);
      const l = this.label("石鹸（走らない）", "fixture");
      l.position.set(soap.pos.x, 0.5, soap.pos.z);
      this.scene.add(l);
    }

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
      if (id === "duck") {
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0xff8800 }));
        beak.rotation.x = -Math.PI / 2;
        beak.position.set(0, 0.03, -0.17);
        g.add(beak);
        this.primitives[id].push(beak);
      }
      const label = this.label(CHARACTER_NAME[id], "character", "#fff", id);
      label.position.set(0, (id === "duck" ? 0.35 : BODY_HEIGHT[id] / 2 + 0.35), 0);
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
      this.itemPrimitives[id] = mesh;
      const l = this.label(ITEM_NAME[id], "item", "#ffe");
      l.position.set(0, 0.25, 0);
      g.add(l);
      this.scene.add(g);
      this.items[id] = g;
    }
  }

  /**
   * Replace primitives with loaded models. Ids with no model keep their primitive,
   * so with an empty library nothing changes (Req 9.4). Model roots sit at
   * `centerY - radius` (Duck) or `centerY - height / 2` (humans) relative to the
   * view position, which is the mesh center.
   */
  useModels(lib: ModelLibrary): void {
    this.modelLib = lib;
    for (const id of ["duck", "child", "adult"] as const) {
      const model = lib.get(id);
      if (!model || this.modelRoots[id]) continue;
      const g = this.chars[id];
      for (const p of this.primitives[id]) p.visible = false;
      model.root.position.y = -(id === "duck" ? 0.15 : BODY_HEIGHT[id] / 2);
      g.add(model.root);
      this.modelRoots[id] = model.root;
      const anchor = model.sockets.socket_label;
      if (anchor) {
        g.updateMatrixWorld(true);
        const label = g.children.find((c): c is THREE.Sprite => c instanceof THREE.Sprite);
        if (label) label.position.copy(g.worldToLocal(anchor.getWorldPosition(new THREE.Vector3())));
      }
    }
    const hat = lib.get("hat");
    if (hat && this.itemPrimitives.hat.visible) {
      this.itemPrimitives.hat.visible = false;
      this.items.hat.add(hat.root);
    }
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h);
    this.viewportHeight = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Turn a model toward its movement direction (view-only state; model front is +Z). */
  private faceMovement(id: CharacterId, x: number, z: number): void {
    const root = this.modelRoots[id];
    const prev = this.lastPos[id];
    this.lastPos[id] = { x, z };
    if (!root || !prev) return;
    const dx = x - prev.x;
    const dz = z - prev.z;
    if (dx * dx + dz * dz > 1e-8) root.rotation.y = Math.atan2(dx, dz);
  }

  /** Carried Duck: its root sits on Adult's socket_carry (0.90 m). Without both models, the view position is kept. */
  private placeCarriedDuck(view: View): void {
    const socket = this.modelLib?.get("adult")?.sockets.socket_carry;
    if (!view.characters.duck.carried || !socket || !this.modelRoots.duck || !this.modelRoots.adult) return;
    this.chars.adult.updateMatrixWorld(true);
    const p = socket.getWorldPosition(this.tmp);
    this.chars.duck.position.set(p.x, p.y + view.characters.duck.radius, p.z);
  }

  /** Hat on Duck's socket_hat while attached to Duck (the view's own hat position is used otherwise). */
  private placeHat(view: View): void {
    const socket = this.modelRoots.duck ? this.modelLib?.get("duck")?.sockets.socket_hat : undefined;
    if (view.hatAttachedToDuck && socket) this.chars.duck.updateMatrixWorld(true);
    placeHatOnSocket(this.items.hat, view.hatAttachedToDuck, socket, this.tmp);
  }

  render(view: View, pose: Pose, timeSeconds: number): void {
    for (const id of ["duck", "child", "adult"] as const) {
      const c = view.characters[id];
      let y = c.pos.y;
      if (id === "duck" && !c.carried) y += Math.sin(timeSeconds * 3) * 0.015; // gentle bobbing
      this.chars[id].position.set(c.pos.x, y, c.pos.z);
      this.faceMovement(id, c.pos.x, c.pos.z);
      const ring = this.rings[id];
      ring.visible = c.active;
      ring.position.set(c.pos.x, 0.04, c.pos.z);
    }
    this.placeCarriedDuck(view);
    for (const id of ["coin", "key", "hat"] as const) {
      const it = view.items[id];
      this.items[id].visible = it.visible;
      this.items[id].position.set(it.pos.x, it.pos.y, it.pos.z);
    }
    this.placeHat(view);
    this.doorBlocker.visible = view.saunaDoorLocked;
    this.camera.position.set(pose.eye.x, pose.eye.y, pose.eye.z);
    this.camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
    this.camera.updateMatrixWorld();
    this.sizeLabels(view.active);
    this.renderer.render(this.scene, this.camera);
  }
}
