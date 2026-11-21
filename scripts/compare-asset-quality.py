"""Render exported GLBs under fixed quality-inspection conditions.

Run from the repository root with Blender --background --python
scripts/compare-asset-quality.py -- --asset wash_basin --before before.glb
--after after.glb --out .local/quality-comparison.

This renders and records evidence; it does not assign a perceptual pass score.
Every version uses the same framing, exposure and lights. Character geometry
stays at its authored metric scale; environment props use uniform containment.
"""
import argparse
import hashlib
import html
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--asset', choices=['bath_stool', 'wash_basin', 'duck', 'hat_sauna_duck', 'child', 'adult'], required=True)
parser.add_argument('--before', required=True)
parser.add_argument('--after', required=True)
parser.add_argument('--out', required=True)
parser.add_argument('--resolution', type=int, default=512)
parser.add_argument('--views', default='front,side,threequarter,top,underside')
parser.add_argument('--passes', default='beauty,clay,silhouette,reflection')
parser.add_argument('--outfit', choices=['clothed', 'bath'])
parser.add_argument('--before-label', default='修正前')
parser.add_argument('--after-label', default='修正後')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)
envelope = Vector({'bath_stool': (.36,.36,.30), 'wash_basin': (.20,.18,.14),
                   'duck': (.36,.36,.30), 'hat_sauna_duck': (.22,.22,.18),
                   'child': (.60,.60,1.20), 'adult': (.85,.75,1.70)}[args.asset])
contain = args.asset in ['bath_stool', 'wash_basin']
human = args.asset in ['child', 'adult']
assert not human or args.outfit, 'Select exactly one human outfit.'
assert human or args.outfit is None, 'Outfit selection applies only to human assets.'
span = max(envelope)
focus = Vector((0, 0, envelope.z / 2))
directions = {
    'front': (0, -1, .16),
    'side': (1, 0, .16),
    'threequarter': (.48, -1, .66),
    'top': (.02, -.28, 1),
    'underside': (.48, -1, -.65),
    'back': (0, 1, .16),
    'threequarter_left': (-.48, -1, .18),
}
if not contain:
    directions['threequarter'] = (.48,-1,.18)
face_settings = {'duck': (.23,.20), 'child': (1.02,.48), 'adult': (1.51,.54)}
if args.asset in face_settings:
    directions.update(face_front=(0,-1,.04), face_threequarter=(.48,-1,.06))
passes = args.passes.split(',')
views = args.views.split(',')
assert all(v in directions for v in views)
assert all(p in ['beauty', 'clay', 'silhouette', 'reflection'] for p in passes)
facts = {'asset': args.asset, 'blender': bpy.app.version_string,
         'resolution': args.resolution, 'projection': 'orthographic',
         'view_transform': 'AgX', 'exposure': 0, 'gamma': 1,
         'framing': 'fixed frame from unchanged LEVEL envelope' if contain else 'fixed metric frame; no candidate autofit',
         'fit': 'uniform containment; bottom aligned; proportions preserved' if contain else 'authored metric geometry and origin preserved',
         'outfit': args.outfit,
         'envelope_blender_xyz_m': list(envelope),
         'directions': {v: directions[v] for v in views},
         'passes': passes, 'versions': {},
         'limitation': 'Diagnostic views, not gameplay validation or an automatic visual-quality verdict.'}
light_setup = [
    ('key', (1.8,-2.6,3.0), 300, 2.1, 2.1),
    ('fill', (-2.5,-1.0,1.6), 110, 2.2, 2.2),
    ('rim', (.5,2.2,2.4), 220, 1.5, 1.5),
    ('reflection-strip', (1.2,-2.0,1.8), 160, 2.8, .10),
]
facts['renderer'] = {'engine': 'CYCLES', 'samples': 32, 'denoising': True}
facts['camera'] = {'focus_blender_xyz_m': list(focus), 'distance_m': span*4, 'ortho_scale_m': span*1.52}
facts['view_cameras'] = {v: {'focus_blender_xyz_m': [0,0,face_settings[args.asset][0]],
                            'ortho_scale_m': face_settings[args.asset][1]} if v.startswith('face_')
                          else {'focus_blender_xyz_m': list(focus), 'ortho_scale_m': span*1.52} for v in views}
