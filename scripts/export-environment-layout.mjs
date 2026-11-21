// Export authoritative placement data for Blender without copying game rules.
// Usage: node scripts/export-environment-layout.mjs [output.json]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { build } from 'rolldown';

const root = process.cwd();
const bundled = await build({ input: 'src/level/layout.ts', platform: 'node',
  write: false, output: { format: 'esm' } });
const chunks = bundled.output.filter(item => item.type === 'chunk');
if (chunks.length !== 1 || chunks[0].imports.length) throw new Error('Expected a self-contained level module');
const { LEVEL } = await import(`data:text/javascript;base64,${Buffer.from(chunks[0].code).toString('base64')}`);
const fixtureBoxes = new Set(LEVEL.fixtures.map(f => f.box));
const placement = {
  zones: LEVEL.zones,
  structural_walls: LEVEL.walls.filter(b => !fixtureBoxes.has(b)),
  fixtures: LEVEL.fixtures,
  decor: LEVEL.decor,
  npcs: LEVEL.npcs,
  crowdGaps: LEVEL.crowdGaps,
  narrowHole: LEVEL.narrowHole,
  duckWater: LEVEL.duckWater,
  saunaDoorBlocker: LEVEL.saunaDoorBlocker,
  doors: LEVEL.doors,
  nodes: LEVEL.nodes,
};
const digest = (data) => crypto.createHash('sha256').update(data).digest('hex');
const out = {
  convention: 'meters; game X right, Y up, Z down the map; world-space placement',
  layout_sha256: digest(JSON.stringify(placement)),
  source_files: Object.fromEntries(['src/level/layout.ts', 'src/sim/geometry.ts'].map(file =>
    [file, digest(fs.readFileSync(path.join(root, file)))])),
  ...placement,
};
const destination = process.argv[2] ?? '.local/environment-refresh/layout.json';
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ layout_sha256: out.layout_sha256,
  walls: out.structural_walls.length, fixtures: out.fixtures.length,
  decor: out.decor.length, npcs: out.npcs.length }));
