#!/usr/bin/env python3
"""Measure the actual patched world GLB and recheck the eleven route openings.

node scripts/export-environment-layout.mjs .local/distinct-sento-npcs/layout.json
python3 scripts/measure-replaced-world.py

This uses the same six-plane triangle clipping as build-sento-environment.py.
It reads the original clearance AABBs, not the original intersection results.
GLB node matrices are applied directly in glTF +Y-up coordinates. The moving
sauna_door subtree is excluded from opening tests, as in the original producer.
The output is private measurement data; it does not activate assets or rewrite
historical/public records. A failed clearance is recorded and returns nonzero.
"""
import argparse
import importlib.util
import json
import math
from pathlib import Path
import sys
sys.dont_write_bytecode = True

SPEC = importlib.util.spec_from_file_location('npc_patch', Path(__file__).with_name('replace-background-npcs.py'))
PATCH = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(PATCH)
I4 = [[float(r == c) for c in range(4)] for r in range(4)]


def multiply(a, b):
    return [[sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def local_matrix(node):
    if 'matrix' in node:
        return [[node['matrix'][c*4+r] for c in range(4)] for r in range(4)]
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    sx, sy, sz = node.get('scale', [1, 1, 1])
    tx, ty, tz = node.get('translation', [0, 0, 0])
    return [[(1-2*(y*y+z*z))*sx, 2*(x*y-z*w)*sy, 2*(x*z+y*w)*sz, tx],
            [2*(x*y+z*w)*sx, (1-2*(x*x+z*z))*sy, 2*(y*z-x*w)*sz, ty],
            [2*(x*z-y*w)*sx, 2*(y*z+x*w)*sy, (1-2*(x*x+y*y))*sz, tz],
            [0, 0, 0, 1]]


def transform(matrix, xyz):
    return tuple(sum(matrix[r][k] * xyz[k] for k in range(3)) + matrix[r][3] for r in range(3))


def bounds(points):
    return [[min(v[i] for v in points) for i in range(3)],
            [max(v[i] for v in points) for i in range(3)]]


def clipped_triangle(points, lo, hi):
    poly = list(points)
    for axis in range(3):
        for bound, sign in ((lo[axis], 1), (hi[axis], -1)):
            if not poly:
                return []
            output = []
            for a, b in zip(poly, poly[1:] + poly[:1]):
                da, db = (a[axis]-bound)*sign, (b[axis]-bound)*sign
                if da >= 0:
                    output.append(a)
                if (da >= 0) != (db >= 0):
                    t = da/(da-db)
                    output.append(tuple(a[i]+(b[i]-a[i])*t for i in range(3)))
            poly = output
    return poly


def triangle_area(tri):
    a, b, c = tri
    u, v = [b[i]-a[i] for i in range(3)], [c[i]-a[i] for i in range(3)]
    cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
    return math.sqrt(sum(x*x for x in cross))*.5


def measure(world, reference_path, layout_path=None, *, expected_openings=11,
            excluded_roots=('sauna_door',)):
    glb = PATCH.Glb(world); d = glb.doc
    reference_raw = reference_path.read_bytes(); reference = json.loads(reference_raw)
    roots = [n for n in d['nodes'] if n.get('name') == 'sento_environment']
    PATCH.require(len(roots) == 1, 'Expected one world root')
    layout_sha = roots[0]['extras']['layout_sha256']
    PATCH.require(layout_sha == reference['layout_sha256'], 'Layout hash differs from reference openings')
    PATCH.require(len(reference['clearances']) == expected_openings, 'Unexpected reference opening count')
    visited, all_points, cache, slots, mesh_nodes = set(), [], [], {}, []
    near_triangles, architecture_triangles, degenerate, npc_degenerate, used_materials = 0, 0, 0, 0, set()
    degenerate_by_mesh = {}
    def visit(index, parent_matrix, door=False, slot=None):
        nonlocal near_triangles, architecture_triangles, degenerate, npc_degenerate
        PATCH.require(index not in visited, 'Node has multiple scene parents or a cycle')
        visited.add(index); node = d['nodes'][index]
        matrix = multiply(parent_matrix, local_matrix(node))
        door = door or node.get('name') in excluded_roots
        if node.get('name', '').startswith('npc_slot_'):
            slot = node['name']; slots[slot] = {'node': index, 'points': [], 'triangles': 0, 'faces': []}
        if 'mesh' in node:
            mesh_nodes.append(index)
            for primitive in d['meshes'][node['mesh']]['primitives']:
                PATCH.require(primitive.get('mode', 4) == 4, 'World has nontriangle primitives')
                points = [transform(matrix, p) for p in glb.accessor_rows(primitive['attributes']['POSITION'])]
                PATCH.require(all(all(math.isfinite(x) for x in p) for p in points), 'Nonfinite world vertex')
                all_points.extend(points)
                indices = [v[0] for v in glb.accessor_rows(primitive['indices'])]
                PATCH.require(len(indices) % 3 == 0, 'Incomplete triangle')
                count = len(indices)//3
                if slot:
                    near_triangles += count; slots[slot]['points'].extend(points); slots[slot]['triangles'] += count
                else:
                    architecture_triangles += count
                used_materials.add(primitive['material'])
                for start in range(0, len(indices), 3):
                    tri = [points[i] for i in indices[start:start+3]]
                    is_degenerate = triangle_area(tri) < 1e-14
                    degenerate += is_degenerate
                    npc_degenerate += is_degenerate and slot is not None
                    if is_degenerate:
                        mesh_name = d['meshes'][node['mesh']].get('name', str(node['mesh']))
                        degenerate_by_mesh[mesh_name] = degenerate_by_mesh.get(mesh_name, 0) + 1
                    if slot:
                        slots[slot]['faces'].append(tri)
                    if not door:
                        lo, hi = bounds(tri); cache.append((tri, lo, hi, node.get('name', '')))
        for child in node.get('children', []):
            visit(child, matrix, door, slot)
    for root in d['scenes'][d.get('scene', 0)]['nodes']:
        visit(root, I4)
    checks = []
    for old in reference['clearances']:
        lo, hi = old['bounds_gltf_m']; overlaps, names = 0, set()
        for tri, low, high, name in cache:
            if any(high[i] < lo[i] or low[i] > hi[i] for i in range(3)):
                continue
            if clipped_triangle(tri, lo, hi):
                overlaps += 1; names.add(name)
        checks.append({'id': old['id'], 'bounds_gltf_m': [lo, hi], 'intersecting_triangles': overlaps,
                       'intersecting_mesh_names': sorted(names)})
    measured_slots = []
    expected = {item['slot']: item for item in reference['npc_slots']}
    PATCH.require(set(slots) == set(expected) and len(slots) == 7, 'NPC slot coverage differs')
    for name, actual in slots.items():
        node = d['nodes'][actual['node']]
        entry = dict(expected[name])
        entry.update(bounds_gltf_m=bounds(actual['points']), triangles=actual['triangles'],
                     model_kind=node['extras']['npc_role'],
                     source_sha256=node['extras']['source_sha256'],
                     position_gltf_m=node.get('translation', [0, 0, 0]),
                     uniform_scale=node.get('scale', [1, 1, 1])[0])
        measured_slots.append(entry)
    seat_checks = None
    if layout_path is not None:
        layout = json.loads(layout_path.read_bytes())
        PATCH.require(layout['layout_sha256'] == layout_sha, 'Seating layout differs from world')
        seat_checks = []
        for name, actual in slots.items():
            if expected[name]['model_kind'] != 'npc_seated':
                continue
            box = layout['npcs'][int(name.rsplit('_', 1)[1])]
            x0, x1, z0, z1 = (box[k] for k in ('minX', 'maxX', 'minZ', 'maxZ'))
            slats = []
            for k in range(3):
                if x1-x0 >= z1-z0:
                    slats.append([[x0+1e-5, .34001, z0+(z1-z0)*k/3+.00801],
                                  [x1-1e-5, .40499, z0+(z1-z0)*(k+1)/3-.00801]])
                else:
                    slats.append([[x0+(x1-x0)*k/3+.00801, .34001, z0+1e-5],
                                  [x0+(x1-x0)*(k+1)/3-.00801, .40499, z1-1e-5]])
            overlap_faces = set()
            for i, tri in enumerate(actual['faces']):
                low, high = bounds(tri)
                for lo, hi in slats:
                    if any(high[axis] < lo[axis] or low[axis] > hi[axis] for axis in range(3)):
                        continue
                    if clipped_triangle(tri, lo, hi):
                        overlap_faces.add(i)
            seat_checks.append({'slot': name, 'seat_board_interiors_gltf_m': slats,
                                'intersecting_npc_triangles': len(overlap_faces)})
    return {'layout_sha256': layout_sha, 'export_sha256': PATCH.sha(glb.raw), 'export_bytes': len(glb.raw),
            'reference_measurements_sha256': PATCH.sha(reference_raw),
            'architecture_triangles': architecture_triangles, 'npc_triangles': near_triangles,
            'export_triangles': architecture_triangles+near_triangles, 'mesh_count': len(mesh_nodes),
            'materials': sorted(d['materials'][i].get('name', str(i)) for i in used_materials),
            'bounds_gltf_m': bounds(all_points), 'finite_vertices': True, 'degenerate_faces': degenerate,
            'raw_degenerate_triangles': degenerate, 'raw_degenerate_npc_triangles': npc_degenerate,
            'raw_degenerate_architecture_triangles': degenerate-npc_degenerate,
            'raw_degenerate_triangles_by_mesh': degenerate_by_mesh,
            'degenerate_measurement': 'Triangle area below 1e-14 square metres from the exact GLB positions in float64 arithmetic.',
            'npc_slots': sorted(measured_slots, key=lambda v: (v['slot'] != 'npc_slot_staff', v['slot'])),
            'seating_board_clearances': seat_checks,
            'all_seating_boards_clear': all(c['intersecting_npc_triangles'] == 0 for c in seat_checks) if seat_checks is not None else None,
            'seating_measurement': 'Actual NPC triangles clipped against the interiors of the three LEVEL-authored seat boards; top-surface contact is allowed.',
            'clearances': checks, 'all_clearances_open': all(c['intersecting_triangles'] == 0 for c in checks),
            'clearance_excluded_dynamic_roots': list(excluded_roots),
            'scope': 'Actual GLB triangle measurements; original opening AABBs reused, original intersection counts discarded; no gameplay verification.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--world', type=Path, default=Path('.local/distinct-sento-npcs/world/sento_environment.glb'))
    parser.add_argument('--reference', type=Path, default=Path('assets/sento_environment/quality/v01/measurements.json'))
    parser.add_argument('--layout', type=Path, default=Path('.local/distinct-sento-npcs/layout.json'))
    parser.add_argument('--output', type=Path, default=Path('.local/distinct-sento-npcs/world/measurements.json'))
    args = parser.parse_args()
    PATCH.require('.local' in args.output.resolve().parts, 'Measurement output must remain private')
    PATCH.require(args.output.resolve() not in {args.world.resolve(), args.reference.resolve()}, 'Cannot overwrite an input')
    report = measure(args.world, args.reference, args.layout)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ('export_sha256', 'export_triangles', 'architecture_triangles', 'npc_triangles',
                                          'degenerate_faces', 'raw_degenerate_npc_triangles', 'all_clearances_open', 'all_seating_boards_clear')}, indent=2))
    return 0 if report['all_clearances_open'] and report['all_seating_boards_clear'] and not report['raw_degenerate_npc_triangles'] else 1


if __name__ == '__main__':
    sys.exit(main())