facts['lights'] = [{'name': n, 'offset_from_focus_m': [p*span for p in pos],
                    'energy_w': energy*span*span, 'rectangle_size_m': [w*span, h*span]}
                   for n,pos,energy,w,h in light_setup]
facts['lighting_passes'] = {'beauty_and_clay': ['key','fill','rim'],
                           'reflection': ['reflection-strip'], 'silhouette': []}
facts['world'] = {'color_linear_rgb': [.095,.095,.095], 'strength': .45,
                  'silhouette_color_linear_rgb': [1,1,1], 'silhouette_strength': 1}


def shade(name, color, roughness, emission=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    if emission:
        nodes.remove(bsdf)
        node = nodes.new('ShaderNodeEmission')
        node.inputs['Color'].default_value = (*color, 1)
        mat.node_tree.links.new(node.outputs[0], nodes.get('Material Output').inputs['Surface'])
    else:
        bsdf.inputs['Base Color'].default_value = (*color, 1)
        bsdf.inputs['Roughness'].default_value = roughness
    return mat


def strip_png_text(path):
    # Blender stores render metadata even with the visible stamp disabled.
    # Remove text chunks without decoding or changing any image pixels.
    data = path.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    clean = bytearray(data[:8])
    offset = 8
    while offset < len(data):
        length = struct.unpack_from('>I', data, offset)[0]
        end = offset + length + 12
        if data[offset + 4:offset + 8] not in (b'tEXt', b'zTXt', b'iTXt', b'eXIf'):
            clean.extend(data[offset:end])
        offset = end
    path.write_bytes(clean)


for version, path in [('before', Path(args.before)), ('after', Path(args.after))]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if human:
        def selected_outfit(obj):
            while obj is not None:
                if obj.name.startswith('outfit_'):
                    return obj.name.split('.')[0] == f'outfit_{args.outfit}'
                obj = obj.parent
            return True  # Optional shared head/features belong to both outfits.
        for obj in meshes:
            obj.hide_render = not selected_outfit(obj)
        meshes = [o for o in meshes if not o.hide_render]
        assert meshes, 'Selected outfit has no visible mesh.'
    points = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
    lo = Vector([min(p[i] for p in points) for i in range(3)])
    hi = Vector([max(p[i] for p in points) for i in range(3)])
    dims = hi - lo
    assert all(math.isfinite(c) and c > 0 for c in dims)
    scale = min(envelope[i] / dims[i] for i in range(3)) if contain else 1
    center = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z)) if contain else Vector()
    roots = [o for o in bpy.context.scene.objects if o.parent is None]
    wrapper = bpy.data.objects.new('Inspection placement only', None)
    bpy.context.scene.collection.objects.link(wrapper)
    for obj in roots:
        obj.parent = wrapper
    wrapper.location = -center * scale
    wrapper.scale = (scale,scale,scale)
    # Preserve imported local geometry/custom normals and descendant transforms.
    originals = {o.name: (list(o.data.materials), [p.material_index for p in o.data.polygons]) for o in meshes}
    facts['versions'][version] = {
        'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'authored_dimensions_blender_xyz_m': list(dims), 'uniform_scale': scale,
        'placed_dimensions_blender_xyz_m': list(dims * scale),
    }
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = args.resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.compression = 90
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    world = bpy.data.worlds.new('Fixed neutral inspection world')
    world.use_nodes = True
    scene.world = world
    background = world.node_tree.nodes.get('Background')
    lights = []
    for name, pos, energy, width, height in light_setup:
        bpy.ops.object.light_add(type='AREA', location=focus + Vector(pos) * span)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy * span * span
        light.data.shape = 'RECTANGLE'
        light.data.size = width * span
        light.data.size_y = height * span
        light.rotation_euler = (focus-light.location).to_track_quat('-Z','Y').to_euler()
        lights.append(light)
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = span * 1.52
    scene.camera = camera
    overrides = {'clay': shade('Neutral clay', (.25,.25,.25), .5),
                 'silhouette': shade('Black silhouette', (0,0,0), 1, True),
                 'reflection': shade('Reflection inspection', (.18,.18,.18), .13)}
    for render_pass in passes:
        is_silhouette = render_pass == 'silhouette'
        background.inputs['Color'].default_value = (1,1,1,1) if is_silhouette else (.095,.095,.095,1)
        background.inputs['Strength'].default_value = 1 if is_silhouette else .45
        for light in lights:
            light.hide_render = is_silhouette or ((light.name == 'reflection-strip') != (render_pass == 'reflection'))
        for obj in meshes:
            obj.data.materials.clear()
            mats, indices = originals[obj.name]
            for mat in mats if render_pass == 'beauty' else [overrides[render_pass]]:
                obj.data.materials.append(mat)
            for polygon, material_index in zip(obj.data.polygons, indices):
                polygon.material_index = material_index if render_pass == 'beauty' else 0
        for view in views:
            view_focus = Vector(facts['view_cameras'][view]['focus_blender_xyz_m'])
            camera.data.ortho_scale = facts['view_cameras'][view]['ortho_scale_m']
            camera.location = view_focus + Vector(directions[view]).normalized() * span * 4
            camera.rotation_euler = (view_focus-camera.location).to_track_quat('-Z','Y').to_euler()
            scene.render.filepath = str((out / f'{version}_{render_pass}_{view}.png').resolve())
            bpy.ops.render.render(write_still=True)
            strip_png_text(Path(scene.render.filepath))

