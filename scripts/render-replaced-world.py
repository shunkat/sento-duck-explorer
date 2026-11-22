"""Render placement/contact QA views from the actual patched world GLB.

Blender --background --python-exit-code 1 --python scripts/render-replaced-world.py

No geometry, materials or scene visibility are changed. Cameras/lights exist
only in this temporary inspection session; no Blend or GLB is exported.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys
sys.dont_write_bytecode = True

import bpy
from mathutils import Vector


def xyz(x, y, z):
    return Vector((x, -z, y))


def aim(obj, point):
    obj.rotation_euler = (point-obj.location).to_track_quat('-Z', 'Y').to_euler()


def strip_png_metadata(path):
    raw = path.read_bytes(); output = bytearray(raw[:8]); at = 8
    assert raw[:8] == b'\x89PNG\r\n\x1a\n'
    while at < len(raw):
        size = struct.unpack_from('>I', raw, at)[0]
        kind = raw[at+4:at+8]
        assert at+size+12 <= len(raw)
        if kind not in (b'tEXt', b'iTXt', b'zTXt', b'eXIf'):
            output.extend(raw[at:at+size+12])
        at += size+12
    path.write_bytes(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--world', type=Path, default=Path('.local/distinct-sento-npcs/world/sento_environment.glb'))
    parser.add_argument('--output-dir', type=Path, default=Path('.local/distinct-sento-npcs/world/renders'))
    parser.add_argument('--tattoo', action='store_true', help='Inspect only the tattooed standing visitor in its actual slot')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    assert '.local' in args.output_dir.resolve().parts, 'Render output remains private until reviewed'
    digest = hashlib.sha256(args.world.read_bytes()).hexdigest()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.world.resolve()))
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 24; scene.cycles.use_denoising = True
    scene.cycles.diffuse_bounces = 1; scene.cycles.glossy_bounces = 1
    scene.render.resolution_x = 1280; scene.render.resolution_y = 960; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'; scene.view_settings.view_transform = 'AgX'
    scene.world = bpy.data.worlds.new('QA neutral daylight'); scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.65, .72, .8, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .45
    bpy.ops.object.camera_add(); camera = bpy.context.object; scene.camera = camera
    camera.data.type = 'PERSP'; camera.data.sensor_fit = 'HORIZONTAL'; camera.data.sensor_width = 36
    args.output_dir.mkdir(parents=True, exist_ok=True)
    views = [('npc_reception_v02', (6.45, 1.45, -6.85), (4.9, .88, -8.625), 30,
              [((5.5, 2.35, -7.5), 270, 3), ((4.4, 1.8, -8.4), 90, 1.3)]),
             ('npc_seated_contact_v02', (16.95, 1.05, 3.9), (15.988, .60, 2.5), 30,
              [((16.4, 2.35, 2.4), 250, 3), ((15.0, 2.1, 4.3), 110, 2)])]
    if args.tattoo:
        views = [('tattoo_visitor_placement_v04', (17.1, 1.45, 2.8), (15.7, .95, .3), 48,
                  [((15.0, 2.3, 2.0), 190, 3), ((17.2, 1.9, 1.0), 85, 2)])]
    reports = []
    for name, eye, target, lens, lights in views:
        created = []
        for location, energy, size in lights:
            bpy.ops.object.light_add(type='AREA', location=xyz(*location))
            light = bpy.context.object; light.name = 'QA_ONLY_light'; light.data.energy = energy
            light.data.shape = 'DISK'; light.data.size = size; aim(light, xyz(*target)); created.append(light)
        camera.location = xyz(*eye); aim(camera, xyz(*target)); camera.data.lens = lens
        path = args.output_dir / (name + '.png'); scene.render.filepath = str(path.resolve())
        bpy.ops.render.render(write_still=True); strip_png_metadata(path)
        reports.append({'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                        'eye_gltf_m': eye, 'target_gltf_m': target, 'lens_mm': lens,
                        'source_world_sha256': digest, 'source_geometry_materials_visibility_unchanged': True})
        for light in created:
            bpy.data.objects.remove(light, do_unlink=True)
    assert hashlib.sha256(args.world.read_bytes()).hexdigest() == digest
    (args.output_dir / 'render-report.json').write_text(json.dumps({'views': reports,
        'scope': 'Asset placement/contact inspection of the exact GLB; QA-only lights/cameras; no gameplay verification.'}, indent=2)+'\n')
    print('WORLD_PLACEMENT_RENDERS', json.dumps({'world_sha256': digest, 'files': [r['file'] for r in reports]}))


if __name__ == '__main__':
    main()
