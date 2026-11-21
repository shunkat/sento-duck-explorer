"""Measure actual character exports and render their authored attachments.

Blender --background --python scripts/inspect-character-attachments.py --
--models public/models --out assets/quality/existing-models/attachments

This is an asset inspection, not a gameplay or frame-time test.
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

parser = argparse.ArgumentParser()
parser.add_argument('--models', required=True)
parser.add_argument('--out', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
models, out = Path(args.models), Path(args.out)
out.mkdir(parents=True, exist_ok=True)
facts = {'blender': bpy.app.version_string, 'assets': {}, 'attachments': {},
         'scope': 'Reimported exports at authored scale, static attachment renders; no gameplay or GPU benchmark.'}


def import_model(id):
    before = set(bpy.context.scene.objects)
    path = models / (id + '.glb')
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = set(bpy.context.scene.objects) - before
    roots = [o for o in objects if o.parent not in objects]
    return objects, roots


def gltf_point(p):
    return [p.x, p.z, -p.y]


def measure(objects):
    points = [gltf_point(o.matrix_world @ v.co) for o in objects if o.type == 'MESH' for v in o.data.vertices]
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    assert all(math.isfinite(c) for p in points for c in p)
    return {'min': lo, 'max': hi}


for id in ['duck', 'hat_sauna_duck', 'child', 'adult']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objects, roots = import_model(id)
    bpy.context.view_layer.update()
    raw = (models / (id + '.glb')).read_bytes()
    n = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20+n])
    meshes = [o for o in objects if o.type == 'MESH']
    bounds = measure(meshes)
    a = {'sha256': hashlib.sha256(raw).hexdigest(), 'glb_bytes': len(raw),
         'bounds': bounds, 'width': bounds['max'][0]-bounds['min'][0],
         'height': bounds['max'][1]-bounds['min'][1], 'depth': bounds['max'][2]-bounds['min'][2],
         'materials': len(gltf.get('materials', [])), 'textures': len(gltf.get('textures', [])),
         'vertices': sum(gltf['accessors'][p['attributes']['POSITION']]['count'] for m in gltf['meshes'] for p in m['primitives']),
         'triangles': sum(gltf['accessors'][p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives']),
         'sockets': {o.name: gltf_point(o.matrix_world.translation) for o in objects if o.name.startswith('socket_')}}
    assert all('uri' not in b for b in gltf.get('buffers', []))
    assert all('uri' not in im for im in gltf.get('images', []))
    a['embedded_png_sizes'] = []
    for im in gltf.get('images', []):
        assert im['mimeType'] == 'image/png'
        start = 28+n+gltf['bufferViews'][im['bufferView']].get('byteOffset', 0)
        a['embedded_png_sizes'].append(list(struct.unpack_from('>II', raw, start+16)))
    if id in ['child', 'adult']:
        band = (.64, .80) if id == 'child' else (1.15, 1.25)
        hand = next(o for o in objects if o.name == 'socket_hand_r').matrix_world.translation
        a['variants'] = {}
        for mesh in meshes:
            mesh.data.calc_loop_triangles()
            points = [mesh.matrix_world @ v.co for v in mesh.data.vertices]
            shoulder = [p.x for p in points if band[0] <= p.z <= band[1]]
            a['variants'][mesh.name] = {'bounds': measure([mesh]), 'triangles': len(mesh.data.loop_triangles),
                'shoulder_band_y': list(band), 'shoulder_width': max(shoulder)-min(shoulder),
                'hand_nearest_vertex_distance': min((p-hand).length for p in points)}
    facts['assets'][id] = a


def setup(span, focus):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = 0
    scene.world = bpy.data.worlds.new('Neutral attachment inspection')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.095, .095, .095, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .45
    for pos, power, width in [((1.8,-2.6,3),300,2.1),((-2.5,-1,1.6),110,2.2),((.5,2.2,2.4),220,1.5)]:
        bpy.ops.object.light_add(type='AREA', location=focus+Vector(pos)*span)
        light = bpy.context.object
        light.data.energy = power*span*span
        light.data.size = width*span
        light.rotation_euler = (focus-light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.type = 'ORTHO'
    scene.camera = camera
    return camera


def render(camera, name, focus, direction, scale):
    camera.location = focus + Vector(direction).normalized()*scale*4
    camera.rotation_euler = (focus-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale = scale
    path = out / (name+'.png')
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    raw = path.read_bytes()
    data = bytearray(raw[:8]); i = 8
    while i < len(raw):
        n = struct.unpack_from('>I', raw, i)[0]
        if raw[i+4:i+8] not in [b'tEXt', b'zTXt', b'iTXt', b'eXIf']:
            data += raw[i:i+n+12]
        i += n+12
    path.write_bytes(data)


for arrangement in ['duck_hat', 'adult_carry']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    adult_objects = None
    if arrangement == 'adult_carry':
        adult_objects, _ = import_model('adult')
    duck_objects, duck_roots = import_model('duck')
    hat_objects, hat_roots = import_model('hat_sauna_duck')
    bpy.context.view_layer.update()
    hat_socket = next(o for o in duck_objects if o.name == 'socket_hat')
    for root in hat_roots:
        root.matrix_world = hat_socket.matrix_world @ root.matrix_world
    if adult_objects:
        carry = next(o for o in adult_objects if o.name == 'socket_carry')
        for root in [*duck_roots, *hat_roots]:
            root.matrix_world = carry.matrix_world @ root.matrix_world
    bpy.context.view_layer.update()
    facts['attachments'][arrangement] = {'duck_bounds': measure(duck_objects), 'hat_bounds': measure(hat_objects)}
    if adult_objects:
        focus = Vector((0,0,.86)); camera = setup(1.7, focus)
        for outfit in ['clothed', 'bath']:
            for o in adult_objects:
                if o.type == 'MESH': o.hide_render = o.name.split('.')[0] != 'outfit_'+outfit
            render(camera, 'adult_'+outfit+'_carry', focus, (.48,-1,.18), 2.1)
            render(camera, 'adult_'+outfit+'_hand_side', Vector((-.24,-.15,1.05)), (-1,-.08,.08), .85)
    else:
        focus = Vector((0,0,.23)); camera = setup(.45, focus)
        for view, direction in [('front',(0,-1,.1)),('threequarter',(.48,-1,.18)),('side',(1,0,.12))]:
            render(camera, 'duck_hat_'+view, focus, direction, .55)
        facts['attachments'][arrangement]['label_clearance_m'] = (
            next(o for o in duck_objects if o.name == 'socket_label').matrix_world.translation.z
            - facts['attachments'][arrangement]['hat_bounds']['max'][1])
(out/'measurements.json').write_text(json.dumps(facts, indent=2)+'\n')
print(json.dumps({'assets': {k: v['sha256'] for k,v in facts['assets'].items()}, 'output': out.name}))
