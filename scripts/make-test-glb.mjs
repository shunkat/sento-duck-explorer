// Writes tests/fixtures/test_box_duck.glb: a 0.30 m box with the four socket
// nodes. A TEST FIXTURE for the ModelAdapter, not a final asset (no ledger row).
// Usage: node scripts/make-test-glb.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const W = 0.3, H = 0.3;
const x = W / 2;
const positions = [];
const indices = [];
const faces = [
  [[1, 0, 0], [[x, 0, -x], [x, H, -x], [x, H, x], [x, 0, x]]],
  [[-1, 0, 0], [[-x, 0, x], [-x, H, x], [-x, H, -x], [-x, 0, -x]]],
  [[0, 1, 0], [[-x, H, x], [x, H, x], [x, H, -x], [-x, H, -x]]],
  [[0, -1, 0], [[-x, 0, -x], [x, 0, -x], [x, 0, x], [-x, 0, x]]],
  [[0, 0, 1], [[-x, 0, x], [x, 0, x], [x, H, x], [-x, H, x]]],
  [[0, 0, -1], [[x, 0, -x], [-x, 0, -x], [-x, H, -x], [x, H, -x]]],
];
const normals = [];
for (const [n, quad] of faces) {
  const base = positions.length / 3;
  for (const p of quad) { positions.push(...p); normals.push(...n); }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

const posBytes = Buffer.alloc(positions.length * 4);
positions.forEach((v, i) => posBytes.writeFloatLE(v, i * 4));
const nrmBytes = Buffer.alloc(normals.length * 4);
normals.forEach((v, i) => nrmBytes.writeFloatLE(v, i * 4));
const idxBytes = Buffer.alloc(indices.length * 2);
indices.forEach((v, i) => idxBytes.writeUInt16LE(v, i * 2));
const pad4 = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
const bin = Buffer.concat([pad4(posBytes), pad4(nrmBytes), pad4(idxBytes)]);

const sockets = {
  socket_hat: [0, 0.28, 0.03],
  socket_label: [0, 0.35, 0],
  socket_carry: [0, 0.9, 0.22],
  socket_hand_r: [0.12, 0.15, 0.05],
};
const nodes = [
  { name: "test_box_duck", children: [1, 2, 3, 4, 5] },
  { name: "body", mesh: 0 },
  ...Object.entries(sockets).map(([name, translation]) => ({ name, translation })),
];
const gltf = {
  asset: { version: "2.0", generator: "scripts/make-test-glb.mjs (test fixture)" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes,
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
  materials: [{ name: "fixture", pbrMetallicRoughness: { baseColorFactor: [1, 0.88, 0.2, 1], metallicFactor: 0, roughnessFactor: 0.8 } }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: positions.length / 3, type: "VEC3", min: [-x, 0, -x], max: [x, H, x] },
    { bufferView: 1, componentType: 5126, count: normals.length / 3, type: "VEC3" },
    { bufferView: 2, componentType: 5123, count: indices.length, type: "SCALAR" },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: posBytes.length },
    { buffer: 0, byteOffset: pad4(posBytes).length, byteLength: nrmBytes.length },
    { buffer: 0, byteOffset: pad4(posBytes).length + pad4(nrmBytes).length, byteLength: idxBytes.length },
  ],
  buffers: [{ byteLength: bin.length }],
};
let json = Buffer.from(JSON.stringify(gltf));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.write("glTF", 0, "ascii");
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const chunk = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.write(type, 4, "ascii"); return b; };
const glb = Buffer.concat([header, chunk(json.length, "JSON"), json, chunk(bin.length, "BIN\0"), bin]);
mkdirSync("tests/fixtures", { recursive: true });
writeFileSync("tests/fixtures/test_box_duck.glb", glb);
console.log(`wrote tests/fixtures/test_box_duck.glb (${glb.length} bytes)`);
