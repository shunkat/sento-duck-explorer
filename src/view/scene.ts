// Static level and fallback primitives, with pipeline-produced character/item
// models following the view each frame. Gameplay state remains in core.
import * as THREE from "three";
import type { CharacterId, HighDoorId, HumanId, MilkId } from "../core/types";
import { CHARACTER_RADIUS, type DecorKind, type FixtureKind, GROWTH_DECOR_KINDS, GROWTH_FIXTURE_KINDS, isStreetFixture, type Level } from "../level/layout";
import type { AABB } from "../sim/geometry";
import type { Pose } from "./camera";
import { BODY_HEIGHT, type Vec3, type View } from "./deriveView";
import type { ModelLibrary } from "./models";
import { GUARDIAN_MODEL_ID } from "./modelEntry";
import { EnvironmentModels } from "./environmentModels";
import { createEnvironmentLight } from "./environmentLight";
import { WorldEnvironment } from "./worldEnvironment";
import { SENTO_BACKGROUND_COLOR, WaterAppearance } from "./waterAppearance";
import { batchOpaqueMeshes } from "./staticMeshes";
import { applyOutfit, checkHumanContract, type Clothing, TOWEL_DEPTH, TOWEL_THICKNESS, TOWEL_WIDTH, headAnchor, towelPose } from "./humanModel";
import { bindHumanMotion, type HumanMotion } from "./humanMotion";
import { CEILING_Y, type FacingTracker, HOLE_LID_Y, bodyOpacity, modelRotationY, WALL_HEIGHT } from "./shoulder";
import { createSentoSigns } from "./signs";
import { effectivePixelRatio, DESKTOP_PIXEL_RATIO_CAP } from "./renderQuality";
import { TargetFeedback } from "./targetFeedback";
import type { InteractTarget } from "../core/actions";
import type { Margin, PromptPlace } from "./targetPlacement";

const ZONE_COLORS: Record<string, number> = {
  bath: 0x6fa8dc, bathwater: 0x2f6fb3, splash: 0x9fc5e8, narrow_hole: 0x8e7cc3,
  changing: 0xf6b26b, reception: 0xe06666, common: 0xcc7755, genkan: 0x888888, street: 0x9a9a8a,
  sauna_entry: 0xb45f06, sauna_crowd: 0x8a4a12, open_air: 0x93c47d,
  pond_entrance: 0x6aa84f, pond: 0x2f7f8f,
  kids_pool: 0x7fb7e0, kids_passage: 0x9fc5e8, kids_room: 0xb7d7f0,
};
/** Zones with a ceiling in the shoulder view (hidden in the overview). */
const INDOOR = new Set(["reception", "common", "genkan", "changing", "bath", "sauna_entry", "sauna_crowd"]);

/** Provisional fixture colours (placeholders, not final assets). */
const FIXTURE_COLORS: Record<FixtureKind, number> = {
  screen: 0xd9c9a8, locker: 0xff9900, shoeLocker: 0xb08850, bench: 0x9b6b3d, desk: 0x8b5a2b, shelf: 0x6b4a2b,
  stool: 0xf2f2f2, basin: 0x9ab8c8, plunge: 0x9ab8c8, outdoorBath: 0x7b7f78, heater: 0x4a4a4a,
  holeSide: 0xd8d0e8, hedge: 0x3f7a3a, fence: 0x9c7b55, pondEdge: 0x8a8f86, rock: 0x8a8f86, shrub: 0x4f8a45,
  step: 0xc9a46a, staff: 0x2f4f6f, partition: 0xd9c9a8, storage: 0xb08850, curb: 0xc9c2b0,
};
const DECOR_COLORS: Record<DecorKind, number> = {
  mat: 0x6b8fb8, border: 0xdfe6ea, mirror: 0xcfe3f0, tap: 0xb0b0b0, bucket: 0xe8c547, shelf: 0xdfe6ea,
  shower: 0xb0b0b0, curtain: 0x2a3f7a, deck: 0xa07850, stone: 0xb0aca0, norenMen: 0x2c5aa0, norenWomen: 0xc0392b,
  poolEdge: 0xdfe6ea, threshold: 0xb0aca0,
};
/** Wall height while the overview shows the map as a cutaway. */
const OVERVIEW_WALL_HEIGHT = 1.0;

/** Seconds of the ring pulse that marks a growth. */
const GROWTH_CUE_SECONDS = 0.6;

const CHAR_COLORS: Record<CharacterId, number> = { duck: 0xffe033, child: 0x3fa0ff, adult: 0x3fc76a };

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

