"""Reimport and measure/render the exact merged growth environment candidate.

Blender --background --python scripts/review-growth-environment.py --
  --model .local/growth-world/candidate/sento_environment.glb
  --layout .local/growth-world/layout.json --output .local/growth-world/review

Geometry QA and Blender inspection views only; no game or normal-input testing.
"""
import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--model', required=True)
parser.add_argument('--layout', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--no-render', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
layout = json.loads(Path(args.layout).read_text())
model = Path(args.model)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(model))
bpy.context.view_layer.update()
meshes = [o for o in bpy.data.objects if o.type == 'MESH']


def xyz(x, y, z):
    return Vector((x, -z, y))


def gltf(p):
    return Vector((p.x, p.z, -p.y))


def ancestor(obj, predicate):
    while obj:
        if predicate(obj):
            return True
        obj = obj.parent
    return False


def area(poly):
    return sum((poly[i]-poly[0]).cross(poly[i+1]-poly[0]).length / 2 for i in range(1, len(poly)-1)) if len(poly) > 2 else 0


def clip(poly, lo, hi):
    for axis in range(3):
        for bound, sign in ((lo[axis], 1), (hi[axis], -1)):
            if not poly:
                return []
            output = []
            for a, b in zip(poly, poly[1:]+poly[:1]):
                da, db = (a[axis]-bound)*sign, (b[axis]-bound)*sign
                if da >= 0:
                    output.append(a)
                if (da >= 0) != (db >= 0):
                    output.append(a.lerp(b, da/(da-db)))
            poly = output
    return poly


dynamic = {'sauna_door', 'growth_kids_gate', 'growth_front_exit'}
all_points, triangles, count, npc_count, degenerates = [], [], 0, 0, 0
degenerate_nodes = {}
for obj in meshes:
    points = [gltf(obj.matrix_world @ v.co) for v in obj.data.vertices]
    assert all(all(math.isfinite(value) for value in p) for p in points)
    all_points.extend(points)
    obj.data.calc_loop_triangles()
    count += len(obj.data.loop_triangles)
    npc = ancestor(obj, lambda o: o.name.startswith('npc_slot_'))
    if npc:
        npc_count += len(obj.data.loop_triangles)
    moving = ancestor(obj, lambda o: o.name in dynamic)
    for face in obj.data.loop_triangles:
        poly = [points[i] for i in face.vertices]
        if area(poly) < 1e-14:
            degenerates += 1
            degenerate_nodes[obj.name] = degenerate_nodes.get(obj.name, 0) + 1
        if not moving:
            triangles.append((obj.name, poly, [min(p[i] for p in poly) for i in range(3)],
                              [max(p[i] for p in poly) for i in range(3)]))

checks = [('narrow_hole', layout['narrowHole']['box'], .05, .45)]
checks += [('crowd_gap_' + str(i), g['box'], .05, 1.75) for i, g in enumerate(layout['crowdGaps'])]
checks += [(d['id'], d['box'], .05, 1.75) for d in layout['doors']]
checks += [('growth_door_' + key, value['blocker'], .05, 1.75) for key, value in layout['highDoors'].items()]
checks += [('child_passage', next(z['box'] for z in layout['zones'] if z['id'] == 'kids_passage'), .05, 1.25)]
# Actual clear passage is bounded by the bath wall inner face at x=.1.
checks[-1] = ('child_passage', {**checks[-1][1], 'minX': .1}, .05, 1.25)
checks += [('duck_water_' + str(i), b, .05, .35) for i, b in enumerate(layout['duckWater'])]
clearances = []
for name, b, bottom, top in checks:
    lo = Vector((b['minX']+1e-5, bottom, b['minZ']+1e-5))
    hi = Vector((b['maxX']-1e-5, top, b['maxZ']-1e-5))
    hits = []
    for obj, poly, a, c in triangles:
        if any(c[i] < lo[i] or a[i] > hi[i] for i in range(3)):
            continue
        if area(clip(poly, lo, hi)) > 1e-10:
            hits.append(obj)
    clearances.append({'id': name, 'bounds_gltf_m': [list(lo), list(hi)],
                       'intersecting_triangles': len(hits), 'hit_nodes': sorted(set(hits))})

node_bounds = {}
for name in ('growth_kids_gate', 'growth_front_exit', 'growth_fixed_static', 'growth_fixed_upper'):
    node = bpy.data.objects[name]
    if name in dynamic:
        assert node.parent.name == 'sento_environment'
        assert node.location.length < 1e-6 and node.rotation_euler.to_quaternion().angle < 1e-6
        assert (node.scale-Vector((1,1,1))).length < 1e-6
    points = [gltf(o.matrix_world @ v.co) for o in node.children_recursive if o.type == 'MESH' for v in o.data.vertices]
    node_bounds[name] = [[min(p[i] for p in points) for i in range(3)], [max(p[i] for p in points) for i in range(3)]]

