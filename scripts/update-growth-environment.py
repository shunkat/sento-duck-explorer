"""Prepare/apply a localized growth-route environment patch in Blender.

Plan only (ordinary Python):
  python3 scripts/update-growth-environment.py --layout path/to/layout.json --plan
Apply only after Level geometry is fixed (all output is a private candidate):
  Blender --background --python scripts/update-growth-environment.py -- \
    --layout path/to/layout.json --approved-layout-sha256 HASH --apply

The source environment is imported, never regenerated. Changed floor/wall
meshes and new architecture are exported separately. The merge helper retains
every unrelated source node, material, texture and embedded binary byte.
No registry, ledger, public GLB, source gameplay or NPC asset is written.
"""
import argparse
import hashlib
import json
import math
import runpy
import sys
from pathlib import Path

ROOT = Path.cwd()
arguments = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--layout', required=True)
parser.add_argument('--source', default='public/models/sento_environment.glb')
parser.add_argument('--base-layout', required=True, help='Level export corresponding to the reviewed source model')
parser.add_argument('--output-dir', default='.local/growth-world/candidate')
parser.add_argument('--approved-layout-sha256')
parser.add_argument('--plan', action='store_true')
parser.add_argument('--apply', action='store_true')
args = parser.parse_args(arguments)
layout_path = Path(args.layout).resolve()
source = Path(args.source).resolve()
output = Path(args.output_dir).resolve()
layout = json.loads(layout_path.read_text())
base_layout = json.loads(Path(args.base_layout).read_text())
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
helper = runpy.run_path(str(ROOT / 'scripts/merge-environment-patch.py'))
source_doc, source_binary = helper['read_glb'](source)
source_nodes = helper['unique_nodes'](source_doc)
required = ['sento_environment', 'environment_static', 'environment_upper',
            'environment_ceiling', 'sauna_door', 'environment_static__bath_floor']
assert all(name in source_nodes for name in required), 'Source is not the authored sento environment'
source_root = source_doc['nodes'][source_nodes['sento_environment']]
assert source_root['extras']['layout_sha256'] == base_layout['layout_sha256'], 'Wrong base layout for source model'
assert all(name in layout.get('highDoors', {}) for name in ('kidsGate', 'frontExit')), 'Missing dynamic door contract'
growth_fixtures = [f for f in layout['fixtures'] if f['kind'] in ('partition', 'storage', 'curb')]
new_fences = [f for f in layout['fixtures'] if f['kind'] == 'fence' and f not in base_layout['fixtures']]
assert growth_fixtures, 'No growth fixtures in Level export'
node_names = {'kidsGate': 'growth_kids_gate', 'frontExit': 'growth_front_exit'}
plan = {
    'layout_sha256': layout['layout_sha256'], 'source_sha256': sha(source),
    'operation': 'localized Blender patch; unrelated GLB bytes and source materials retained',
    'replace_floor_node': 'environment_static__bath_floor',
    'cut_source_architecture': 'water corridors below 0.65 m and dynamic door portals below 2.25 m only',
    'fixtures': growth_fixtures,
    'dynamic_nodes': {node_names[k]: {'level_key': k, **v,
                                    'upper_node': node_names[k] + '_upper',
                                    'open': 'hide root', 'overview': 'hide upper child only'}
                      for k, v in layout['highDoors'].items() if k in node_names},
    'fixed_additions': {'growth_fixed_static': 'environment_static', 'growth_fixed_upper': 'environment_upper'},
    'registry_or_public_assets_written': False,
}
if args.plan or not args.apply:
    print(json.dumps(plan, ensure_ascii=False, indent=2))
    raise SystemExit(0)
if args.approved_layout_sha256 != layout['layout_sha256']:
    raise ValueError('Pass the separately fixed Level export hash to --approved-layout-sha256')
if not output.is_relative_to(ROOT / '.local'):
    raise ValueError('Candidate output must be inside this worktree .local directory')
output.mkdir(parents=True, exist_ok=True)

import bpy
from mathutils import Vector, Matrix

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
bpy.context.view_layer.update()
world = bpy.data.objects['sento_environment']
materials = {m.name: m for m in bpy.data.materials}
before_hash = sha(source)
source_objects = {o.name: o for o in world.children_recursive if o.type == 'MESH'}


