// Placeholder-model scene. Static level built once; dynamic meshes follow the
// view model each frame. Shapes are primitives only (Req 9.1, 9.2, 9.5).
import * as THREE from "three";
import { CHARACTER_NAME, ITEM_NAME, ZONE_NAME } from "../core/text";
import type { CharacterId, ItemId } from "../core/types";
import { CHARACTER_RADIUS, type Level } from "../level/layout";
import type { AABB } from "../sim/geometry";
import type { Pose } from "./camera";
import { BODY_HEIGHT, type View } from "./deriveView";
import { CEILING_Y, type FacingTracker, forwardOf, HOLE_LID_Y, modelRotationY, nearCameraOpacity, placeAtSocket, WALL_HEIGHT } from "./shoulder";
import {
  CHARACTER_LABEL_GAP,
  LABEL_CANVAS_H,
  LABEL_CENTER_Y,
  LABEL_HIDE_DISTANCE,
  LABEL_TEXT_PX,
  type LabelKind,
  labelPixelHeight,
  worldHeightForPixels,
  zoneLabelAnchor,
} from "./labels";

const ZONE_COLORS: Record<string, number> = {
  bath: 0x6fa8dc, bathwater: 0x2f6fb3, splash: 0x9fc5e8, narrow_hole: 0x8e7cc3,
  changing: 0xf6b26b, reception: 0xe06666, common: 0xcc7755, exterior: 0x888888,
  sauna_entry: 0xb45f06, sauna_crowd: 0x8a4a12, open_air: 0x93c47d,
  pond_entrance: 0x6aa84f, pond: 0x2f7f8f, pond_goal: 0xffd24a,
};
/** Zones with a ceiling in the shoulder view (hidden in the overview). */
const INDOOR = new Set(["reception", "common", "changing", "bath", "sauna_entry", "sauna_crowd"]);
/** View-only: the carried Duck is drawn this far in front of Adult (final model: socket_carry). */
const CARRY_FORWARD = 0.3;
/** Wall height while the overview shows the map as a cutaway. */
const OVERVIEW_WALL_HEIGHT = 1.0;

