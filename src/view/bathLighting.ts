import * as THREE from "three";
import type { Level } from "../level/layout";
import { containsPoint, type AABB } from "../sim/geometry";
import type { View } from "./deriveView";

/** The first finished area: the main bath and the adjacent washing row. */
export const BATH_FINISH_BOUNDS: AABB = { minX: 4.0, minZ: -.25, maxX: 12.25, maxZ: 9.25 };

function contactTexture(): THREE.DataTexture {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1);
    const alpha = Math.pow(Math.max(0, 1 - radius), 2);
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = Math.round(alpha * 255);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function windowTexture(): THREE.DataTexture {
  const width = 128, height = 32, data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const frame = x < 2 || x >= width - 2 || y < 2 || y >= height - 2 || x % 32 < 2;
    const light = frame ? .30 : .82 + .10 * y / height;
    const i = (y * width + x) * 4;
    data[i] = Math.round(255 * light * .96);
    data[i + 1] = Math.round(255 * light);
    data[i + 2] = Math.round(255 * Math.min(1, light * 1.02));
    data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Small presentation meshes and local lights; no shadow-map render passes.
 * Contact patches approximate soft occlusion, not physically traced shadows.
 * All surfaces remain outside collision, interaction and level data.
 */
export class BathLighting {
  readonly root = new THREE.Group();
  private fixtures = new THREE.Group();
  private contacts = new THREE.Group();
  private geometry = new THREE.PlaneGeometry(1, 1);
  private texture = contactTexture();
  private windowTexture = windowTexture();
  private shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x122529, map: this.texture, transparent: true, opacity: .36,
    depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  private panelMaterial = new THREE.MeshBasicMaterial({ color: 0xffedcc, toneMapped: false });
  private frameMaterial = new THREE.MeshStandardMaterial({ color: 0x74746d, metalness: .4, roughness: .45 });
  private windowMaterial = new THREE.MeshBasicMaterial({ map: this.windowTexture, toneMapped: false });
  private playerContact = this.contact("player_contact", .72, .54);
  private guardianContact = this.contact("guardian_contact", .78, .58);
  private water: readonly AABB[];

  constructor(private level: Level) {
    this.root.name = "sento_bath_lighting";
    this.fixtures.name = "bath_ceiling_lights";
    this.contacts.name = "bath_contact_shading";
    this.water = [...level.duckWater, ...level.zones.filter(z => z.id === "pond").map(z => z.box)];
    this.root.add(this.fixtures, this.contacts);
    // A flush frosted clerestory on the solid east-wall band, above the passage.
    const window = new THREE.Mesh(this.geometry, this.windowMaterial);
    window.name = "bath_frosted_window";
    window.position.set(11.895, 2.12, 4.65);
    window.rotation.y = -Math.PI / 2;
    window.scale.set(2.3, .56, 1);
    this.fixtures.add(window);
    for (const [x, z, intensity] of [[7.5, 2.5, 5.5], [7.8, 6.8, 4]] as const) {
      // Flush ceiling fixtures agree with the local light positions.
      const frame = new THREE.Mesh(this.geometry, this.frameMaterial);
      frame.position.set(x, 2.679, z); frame.rotation.x = Math.PI / 2;
      frame.scale.set(1.55, .32, 1);
      const panel = new THREE.Mesh(this.geometry, this.panelMaterial);
      panel.position.set(x, 2.675, z); panel.rotation.x = Math.PI / 2;
      panel.scale.set(1.45, .22, 1);
      this.fixtures.add(frame, panel);
      const light = new THREE.PointLight(0xffebd0, intensity, 4.8, 2);
      light.name = "bath_warm_fill";
      light.position.set(x, 2.48, z);
      this.root.add(light);
    }
    for (const fixture of level.fixtures) {
      if (fixture.kind !== "stool") continue;
      const x = (fixture.box.minX + fixture.box.maxX) / 2;
      const z = (fixture.box.minZ + fixture.box.maxZ) / 2;
      if (!containsPoint(BATH_FINISH_BOUNDS, { x, z })) continue;
      const patch = this.contact("stool_contact", .65, .6);
      patch.position.set(x, .024, z);
      this.contacts.add(patch);
    }
    this.contacts.add(this.playerContact, this.guardianContact);
    this.playerContact.visible = this.guardianContact.visible = false;
  }

  private contact(name: string, width: number, depth: number): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry, this.shadowMaterial);
    mesh.name = name;
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(width, depth, 1);
    return mesh;
  }

  private onDryFloor(x: number, z: number, radius: number): boolean {
    if (!containsPoint(BATH_FINISH_BOUNDS, { x, z }) || x >= 11.9 || z <= .1 || z >= 8.9) return false;
    // Hide before a patch reaches a pool edge; it must never float over water.
    return !this.water.some(b => x + radius > b.minX && x - radius < b.maxX &&
      z + radius > b.minZ && z - radius < b.maxZ);
  }

  update(view: View, overview: boolean): void {
    this.fixtures.visible = !overview;
    const player = view.characters[view.active];
    this.playerContact.visible = player.visible && view.active !== "duck" &&
      this.onDryFloor(player.pos.x, player.pos.z, .36);
    this.playerContact.position.set(player.pos.x, .024, player.pos.z);
    this.guardianContact.visible = this.onDryFloor(view.guardian.x, view.guardian.z, .39);
    this.guardianContact.position.set(view.guardian.x, .024, view.guardian.z);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.geometry.dispose(); this.texture.dispose(); this.windowTexture.dispose();
    this.shadowMaterial.dispose(); this.panelMaterial.dispose(); this.frameMaterial.dispose(); this.windowMaterial.dispose();
  }
}
