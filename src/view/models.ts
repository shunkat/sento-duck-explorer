// ModelAdapter (view layer): GLB loading, socket lookup, and primitive fallback.
// See .kiro/specs/final-assets/design.md. No game logic lives here.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const SOCKET_NAMES = ["socket_hat", "socket_label", "socket_carry", "socket_hand_r"] as const;
export type SocketName = (typeof SOCKET_NAMES)[number];

export interface LoadedModel {
  root: THREE.Object3D;
  sockets: Partial<Record<SocketName, THREE.Object3D>>;
}

/** The part of GLTFLoader that ModelLibrary uses (replaceable in tests). */
export interface GltfSource {
  loadAsync(url: string): Promise<{ scene: THREE.Object3D }>;
  parseAsync(data: ArrayBuffer, path: string): Promise<{ scene: THREE.Object3D }>;
}

export function findSockets(root: THREE.Object3D): Partial<Record<SocketName, THREE.Object3D>> {
  const sockets: Partial<Record<SocketName, THREE.Object3D>> = {};
  for (const name of SOCKET_NAMES) {
    const node = root.getObjectByName(name);
    if (node) sockets[name] = node;
  }
  return sockets;
}

export class ModelLibrary {
  private models = new Map<string, LoadedModel>();
  private source: GltfSource;

  constructor(source: GltfSource = new GLTFLoader()) {
    this.source = source;
  }

  /** Loads a GLB. On any error the id stays unloaded, a warning is logged, and the caller keeps its primitive (Req 9.4). */
  async load(id: string, url: string): Promise<void> {
    try {
      this.store(id, (await this.source.loadAsync(url)).scene);
    } catch (e) {
      console.warn(`ModelLibrary: could not load "${id}" from ${url}; using the primitive.`, e);
    }
  }

  /** Same as load, from bytes already in memory (no network, no WebGL). */
  async parse(id: string, data: ArrayBuffer): Promise<void> {
    try {
      this.store(id, (await this.source.parseAsync(data, "")).scene);
    } catch (e) {
      console.warn(`ModelLibrary: could not parse "${id}"; using the primitive.`, e);
    }
  }

  /** null means "use the primitive". */
  get(id: string): LoadedModel | null {
    return this.models.get(id) ?? null;
  }

  private store(id: string, root: THREE.Object3D): void {
    this.models.set(id, { root, sockets: findSockets(root) });
  }
}

export interface Measured {
  height: number;
  maxWidth: number;
}

/** Bounds of a model in its own space (meters). */
export function measureModel(root: THREE.Object3D): Measured {
  root.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  return { height: size.y, maxWidth: Math.max(size.x, size.z) };
}

/** Manifest `limits` entries relevant to measured bounds; ranges are [min, max]. */
export interface ManifestLimits {
  height?: [number, number];
  max_width?: number;
}

/** Returns one message per violated limit; empty when the model fits the manifest. */
export function checkBounds(measured: Measured, limits: ManifestLimits, eps = 1e-6): string[] {
  const out: string[] = [];
  if (limits.height) {
    const [lo, hi] = limits.height;
    if (measured.height < lo - eps || measured.height > hi + eps) out.push(`height ${measured.height} outside [${lo}, ${hi}]`);
  }
  if (limits.max_width !== undefined && measured.maxWidth > limits.max_width + eps) {
    out.push(`max width ${measured.maxWidth} exceeds ${limits.max_width}`);
  }
  return out;
}

/**
 * Copy a socket's world pose onto `target` (a direct child of an unrotated parent such as the scene).
 * The caller must have updated the socket's world matrices. `scratch` avoids allocation.
 */
export function copySocketPose(target: THREE.Object3D, socket: THREE.Object3D, scratch: THREE.Vector3): void {
  socket.getWorldPosition(scratch);
  target.position.copy(scratch);
  socket.getWorldQuaternion(target.quaternion);
}