(out / 'comparison.json').write_text(json.dumps(facts, indent=2) + '\n')
sections = []
pass_labels = {'beauty': '通常の材質', 'clay': '無彩色の曲面', 'silhouette': '輪郭', 'reflection': '反射の流れ'}
view_labels = {'front': '正面', 'side': '側面', 'threequarter': '斜め', 'threequarter_left': '反対側の斜め', 'top': '上面', 'underside': '下面',
               'back': '背面', 'face_front': '顔・正面', 'face_threequarter': '顔・斜め'}
for render_pass in passes:
    for view in views:
        sections.append(f'<section id="{render_pass}-{view}"><h2>{pass_labels[render_pass]} / {view_labels[view]}</h2><div class="pair">' +
                        ''.join(f'<figure><img loading="lazy" src="{v}_{render_pass}_{view}.png" alt="{v}"><figcaption>{html.escape(label)}</figcaption></figure>' for v,label in [('before',args.before_label),('after',args.after_label)]) + '</div></section>')
navigation = ' · '.join(f'<a href="#{p}-{views[0]}">{pass_labels[p]}</a>' for p in passes)
(out / 'index.html').write_text('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>素材の修正前後比較</title>'
    '<style>body{margin:24px auto;padding:0 16px;max-width:1100px;background:#181818;color:#eee;font:16px system-ui}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}img{width:100%}h2{font-size:18px;margin-top:32px}figcaption{padding:8px}section{break-inside:avoid}a{color:#a7d7ff}nav{position:sticky;top:0;background:#181818;padding:12px 0}</style>'
    f'<h1>{html.escape(args.asset)} — 修正前後の比較</h1><p>カメラ・配置枠・露出・照明を固定し、書き出したGLBを再読込しています。反射検査は欠点を探すための材質で、完成時の見た目とは異なります。実プレイの検証ではありません。</p><nav>{navigation}</nav>' + ''.join(sections) + '</html>')
print(json.dumps({'comparison_complete': args.asset, 'renders': len(passes)*len(views)*2, 'output': str(out)}))