report = {'scope': 'Exact exported GLB reimport/geometry and Blender lighting; game/normal-input verification separate',
          'layout_sha256': layout['layout_sha256'], 'export_sha256': hashlib.sha256(model.read_bytes()).hexdigest(),
          'export_bytes': model.stat().st_size, 'export_triangles': count,
          'architecture_triangles': count-npc_count, 'npc_triangles': npc_count,
          'mesh_count': len(meshes), 'vertices': sum(len(o.data.vertices) for o in meshes),
          'materials': sorted({m.name for o in meshes for m in o.data.materials}),
          'bounds_gltf_m': [[min(p[i] for p in all_points) for i in range(3)], [max(p[i] for p in all_points) for i in range(3)]],
          'finite_vertices': True, 'degenerate_faces': degenerates, 'degenerate_nodes': degenerate_nodes, 'clearances': clearances,
          'growth_node_bounds_gltf_m': node_bounds}
(out / 'geometry.json').write_text(json.dumps(report, indent=2) + '\n')
print('GROWTH_GEOMETRY', json.dumps(report), flush=True)
assert degenerates == 0, 'Degenerate faces'
assert all(c['intersecting_triangles'] == 0 for c in clearances), 'Opening intrusion: see geometry.json'
if args.no_render:
    raise SystemExit(0)


def srgb(x):
    return x/12.92 if x <= .04045 else ((x+.055)/1.055)**2.4


def rgb(h):
    return tuple(srgb(((h >> s) & 255) / 255) for s in (16,8,0))


def show(name, visible):
    node = bpy.data.objects[name]
    for obj in [node]+list(node.children_recursive):
        obj.hide_render = not visible


scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.cycles.diffuse_bounces = 1
scene.cycles.glossy_bounces = 1
scene.render.resolution_x, scene.render.resolution_y = 1280, 800
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'
scene.world = bpy.data.worlds.new('Inspection environment')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (*rgb(0xcddde2), 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .7
for position, energy, size in [((5,8,5),2500,10), ((9,8,-7),2000,8), ((25,12,5),2500,16)]:
    bpy.ops.object.light_add(type='AREA', location=xyz(*position))
    light = bpy.context.object
    light.data.energy, light.data.size = energy, size
    light.rotation_euler = (xyz(position[0],0,position[2])-light.location).to_track_quat('-Z','Y').to_euler()
for z in layout['zones']:
    if z['id'] in ('bath','changing','reception','common','genkan','sauna_entry','sauna_crowd'):
        b = z['box']; x=(b['minX']+b['maxX'])/2; zz=(b['minZ']+b['maxZ'])/2
        bpy.ops.object.light_add(type='AREA', location=xyz(x,2.52,zz))
        bpy.context.object.data.energy = (b['maxX']-b['minX'])*(b['maxZ']-b['minZ'])*10
        bpy.context.object.data.size = min(b['maxX']-b['minX'],b['maxZ']-b['minZ'])*.65
bpy.ops.object.light_add(type='SUN')
bpy.context.object.rotation_euler = (.4,-.3,-.5)
bpy.context.object.data.energy = 1.1

# Context-only water planes, never exported as architecture.
water = bpy.data.materials.new('QA_ONLY_runtime_water')
water.use_nodes = True
water.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb(0x557f93),1)
water.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .3
for b in layout['duckWater'] + [z['box'] for z in layout['zones'] if z['id'] == 'pond']:
    bpy.ops.mesh.primitive_plane_add(size=1, location=xyz((b['minX']+b['maxX'])/2,.026,(b['minZ']+b['maxZ'])/2))
    obj = bpy.context.object
    obj.name = 'QA_ONLY_runtime_water'
    obj.scale = (b['maxX']-b['minX'],b['maxZ']-b['minZ'],1)
    obj.data.materials.append(water)
bpy.ops.object.camera_add()
camera = bpy.context.object
scene.camera = camera
shots = [
    ('growth_overview',(6,9,12),(1.3,0,5.5),True,9,False),
    ('water_connection',(4.15,.45,8.5),(1.25,.35,8.5),False,None,False),
    ('child_passage',(.4,1.08,7.15),(.4,1.0,4.6),False,None,False),
    ('kids_gate_closed',(1.18,1.48,4.05),(1.1,1.15,2.85),False,None,False),
    ('street_closed',(9.5,1.55,-7),(11.2,1.4,-7),False,None,False),
    ('street_open',(9.5,1.55,-7),(11.9,1.15,-7),False,None,True),
    ('street_outside',(12.4,1.55,-6),(10.7,1.1,-7),False,None,True),
]
for name, eye, target, overview, ortho, opened in shots:
    show('environment_upper', not overview)
    show('environment_ceiling', not overview)
    show('sauna_door', False)
    for door in ('growth_kids_gate', 'growth_front_exit'):
        show(door, not opened)
        show(door+'_upper', not opened and not overview)
    camera.location = xyz(*eye)
    camera.rotation_euler = (xyz(*target)-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type = 'ORTHO' if ortho else 'PERSP'
    camera.data.lens = 25
    if ortho:
        camera.data.ortho_scale = ortho
    path = out / (name+'.png')
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    raw = path.read_bytes(); clean = raw[:8]; offset = 8
    while offset < len(raw):
        size = struct.unpack_from('>I',raw,offset)[0]
        chunk = raw[offset+4:offset+8]
        if chunk not in (b'tEXt',b'zTXt',b'iTXt',b'eXIf',b'tIME'):
            clean += raw[offset:offset+12+size]
        offset += 12+size
    path.write_bytes(clean)
print('GROWTH_RENDER_DONE', json.dumps([shot[0] for shot in shots]), flush=True)
