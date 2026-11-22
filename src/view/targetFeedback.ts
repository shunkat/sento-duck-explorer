// In-world feedback for the one available E target: a ring outline and a short
// text sprite. Both use ordinary depth testing, so a wall in front hides them.
import * as THREE from "three";
import type { InteractTarget } from "../core/actions";
import type { Vec3 } from "./deriveView";
import { labelWorldHeight } from "./labels";
import { lineBlocked, occluders } from "./occlusion";
import { choosePromptPlace, labelRect, type Margin, ndcToScreen, type PromptPlace } from "./targetPlacement";
const TEXT_PX = 17;
const FONT_PX = 40;
const PAD_PX = 14;
const RING_COLOR = 0xffe27a;
export class TargetFeedback {
  // Created on first use and removed from the scene while there is no target,
  // so the scene holds no floating label when nothing can be used.
  private ring: THREE.Mesh | null = null;
  private sprite: THREE.Sprite | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private texture: THREE.CanvasTexture | null = null;
  private shownLabel = "";
  private aspect = 4;
  private ndc = new THREE.Vector3();
  private blockers: THREE.Mesh[] = [];
  private frames = 0;
  private lastTarget = "";
  private lastBlocked = false;
  constructor(private scene: THREE.Scene) {}
  private ensure(): { ring: THREE.Mesh; sprite: THREE.Sprite } {
    if (!this.ring || !this.sprite) {
      this.ring = new THREE.Mesh(
        new THREE.RingGeometry(0.26, 0.33, 40),
        new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: true, depthWrite: false }),
      );
      this.canvas = document.createElement("canvas");
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthTest: true, depthWrite: false }));
      this.sprite.renderOrder = 10;
    }
    if (!this.ring.parent) this.scene.add(this.ring);
    if (!this.sprite.parent) this.scene.add(this.sprite);
    return { ring: this.ring, sprite: this.sprite };
  }
  private draw(label: string): void {
    if (label === this.shownLabel) return;
    this.shownLabel = label;
    const c = this.canvas!;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.font = `700 ${FONT_PX}px system-ui, "Hiragino Sans", sans-serif`;
    const w = Math.ceil(ctx.measureText(label).width) + PAD_PX * 2;
    const h = FONT_PX + PAD_PX;
    c.width = w;
    c.height = h;
    ctx.font = `700 ${FONT_PX}px system-ui, "Hiragino Sans", sans-serif`;
    // An outlined caption stays readable without suggesting a clickable button.
    ctx.strokeStyle = "#071719";
    ctx.lineWidth = 6;
    ctx.lineJoin = "round";
    ctx.textBaseline = "middle";
    ctx.strokeText(label, PAD_PX, h / 2 + 1);
    ctx.fillStyle = "#fff6c8";
    ctx.fillText(label, PAD_PX, h / 2 + 1);
    this.aspect = w / h;
    this.texture!.needsUpdate = true;
  }
  /** Hide everything (help off, no target, overview). */
  hide(): void {
    this.ring?.removeFromParent();
    this.sprite?.removeFromParent();
  }
  /**
   * Place the outline and text for `target`, after the camera matrices are
   * current. Returns where the prompt should live this frame.
   */
  update(target: InteractTarget | null, enabled: boolean, camera: THREE.PerspectiveCamera, viewport: { w: number; h: number },
    margin: Margin): PromptPlace {
    if (!enabled || !target) {
      this.hide();
      return "none";
    }
    const p: Vec3 = { x: target.pos.x, y: target.y, z: target.pos.z };
    // Outline: floor ring for floor targets, an upright ring at a door handle.
    const { ring, sprite } = this.ensure();
    const upright = target.kind === "highDoor" || target.kind === "dry";
    if (upright) {
      ring.position.set(p.x, target.kind === "highDoor" ? p.y : 1.0, p.z);
      ring.lookAt(camera.position.x, ring.position.y, camera.position.z);
    } else {
      ring.position.set(p.x, 0.05, p.z);
      ring.rotation.set(-Math.PI / 2, 0, 0);
    }
    this.draw(target.label);
    const at = new THREE.Vector3(p.x, p.y + 0.25, p.z);
    const hWorld = labelWorldHeight(TEXT_PX, at, camera, viewport.h);
    this.ndc.copy(at).project(camera);
    const s = ndcToScreen(this.ndc, viewport);
    const wPx = TEXT_PX * this.aspect;
    const rect = hWorld === null ? null : labelRect(s, wPx, TEXT_PX, 0);
    const eye = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    // The scene walk is repeated every third frame (and at once for a new target); the ray is cheap.
    const key = `${target.kind}:${target.id}`;
    if (key !== this.lastTarget || this.frames++ % 3 === 0) {
      this.lastTarget = key;
      this.blockers = occluders(this.scene, [ring, sprite]);
    }
    this.lastBlocked = lineBlocked(this.blockers, eye, at);
    const place = choosePromptPlace({ enabled, hasTarget: true, inFront: hWorld !== null && s.inFront, sight: !this.lastBlocked, rect, viewport, margin });
    sprite.visible = place === "world";
    if (hWorld !== null) {
      sprite.scale.set(hWorld * this.aspect, hWorld, 1);
      sprite.center.set(0.5, 0);
      sprite.position.copy(at);
    }
    return place;
  }
}