const CHAR_COLORS: Record<CharacterId, number> = { duck: 0xffe033, child: 0x3fa0ff, adult: 0x3fc76a };

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
  /** Full-height walls, cut down in the overview. */
  private tallWalls: THREE.Mesh[] = [];
  /** Ceilings and the NarrowHole lintel, hidden in the overview. */
  private roofs: THREE.Object3D[] = [];
  /** Primitive meshes per character; hidden when a model replaces them. */
  private primitives = {} as Record<CharacterId, THREE.Object3D[]>;
  private models: Partial<Record<CharacterId, THREE.Object3D>> = {};
  /** `socket_hat` of a loaded Duck model; the hat follows its position and rotation. */
  private duckHatSocket: THREE.Object3D | null = null;
  private viewportHeight = 1;
  private tmp = new THREE.Vector3();

  private label(text: string, kind: LabelKind, color = "#fff", owner?: CharacterId): THREE.Sprite {
    const { sprite, aspect } = makeLabelSprite(text, color);
    sprite.center.set(0.5, LABEL_CENTER_Y[kind]);
    // Room and fixture names stay behind walls in the shoulder view.
    if (kind === "zone" || kind === "fixture") sprite.material.depthTest = true;
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
      const at = zoneLabelAnchor(z.id, z.box);
      label.position.set(at.x, at.y, at.z);
      this.scene.add(label);
    }
    const hole = level.narrowHole.box;
    for (const w of level.walls) {
      // The NarrowHole corridor sides stop at its lid; every other wall is full height.
      if (w.maxX <= hole.maxX + 1e-6 && w.minX >= hole.minX - 0.3) {
        this.scene.add(boxMesh(w, HOLE_LID_Y, 0, 0xd8d0e8));
        continue;
      }
      // Pond rocks are low boulders, not walls (they still block the camera).
      const rock = w.minX > 27 && w.maxX - w.minX > 0.5 && w.maxZ - w.minZ > 0.5;
      if (rock) {
        this.scene.add(boxMesh(w, 1.0, 0, 0x8a8f86));
        continue;
      }
      const m = boxMesh(w, WALL_HEIGHT, 0, 0xe8e8e8);
      this.tallWalls.push(m);
      this.scene.add(m);
    }
    // NarrowHole: lid over the corridor and the wall part above the opening.
    const lid = boxMesh({ minX: hole.minX - 0.2, minZ: hole.minZ - 0.2, maxX: hole.maxX, maxZ: hole.maxZ + 0.2 }, 0.05, HOLE_LID_Y, 0xd8d0e8);
    this.roofs.push(lid);
    this.scene.add(lid);
    const lintel = boxMesh({ minX: hole.maxX - 0.1, minZ: hole.minZ, maxX: hole.maxX + 0.1, maxZ: hole.maxZ }, WALL_HEIGHT - HOLE_LID_Y, HOLE_LID_Y, 0xe8e8e8);
    this.roofs.push(lintel);
    this.scene.add(lintel);
    for (const z of level.zones) {
      if (!INDOOR.has(z.id)) continue;
      const c = boxMesh(z.box, 0.05, CEILING_Y, 0x3a3f4a);
      this.roofs.push(c);
      this.scene.add(c);
    }
    for (const n of level.npcs) this.scene.add(boxMesh(n, 1.6, 0, 0xc27ba0));
    const crowd = this.label("サウナの人混み（押さない）", "fixture", "#ffd");
    crowd.position.set(9.5, 2.0, 10);
    this.scene.add(crowd);

    this.doorBlocker = boxMesh(level.saunaDoorBlocker, 2.2, 0, 0x5b3a1a);
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
      l.position.set(0, 0.25, 0);
      g.add(l);
      this.scene.add(g);
      this.items[id] = g;
    }
  }

  /**
   * Show a loaded model instead of the primitive (shoulder-view Req 6.2). The
   * model follows the final-assets contract: meters, +Y up, front +Z, origin at
   * the bottom center. The group sits at the mesh center, so the root is
   * lowered by the center-to-bottom distance.
   */
  setCharacterModel(id: CharacterId, root: THREE.Object3D): void {
    const old = this.models[id];
    if (old) this.chars[id].remove(old);
    for (const p of this.primitives[id]) p.visible = false;
    // Same rule as final-assets: rootY = centerY − radius (Duck), centerY − height / 2 (humans).
    const centerToBottom = id === "duck" ? CHARACTER_RADIUS.duck : BODY_HEIGHT[id] / 2;
    root.position.set(0, -centerToBottom, 0);
    this.chars[id].add(root);
    this.models[id] = root;
    if (id === "duck") this.duckHatSocket = root.getObjectByName("socket_hat") ?? null;
  }

  /** Fade a character's body (primitive or model), not its label (review D-1). */
  private setBodyOpacity(id: CharacterId, opacity: number): void {
    this.chars[id].traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.opacity === opacity) continue;
        m.transparent = opacity < 1;
        m.opacity = opacity;
        m.depthWrite = opacity >= 1;
      }
    });
  }

  private setOverview(on: boolean): void {
    const h = on ? OVERVIEW_WALL_HEIGHT : WALL_HEIGHT;
    for (const w of this.tallWalls) {
      w.scale.y = h / WALL_HEIGHT;
      w.position.y = h / 2;
    }
    for (const r of this.roofs) r.visible = !on;
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h);
    this.viewportHeight = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(view: View, pose: Pose, timeSeconds: number, facing: FacingTracker, overview: boolean): void {
    this.setOverview(overview);
    const carry = forwardOf(facing.yaw("adult"));
    const duckShift = view.characters.duck.carried ? { x: carry.x * CARRY_FORWARD, z: carry.z * CARRY_FORWARD } : { x: 0, z: 0 };
    for (const id of ["duck", "child", "adult"] as const) {
      const c = view.characters[id];
      let y = c.pos.y;
      if (id === "duck" && !c.carried) y += Math.sin(timeSeconds * 3) * 0.015; // gentle bobbing
      const shift = id === "duck" ? duckShift : { x: 0, z: 0 };
      this.chars[id].position.set(c.pos.x + shift.x, y, c.pos.z + shift.z);
      this.chars[id].rotation.y = modelRotationY(facing.yaw(id));
      const fade = overview || c.active ? 1 : nearCameraOpacity(Math.hypot(c.pos.x - pose.eye.x, c.pos.z - pose.eye.z));
      this.setBodyOpacity(id, fade);
      const ring = this.rings[id];
      ring.visible = c.active;
      ring.position.set(c.pos.x, 0.04, c.pos.z);
    }
    for (const id of ["coin", "key", "hat"] as const) {
      const it = view.items[id];
      this.items[id].visible = it.visible;
      if (id === "hat" && view.hatAttachedToDuck && this.duckHatSocket) {
        placeAtSocket(this.items.hat, this.duckHatSocket);
        continue;
      }
      const shift = id === "hat" && view.hatAttachedToDuck ? duckShift : { x: 0, z: 0 };
      this.items[id].position.set(it.pos.x + shift.x, it.pos.y, it.pos.z + shift.z);
      this.items[id].quaternion.identity();
    }
    this.doorBlocker.visible = view.saunaDoorLocked;
    this.camera.position.set(pose.eye.x, pose.eye.y, pose.eye.z);
    this.camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
    this.camera.updateMatrixWorld();
    this.sizeLabels(view.active);
    this.renderer.render(this.scene, this.camera);
  }
}
