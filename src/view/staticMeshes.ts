// Batch explicitly owned, opaque surfaces. Callers keep moving, replaceable or
// independently hidden objects out of these lists; no scene traversal guesses.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export function batchOpaqueMeshes(meshes: readonly THREE.Mesh[], origin = new THREE.Vector3()): THREE.Mesh[] {
  const batches = new Map<string, THREE.Mesh[]>();
  const separate: THREE.Mesh[] = [];
  for (const mesh of meshes) {
    const material = mesh.material;
    // Sources must still be unattached: transforms are in the caller's common
    // parent space, and the helper never reparents an existing scene object.
    if (!(material instanceof THREE.MeshStandardMaterial) || material.transparent || material.opacity !== 1 ||
        mesh.parent || mesh.children.length || !mesh.visible) {
      separate.push(mesh);
      continue;
    }
    const { uuid: _uuid, metadata: _metadata, name: _name, ...properties } = material.toJSON();
    const key = JSON.stringify([properties, mesh.castShadow, mesh.receiveShadow, mesh.renderOrder, mesh.layers.mask, mesh.frustumCulled]);
    const group = batches.get(key) ?? [];
    group.push(mesh);
    batches.set(key, group);
  }
  const offset = new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z);
  for (const sources of batches.values()) {
    if (sources.length === 1) {
      separate.push(sources[0]!);
      continue;
    }
    const geometries = sources.map(mesh => {
      mesh.updateMatrix();
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(offset, mesh.matrix));
      geometry.clearGroups();
      return geometry;
    });
    const geometry = mergeGeometries(geometries, false);
    for (const part of geometries) part.dispose();
    if (!geometry) {
      separate.push(...sources);
      continue;
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const first = sources[0]!;
    const mesh = new THREE.Mesh(geometry, first.material);
    mesh.name = "opaque_surface_batch";
    mesh.position.copy(origin);
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    mesh.layers.mask = first.layers.mask;
    mesh.frustumCulled = first.frustumCulled;
    separate.push(mesh);
  }
  return separate;
}