/** Fade model meshes; rebuild the shader at the opaque boundary. */
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
  private items = {} as Record<MilkId, THREE.Object3D>;
  /** High-handle doors (closed: drawn), provisional shapes. */
  private highDoors = {} as Record<HighDoorId, THREE.Object3D>;
  private guardian = new THREE.Group();
  private guardianCapsule!: THREE.Mesh;
  private guardianModel: THREE.Object3D | null = null;
  /** Growth-route primitives (partitions, storage, curb, doors); hidden when the export draws them. */
  private growthFallback = new THREE.Group();
  private growthCueUntil = -Infinity;
  private signs = new THREE.Group();
  /** Full-height walls, cut down in the overview. */
  /** Meshes cut down to OVERVIEW_WALL_HEIGHT in the overview, with their own full height. */
  private tallWalls: { mesh: THREE.Mesh; height: number }[] = [];
  /** Ceilings and the NarrowHole lintel, hidden in the overview. */
  private roofs: THREE.Object3D[] = [];
  /** Primitive meshes per character; hidden when a model replaces them. */
  private primitives = {} as Record<CharacterId, THREE.Object3D[]>;
  private models: Partial<Record<CharacterId, THREE.Object3D>> = {};
  private itemModels: Partial<Record<MilkId, THREE.Object3D>> = {};
  /** Provisional towels of the two humans. */
  private towels = {} as Record<HumanId, THREE.Object3D>;
  private towelAttempted?: THREE.Object3D;
  /** Head top in group space and the live right-hand socket of a human model. */
  private humanBody: Partial<Record<HumanId, { headTop: number; handSocket?: THREE.Object3D }>> = {};
  private humanMotion: Partial<Record<HumanId, HumanMotion>> = {};
  /** Last ClothingState seen per human (the game starts in the bath). */
  private clothing: Record<"child" | "adult", Clothing> = { child: "unclothed", adult: "unclothed" };
  private tmp = new THREE.Vector3();
  private feedback = new TargetFeedback(this.scene);
  private pixelRatioCap = DESKTOP_PIXEL_RATIO_CAP;

  constructor(container: HTMLElement, level: Level) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(effectivePixelRatio(window.devicePixelRatio, this.pixelRatioCap));
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
    // Real wall notices are independent of the optional control help.
    this.signs = createSentoSigns(level);
    this.scene.add(this.signs);

    // Floors keep their materials; places are identified by the architecture and signs.
    for (const z of [...level.zones].reverse()) {
      const sub = z.id === "bathwater" || z.id === "splash" || z.id === "narrow_hole";
      // Water and state overlays remain independent from the authored solid floors.
      const surfaceParent = ["bathwater", "narrow_hole", "pond", "splash"].includes(z.id)
        ? this.scene : this.environmentFallback;
      const opacity = sub ? 0.9 : 0.75;
      const water = z.id === "pond" ? "pond" : z.id === "bathwater" || z.id === "narrow_hole" ? "bath" : null;
      // Splash/goal overlays retain their existing semantic colors and alpha.
      surfaceParent.add(boxMesh(z.box, 0.02, sub ? 0.012 : 0, ZONE_COLORS[z.id] ?? 0xffffff, opacity,
        water ? this.waterAppearance.material(water, opacity) : undefined));
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
      if (GROWTH_FIXTURE_KINDS.has(f.kind) || isStreetFixture(f)) this.growthFallback.add(fm);
      else if (f.kind === "stool") this.scene.add(fm);
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
      // Receptionist (provisional): the fixture box is the body; add a head.
      if (f.kind === "staff") {
        const hx = (f.box.maxX - f.box.minX) / 4;
        const hz = (f.box.maxZ - f.box.minZ) / 4;
        staticSurfaces.push(boxMesh({ minX: f.box.minX + hx, minZ: f.box.minZ + hz, maxX: f.box.maxX - hx, maxZ: f.box.maxZ - hz }, 0.25, f.height, 0xf1c9a5));
      }
    }
    for (const d of level.decor) {
      const dm = boxMesh(d.box, d.height, d.y0, DECOR_COLORS[d.kind], d.kind === "mirror" ? 0.85 : 1);
      if (GROWTH_DECOR_KINDS.has(d.kind)) this.growthFallback.add(dm);
      else if (d.kind === "bucket") this.scene.add(dm);
      else if (d.kind === "mirror") this.environmentFallback.add(dm);
      else staticSurfaces.push(dm);
      if (d.kind === "bucket") this.environmentModels.register("wash_basin", dm, d.box, d.y0, d.height);
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

    // High-handle doors (provisional shapes, always drawn over the authored world while closed).
    for (const id of ["kidsGate", "frontExit"] as const) {
      const d = level.highDoors[id];
      const g = new THREE.Group();
      const leafH = id === "frontExit" ? 2.2 : d.handleY + 0.1;
      g.add(boxMesh(d.blocker, leafH, 0, 0x8b5a2b));
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.14), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.6, roughness: 0.3 }));
      handle.position.set(d.handle.x, d.handleY, d.handle.z);
      g.add(handle);
      this.growthFallback.add(g);
      this.highDoors[id] = g;
    }

    this.growthFallback.name = "growth_fallback";
    this.scene.add(this.growthFallback);

    // Guardian (non-player adult who watches the Child): provisional primitive.
    const gBody = new THREE.Mesh(new THREE.CapsuleGeometry(CHARACTER_RADIUS.adult, BODY_HEIGHT.adult - 2 * CHARACTER_RADIUS.adult, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x8e6fd8 }));
    this.guardian.add(gBody);
    this.guardianCapsule = gBody;
    this.scene.add(this.guardian);
    for (const soap of level.soaps) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.18), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      m.position.set(soap.pos.x, 0.05, soap.pos.z);
      this.scene.add(m);
      this.environmentModels.register("soap", m, { minX: soap.pos.x - 0.15, maxX: soap.pos.x + 0.15,
        minZ: soap.pos.z - 0.09, maxZ: soap.pos.z + 0.09 }, 0.01, 0.08);
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

    // Milk bottles: the final GLB (models/milk_bottle.glb) replaces this primitive
    // once loaded; the primitive stays as the load-failure fallback. Group origin = bottle base.
    for (const id of ["milk1", "milk2"] as const) {
      const g = new THREE.Group();
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.17, 20), new THREE.MeshStandardMaterial({ color: 0xfbfbf5, roughness: 0.4 }));
      bottle.position.y = 0.085;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.025, 20), new THREE.MeshStandardMaterial({ color: 0x2f6fd8 }));
      cap.position.y = 0.18;
      g.add(bottle, cap);
      g.name = "milk_bottle_provisional";
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
    this.useGuardianModel(lib);
    const milk = lib.get("milk_bottle");
    if (milk) {
      for (const id of ["milk1", "milk2"] as const) {
        if (this.itemModels[id]?.userData.source !== milk.root) {
          const root = milk.root.clone(true);
          root.userData.source = milk.root;
          this.setItemModel(id, root);
        }
      }
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
      this.humanBody[id] = {
        headTop: headAnchor(BODY_HEIGHT[id], box.isEmpty() ? undefined : box.max.y),
        handSocket: root.getObjectByName("socket_hand_r"),
      };
      this.humanMotion[id] = bindHumanMotion(root, BODY_HEIGHT[id]);
    }
  }

  /**
   * The guardian uses the existing standing-bather NPC (bottom-center origin).
   * The group sits at the body center, so the clone is lowered by half the
   * Adult body height; the capsule stays as the fallback.
   */
  private useGuardianModel(lib: ModelLibrary): void {
    const source = lib.get(GUARDIAN_MODEL_ID)?.root;
    if (!source || this.guardianModel?.userData.source === source) return;
    const root = source.clone(true);
    root.userData.source = source;
    root.position.set(0, -BODY_HEIGHT.adult / 2, 0);
    this.guardianModel?.removeFromParent();
    this.guardian.add(root);
    this.guardianModel = root;
    this.guardianCapsule.visible = false;
  }

  /** Show a loaded milk bottle model instead of the primitive (origin at the base center, like the group). */
  setItemModel(id: MilkId, root: THREE.Object3D): void {
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
    // These signs are mounted on upper walls, which are cut away in the overview.
    this.signs.visible = !on;
  }

  /** Presentation only: CSS size, physics and rules are untouched. */
  setPixelRatioCap(cap: number): void {
    this.pixelRatioCap = cap;
  }
  /** `w`/`h` are the actual CSS size of the canvas container. */
  resize(w: number, h: number): void {
    w = Math.max(1, w);
    h = Math.max(1, h);
    this.renderer.setPixelRatio(effectivePixelRatio(window.devicePixelRatio, this.pixelRatioCap));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Start the short ring pulse that marks a growth. */
  growthCue(timeSeconds: number): void {
    this.growthCueUntil = timeSeconds + GROWTH_CUE_SECONDS;
  }

  /** Place the one visible body (the current stage) before computing the camera. */
  positionCharacters(view: View, timeSeconds: number, facing: FacingTracker): Vec3 {
    this.waterAppearance.update(timeSeconds);
    const pulse = Math.max(0, this.growthCueUntil - timeSeconds) / GROWTH_CUE_SECONDS;
    for (const id of ["duck", "child", "adult"] as const) {
      const c = view.characters[id];
      let y = c.pos.y;
      if (id === "duck") y += Math.sin(timeSeconds * 3) * 0.015; // gentle bobbing
      this.chars[id].visible = c.visible;
      this.chars[id].position.set(c.pos.x, y, c.pos.z);
      this.chars[id].rotation.y = modelRotationY(facing.yaw(id));
      if (id !== "duck") {
        // Growth has one player body. Hidden stages must not accumulate a
        // stride from another body's movement or appear already mid-step.
        if (c.visible) this.humanMotion[id]?.update({ position: c.pos, time: timeSeconds,
          holdRight: c.towel === "held" });
        else this.humanMotion[id]?.reset();
        if (c.towel) {
          const body = this.humanBody[id];
          // Read after posing: a cached rest hand leaves the towel floating
          // when the arm moves or a rig's rest posture changes.
          const hand = body?.handSocket
            ? this.tmp.setFromMatrixPosition(relativeMatrix(body.handSocket, this.chars[id])) : undefined;
          const bob = (this.models[id]?.position.y ?? -c.height / 2) + c.height / 2;
          const t = towelPose(c.towel, { height: c.height, radius: c.radius,
            headTop: body ? body.headTop + bob : undefined, hand });
          this.towels[id].position.set(t.x, t.y, t.z);
          this.towels[id].rotation.set(t.rotX, 0, 0);
        }
      }
      if (id !== "duck" && this.clothing[id] !== c.clothing) {
        this.clothing[id] = c.clothing;
        const m = this.models[id];
        if (m) applyOutfit(m, c.clothing);
      }
      const ring = this.rings[id];
      ring.visible = c.active;
      ring.position.set(c.pos.x, 0.04, c.pos.z);
      ring.scale.setScalar(1 + 2.5 * pulse);
    }
    this.guardian.position.set(view.guardian.x, view.guardian.y, view.guardian.z);
    const focus = this.chars[view.active].position;
    return { x: focus.x, y: focus.y, z: focus.z };
  }

  /**
   * Draw one frame. `feedback` is the E target (null for none) with the
   * obstacles used to decide whether its text is visible; it returns where the
   * prompt should be shown ("world", compact "hud", or "none").
   */
  render(view: View, pose: Pose, overview: boolean, feedback?: { target: InteractTarget | null; enabled: boolean; margin: Margin }): PromptPlace {
    this.setOverview(overview);
    const act = this.chars[view.active].position;
    for (const id of ["duck", "child", "adult"] as const) {
      const c = view.characters[id];
      const fade = overview ? 1 : c.active ? (pose.activeBodyOpacity ?? 1)
        : bodyOpacity(pose.eye, act, this.chars[id].position, c.radius);
      setBodyOpacity(this.chars[id], fade);
    }
    for (const id of ["milk1", "milk2"] as const) {
      const it = view.milk[id];
      this.items[id].visible = it.visible;
      this.items[id].position.set(it.pos.x, it.pos.y, it.pos.z);
    }
    for (const id of ["kidsGate", "frontExit"] as const) this.highDoors[id].visible = !view.doorsOpen[id];
    // The sauna is never locked in the growth version: hide the authored closed door.
    this.worldEnvironment.setView(overview, false, view.doorsOpen);
    this.growthFallback.visible = !this.worldEnvironment.hasGrowthDoors;
    const fov = overview ? 55 : (pose.fov ?? 55);
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.set(pose.eye.x, pose.eye.y, pose.eye.z);
    this.camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
    this.environmentModels.updateDetail(this.camera.position, overview);
    this.worldEnvironment.updateDetail(this.camera.position);
    this.camera.updateMatrixWorld();
    let place: PromptPlace = "none";
    if (feedback && !overview) {
      const size = this.renderer.getSize(this.size);
      place = this.feedback.update(feedback.target, feedback.enabled, this.camera, { w: size.x, h: size.y }, feedback.margin);
    } else this.feedback.hide();
    this.renderer.render(this.scene, this.camera);
    return place;
  }
  private size = new THREE.Vector2();
  /** Remove the target outline and text at once and redraw the last frame (help turned off while paused). */
  hideFeedback(): void {
    this.feedback.hide();
    this.renderer.render(this.scene, this.camera);
  }
}