def xyz(x, y, z):
    return Vector((x, -z, y))


def game(point):
    return Vector((point.x, point.z, -point.y))


def empty(name, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    return obj


def rect(b):
    return b['minX'], b['minZ'], b['maxX'], b['maxZ']


def subtract_rectangle(a, cut):
    x0, z0, x1, z1 = a
    ca, cb, cc, cd = cut
    ca, cb, cc, cd = max(ca, x0), max(cb, z0), min(cc, x1), min(cd, z1)
    if ca >= cc or cb >= cd:
        return [a]
    return [p for p in [(x0, z0, x1, cb), (x0, cd, x1, z1), (x0, cb, ca, cd), (cc, cb, x1, cd)]
            if p[2] - p[0] > 1e-7 and p[3] - p[1] > 1e-7]


patch_root = empty('growth_patch')
fixed = empty('growth_fixed_static', patch_root)
upper = empty('growth_fixed_upper', patch_root)
additions = {fixed.name: 'environment_static', upper.name: 'environment_upper'}
replacement_names = []
changes = []


def uv_project(obj, density):
    layer = obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
    for face in obj.data.polygons:
        axis = max(range(3), key=lambda i: abs(face.normal[i]))
        axes = ((1, 2), (0, 2), (0, 1))[axis]
        for i in face.loop_indices:
            point = obj.matrix_world @ obj.data.vertices[obj.data.loops[i].vertex_index].co
            layer.data[i].uv = (point[axes[0]] * density, point[axes[1]] * density)


def cube(name, box, bottom, height, material, group, bevel=0):
    x0, z0, x1, z1 = box
    assert x1 > x0 and z1 > z0 and height > 0, (name, box, height)
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz((x0+x1)/2, bottom+height/2, (z0+z1)/2))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (x1-x0, z1-z0, height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.parent = group
    obj.data.materials.append(materials[material])
    if bevel:
        modifier = obj.modifiers.new('Crafted edge', 'BEVEL')
        modifier.width = min(bevel, min(obj.dimensions) * .2)
        modifier.segments = 1
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        modifier = obj.modifiers.new('Face normals', 'WEIGHTED_NORMAL')
        modifier.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.context.view_layer.update()
    density = .5 if material == 'bath_floor' else 1 / 1.89 if material == 'cedar' else 1
    uv_project(obj, density)
    return obj


def split_box(name, box, bottom, height, material, bevel=0, low=fixed, high=upper):
    if bottom < 1:
        cube(name + '_lower', box, bottom, min(bottom + height, 1) - bottom, material, low, bevel)
    if bottom + height > 1:
        cube(name + '_upper', box, max(bottom, 1), bottom + height - max(bottom, 1), material, high, bevel)


def split_polygon(poly, axis, boundary, sign):
    # Vertices carry game position, Blender normal and UV; interpolate all.
    inside, outside = [], []
    for a, b in zip(poly, poly[1:] + poly[:1]):
        da = (a[0][axis] - boundary) * sign
        db = (b[0][axis] - boundary) * sign
        a_inside, b_inside = da >= -1e-9, db >= -1e-9
        (inside if a_inside else outside).append(a)
        if a_inside != b_inside:
            t = da / (da - db)
            p = (a[0].lerp(b[0], t), a[1].lerp(b[1], t).normalized(), a[2].lerp(b[2], t))
            inside.append(p)
            outside.append(p)
    return inside, outside


def polygon_area(poly):
    if len(poly) < 3:
        return 0
    p0 = poly[0][0]
    return sum((poly[i][0] - p0).cross(poly[i+1][0] - p0).length / 2 for i in range(1, len(poly)-1))


def clean_polygon(poly):
    # Plane clipping can emit an endpoint twice. Remove sub-float32 duplicate
    # and straight-through vertices before the GLB triangulator sees them.
    cleaned = []
    for vertex in poly:
        if not cleaned or (vertex[0]-cleaned[-1][0]).length > 1e-6:
            cleaned.append(vertex)
    if len(cleaned) > 1 and (cleaned[0][0]-cleaned[-1][0]).length <= 1e-6:
        cleaned.pop()
    changed = True
    while changed and len(cleaned) > 3:
        changed = False
        for i in range(len(cleaned)):
            a, b, c = cleaned[i-1][0], cleaned[i][0], cleaned[(i+1)%len(cleaned)][0]
            if (b-a).cross(c-b).length < 1e-9 and (b-a).dot(c-b) >= 0:
                cleaned.pop(i)
                changed = True
                break
    return cleaned


def outside_box(poly, lo, hi):
    coords = [p[0] for p in poly]
    if any(max(p[k] for p in coords) < lo[k] - 1e-8 or min(p[k] for p in coords) > hi[k] + 1e-8 for k in range(3)):
        return [poly]
    kept, remaining = [], poly
    for axis in range(3):
        for boundary, sign in ((lo[axis], 1), (hi[axis], -1)):
            if not remaining:
                break
            remaining, outside = split_polygon(remaining, axis, boundary, sign)
            if polygon_area(outside) > 1e-12:
                kept.append(outside)
    if polygon_area(remaining) <= 1e-12:
        return [poly]  # Touching a boundary cannot erase a face.
    return kept


def carve(obj, boxes):
    mesh = obj.data
    uv = mesh.uv_layers.active
    assert uv is not None, 'Source architecture must retain UV data'
    matrix = obj.matrix_world.copy()
    normals = matrix.to_3x3().inverted().transposed()
    original, final = [], []
    for face in mesh.polygons:
        poly = [(game(matrix @ mesh.vertices[mesh.loops[i].vertex_index].co),
                 (normals @ mesh.corner_normals[i].vector).normalized(), uv.data[i].uv.copy())
                for i in face.loop_indices]
        original.append((poly, face.material_index, face.use_smooth))
        pieces = [poly]
        for lo, hi in boxes:
            pieces = [piece for p in pieces for piece in outside_box(p, lo, hi)]
        final.extend((p, face.material_index, face.use_smooth) for p in pieces)
    old_area = sum(polygon_area(p[0]) for p in original)
    new_area = sum(polygon_area(p[0]) for p in final)
    source_degenerates = sum(polygon_area(p[0]) < 1e-14 for p in original)
    if old_area - new_area < 1e-9 and not source_degenerates:
        return
    vertices, faces, meta, uvs, custom_normals = [], [], [], [], []
    for poly, material, smooth in final:
        poly = clean_polygon(poly)
        if polygon_area(poly) < 1e-10:
            continue
        start = len(vertices)
        vertices.extend(tuple(xyz(*p[0])) for p in poly)
        faces.append(tuple(range(start, start + len(poly))))
        meta.append((material, smooth))
        uvs.extend(p[2] for p in poly)
        custom_normals.extend(p[1] for p in poly)
    replacement = bpy.data.meshes.new(obj.name + '_growth')
    replacement.from_pydata(vertices, [], faces)
    replacement.update()
    for material in mesh.materials:
        replacement.materials.append(material)
    layer = replacement.uv_layers.new(name='UVMap')
    for face, (material, smooth) in zip(replacement.polygons, meta):
        face.material_index, face.use_smooth = material, smooth
    for i, value in enumerate(uvs):
        layer.data[i].uv = value
    replacement.normals_split_custom_set(custom_normals)
    obj.data = replacement
    obj.parent = patch_root
    obj.matrix_world = Matrix.Identity(4)
    obj['growth_edit'] = 'Local clipping; source UVs and surface normals interpolated at cuts'
    replacement_names.append(obj.name)
    changes.append({'node': obj.name, 'removed_surface_area_m2': old_area - new_area,
                    'source_zero_area_triangles_removed': source_degenerates})


# Replace only the floor material batch. Original tiles/UV density are retained.
old_floor = bpy.data.objects['environment_static__bath_floor']
original_floor_name = old_floor.name
old_floor.name = 'SOURCE_ONLY_bath_floor'
old_floor.hide_render = True
old_floor.hide_set(True)
floor_root = empty(original_floor_name, patch_root)
bath = next(z['box'] for z in layout['zones'] if z['id'] == 'bath')
pieces = [rect(bath)]
for water in layout['duckWater']:
    pieces = [p for r in pieces for p in subtract_rectangle(r, rect(water))]
floor_objects = [cube('growth_bath_floor_piece_' + str(i), r, -.1, .1, 'bath_floor', floor_root) for i, r in enumerate(pieces)]
# Keep a single leaf replacement with the original node name.
bpy.ops.object.select_all(action='DESELECT')
for obj in floor_objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = floor_objects[0]
bpy.ops.object.join()
floor_obj = bpy.context.object
matrix = floor_obj.matrix_world.copy()
for vertex in floor_obj.data.vertices:
    vertex.co = matrix @ vertex.co
floor_obj.parent = patch_root
floor_obj.matrix_world = Matrix.Identity(4)
bpy.data.objects.remove(floor_root, do_unlink=True)
floor_obj.name = original_floor_name
replacement_names.append(original_floor_name)

# Any source material crossing a new water connector or opening is trimmed,
# but NPCs, mural, ceilings, furniture outside these exact volumes stay intact.
new_water = [rect(water) for water in layout['duckWater']]
for old_water in base_layout['duckWater']:
    new_water = [p for r in new_water for p in subtract_rectangle(r, rect(old_water))]
cut_boxes = []
for x0, z0, x1, z1 in new_water:
    cut_boxes.append((Vector((x0 + 1e-6, -.11, z0 + 1e-6)), Vector((x1 - 1e-6, .65, z1 - 1e-6))))
for door in layout['highDoors'].values():
    b = door['blocker']
    cut_boxes.append((Vector((b['minX']-1e-5, .001, b['minZ']-1e-5)),
                      Vector((b['maxX']+1e-5, 2.25, b['maxZ']+1e-5))))
old_noren = next(d for d in base_layout['decor'] if d['kind'] == 'curtain')
new_noren = next(d for d in layout['decor'] if d['kind'] == 'curtain')
noren_cut = (Vector((old_noren['box']['minX']-.02, old_noren['y0']-.01, old_noren['box']['minZ']-.02)),
             Vector((old_noren['box']['maxX']+.02, old_noren['y0']+old_noren['height']+.03, old_noren['box']['maxZ']+.02)))
for name, obj in source_objects.items():
    if name == original_floor_name or not name.startswith(('environment_static__', 'environment_upper__')):
        continue
    if name.endswith(('fuji_mural', 'rose_cloth')):
        continue
    carve(obj, cut_boxes + ([noren_cut] if old_noren != new_noren and name.endswith(('navy_cloth', 'cedar')) else []))

# Water beds below existing runtime water, with no second water surface.
for i, water in enumerate(new_water):
    cube('growth_water_bed_' + str(i), water, -.29, .06, 'ceramic_teal', fixed)

# Street is outside the old building, so it gets its own floor and low-cutaway
# cedar enclosure. Nothing is added above it as a ceiling.
street = next(z['box'] for z in layout['zones'] if z['id'] == 'street')
cube('growth_street_floor', rect(street), -.1, .1, 'garden_stone', fixed)
for i, f in enumerate(new_fences):
    b = rect(f['box'])
    if b[0] > 12:
        # The eastern boundary stays inside its solid collision envelope, but
        # spaced slats let daylight read as outdoors after the front door opens.
        x0, z0, x1, z1 = b
        for j in range(5):
            center = z0 + .07 + (z1-z0-.14)*j/4
            split_box('growth_street_fence_post_' + str(j),
                      (x0,center-.07,x1,center+.07), 0, f['height'], 'cedar')
        split_box('growth_street_fence_rail', b, .82, .08, 'cedar')
    else:
        split_box('growth_street_fence_' + str(i), b, 0, f['height'], 'cedar')
    split_box('growth_street_fence_cap_' + str(i), b, f['height']-.04, .04, 'dark_cedar')
for i, d in enumerate(layout['decor']):
    if d in base_layout['decor']:
        continue
    b, bottom, height = rect(d['box']), d['y0'], d['height']
    if d['kind'] == 'border':
        pieces = [b]
        for water in layout['duckWater']:
            pieces = [p for r in pieces for p in subtract_rectangle(r, rect(water))]
        for j, part in enumerate(pieces):
            split_box('growth_border_' + str(i) + '_' + str(j), part, bottom, height, 'ceramic_cream')
    elif d['kind'] in ('stone', 'threshold', 'poolEdge'):
        split_box('growth_detail_' + str(i), b, bottom, height,
                  'garden_stone' if d['kind'] in ('stone', 'threshold') else 'ceramic_cream')
    elif d['kind'] == 'curtain':
        x0, z0, x1, z1 = b
        # Two hanging fabric panels with a genuine central slit.
        middle = (z0+z1)/2
        split_box('growth_noren_a', (x0,z0,x1,middle-.10), bottom, height, 'navy_cloth')
        split_box('growth_noren_b', (x0,middle+.10,x1,z1), bottom, height, 'navy_cloth')
        split_box('growth_noren_rod', (x0-.008,z0-.02,x1+.008,z1+.02), bottom+height, .025, 'cedar', .004)

for i, fixture in enumerate(growth_fixtures):
    b, height, kind = rect(fixture['box']), fixture['height'], fixture['kind']
    x0, z0, x1, z1 = b
    if kind == 'partition':
        split_box('growth_partition_' + str(i), b, 0, height - .045, 'ceramic_teal')
        split_box('growth_partition_cap_' + str(i), b, height - .045, .045, 'ceramic_cream', .012)
    elif kind == 'curb':
        split_box('growth_curb_' + str(i), b, 0, height, 'ceramic_cream', .012)
    else:
        split_box('growth_storage_' + str(i), b, 0, height, 'cedar', .012)
        # Recessed cream front panels inside the collider footprint.
        for j in range(3):
            a, c = z0 + (z1-z0)*j/3 + .025, z0 + (z1-z0)*(j+1)/3 - .025
            split_box('growth_storage_panel_' + str(i) + '_' + str(j),
                      (x0 + .001, a, x0 + .014, c), .12, height - .24, 'ceramic_cream', .004)

for key, name in node_names.items():
    door = layout['highDoors'][key]
    b = rect(door['blocker'])
    x0, z0, x1, z1 = b
    dynamic = empty(name, patch_root)
    dynamic_upper = empty(name + '_upper', dynamic)
    additions[name] = 'sento_environment'
    top = 1.6 if key == 'kidsGate' else 2.2  # Fixed Kiro Level/asset contract, 2026-11-22.
    long_x = x1-x0 > z1-z0
    # Keep the grip visible on the approach side, inside the collision envelope.
    leaf = (x0,z0,x1,z0+.06) if long_x else (x0+.04,z0,x1,z1)
    split_box(name + '_leaf', leaf, .025, top - .025, 'cedar', .008, dynamic, dynamic_upper)
    inset = (x0+.045, z0+.06, x1-.045, z0+.072) if long_x else (x0+.028, z0+.045, x0+.04, z1-.045)
    split_box(name + '_inset', inset, .18, top - .36, 'dark_cedar', .004, dynamic, dynamic_upper)
    hx, hz, hy = door['handle']['x'], door['handle']['z'], door['handleY']
    handle = (hx-.06, hz-.018, hx+.06, hz+.018) if long_x else (hx-.018, hz-.06, hx+.018, hz+.06)
    split_box(name + '_handle', handle, hy-.018, .036, 'brushed_metal', .005, dynamic, dynamic_upper)
    # Jambs remain outside the clear aperture. Closed leaf/handle alone disappear.
    if long_x:
        jambs = [(x0-.045,z0,x0,z1), (x1,z0,x1+.045,z1)]
    else:
        jambs = [(x0,z0-.045,x1,z0), (x0,z1,x1,z1+.045)]
    for i, jamb in enumerate(jambs):
        split_box(name + '_jamb_' + str(i), jamb, 0, 2.30, 'cedar', .006)
    split_box(name + '_header', b, 2.25, .05, 'dark_cedar', .005)

# Batch only the new fixed architecture by material and visibility ownership.
for group in (fixed, upper):
    by_material = {}
    for obj in list(group.children):
        if obj.type == 'MESH':
            by_material.setdefault(obj.data.materials[0].name, []).append(obj)
    for material, objects in by_material.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        bpy.context.object.name = group.name + '__' + material

patch_root['layout_sha256'] = layout['layout_sha256']
patch_root['production_method'] = 'Direct Blender patch of reviewed source environment; original materials reused'
contract = {'layout_sha256': layout['layout_sha256'],
            'replacements': {name: helper['node_fingerprint'](source_doc, source_binary, name) for name in replacement_names},
            'additions': additions, 'source_sha256': before_hash,
            'changes': changes, 'scope': 'Architecture only; no gameplay or normal-input verification'}
(output / 'patch-contract.json').write_text(json.dumps(contract, indent=2) + '\n')
(output / 'plan.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n')

# Export selected patch only; original source scene remains visible for editing.
for image in bpy.data.images:
    if image.packed_file:
        image.filepath = '//textures/' + image.name
        for packed in image.packed_files:
            packed.filepath = '//textures/' + image.name
for screen in bpy.data.screens:
    for area in screen.areas:
        for space in area.spaces:
            if space.type == 'FILE_BROWSER' and space.params:
                space.params.directory = b'/' * 1023
                space.params.directory = b'//'
bpy.context.preferences.filepaths.save_version = 0
bpy.context.scene.render.filepath = '//'
bpy.ops.wm.save_as_mainfile(filepath=str(output / 'growth_environment_patch.blend'), compress=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in [patch_root] + list(patch_root.children_recursive):
    obj.select_set(True)
patch_path = output / 'growth_environment_patch.glb'
bpy.ops.export_scene.gltf(filepath=str(patch_path), export_format='GLB', use_selection=True,
                         export_yup=True, export_extras=True)
# The merger resolves original materials by name. Discard copied image data,
# including source JPEGs, instead of recompressing the untouched environment.
patch_doc, patch_binary = helper['read_glb'](patch_path)
geometry_views = sorted({a['bufferView'] for a in patch_doc.get('accessors', [])})
new_views, new_binary, view_map = [], bytearray(), {}
for old_index in geometry_views:
    old_view = patch_doc['bufferViews'][old_index]
    new_binary.extend(b'\0' * (-len(new_binary) % 4))
    new_view = dict(old_view)
    new_view['byteOffset'] = len(new_binary)
    start = old_view.get('byteOffset', 0)
    new_binary.extend(patch_binary[start:start+old_view['byteLength']])
    view_map[old_index] = len(new_views)
    new_views.append(new_view)
for accessor in patch_doc.get('accessors', []):
    accessor['bufferView'] = view_map[accessor['bufferView']]
patch_doc['bufferViews'] = new_views
patch_doc['materials'] = [{'name': m['name']} for m in patch_doc['materials']]
for key in ('images', 'textures', 'samplers', 'extensionsUsed', 'extensionsRequired'):
    patch_doc.pop(key, None)
helper['write_glb'](patch_path, patch_doc, bytes(new_binary))
merged = output / 'sento_environment.glb'
report = helper['merge'](source, patch_path, output / 'patch-contract.json', merged)
assert sha(source) == before_hash, 'Source environment was modified'

# Reimport the exact merged candidate, not an unexported construction preview.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(merged))
bpy.context.view_layer.update()
meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
points = [game(obj.matrix_world @ v.co) for obj in meshes for v in obj.data.vertices]
assert all(all(math.isfinite(v) for v in p) for p in points)
triangle_count = 0
for obj in meshes:
    obj.data.calc_loop_triangles()
    triangle_count += len(obj.data.loop_triangles)
report.update({'layout_sha256': layout['layout_sha256'], 'triangles_total': triangle_count,
               'bounds_gltf_m': [[min(p[i] for p in points) for i in range(3)], [max(p[i] for p in points) for i in range(3)]],
               'dynamic_nodes': list(node_names.values()),
               'source_unchanged': sha(source) == before_hash,
               'verification': 'Actual candidate GLB import, finite vertices and named-node contract; clearance/render review pending'})
for name in node_names.values():
    assert bpy.data.objects.get(name) and bpy.data.objects.get(name + '_upper')
(output / 'measurements.json').write_text(json.dumps(report, indent=2) + '\n')
print('GROWTH_ENVIRONMENT_CANDIDATE', json.dumps(report), flush=True)
