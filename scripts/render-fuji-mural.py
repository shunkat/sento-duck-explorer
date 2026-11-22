"""Inspect the actual world mural in two bath views, without changing materials.

Blender --background --python-exit-code 1 --python scripts/render-fuji-mural.py --
    [--world public/models/sento_environment.glb]
    [--output-dir .local/fuji-mural/renders]

Temporary inspection lights/cameras are not exported. This is asset inspection,
not a game-lighting or normal-input play result.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
sys.dont_write_bytecode = True

import bpy


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--world', type=Path, default=Path('public/models/sento_environment.glb'))
    parser.add_argument('--output-dir', type=Path, default=Path('.local/fuji-mural/renders'))
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    assert '.local' in args.output_dir.resolve().parts, 'Keep renders private until reviewed'
    spec = importlib.util.spec_from_file_location('world_render', Path(__file__).with_name('render-replaced-world.py'))
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    digest = hashlib.sha256(args.world.read_bytes()).hexdigest()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.world.resolve()))
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 32; scene.cycles.use_denoising = True
    scene.cycles.diffuse_bounces = 2; scene.cycles.glossy_bounces = 1
    scene.render.resolution_x = 1440; scene.render.resolution_y = 900; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'; scene.view_settings.view_transform = 'AgX'
    scene.world = bpy.data.worlds.new('QA neutral daylight'); scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.65, .72, .8, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .45
    for position, energy, size in [((7.6, 2.6, 5.5), 450, 5), ((4.5, 2.2, 6.5), 140, 3)]:
        bpy.ops.object.light_add(type='AREA', location=helper.xyz(*position))
        light = bpy.context.object; light.name = 'QA_ONLY_light'; light.data.energy = energy
        light.data.shape = 'DISK'; light.data.size = size
        helper.aim(light, helper.xyz(7.6, 1.55, 8.882))
    bpy.ops.object.camera_add(); camera = bpy.context.object; scene.camera = camera
    camera.data.type = 'PERSP'; camera.data.sensor_fit = 'HORIZONTAL'; camera.data.sensor_width = 36
    args.output_dir.mkdir(parents=True, exist_ok=True)
    views = [('bath_mural_context', (10.8, 1.45, 2.0), (6.3, 1.2, 8.7), 25),
             ('bath_mural_front', (7.6, 1.75, 4.7), (7.6, 1.75, 8.882), 27)]
    reports = []
    for name, eye, target, lens in views:
        camera.location = helper.xyz(*eye); helper.aim(camera, helper.xyz(*target)); camera.data.lens = lens
        path = args.output_dir / (name + '.png'); scene.render.filepath = str(path.resolve())
        bpy.ops.render.render(write_still=True); helper.strip_png_metadata(path)
        reports.append({'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                        'eye_gltf_m': eye, 'target_gltf_m': target, 'lens_mm': lens})
    assert hashlib.sha256(args.world.read_bytes()).hexdigest() == digest
    report = {'source_world_sha256': digest, 'views': reports,
              'source_geometry_materials_visibility_unchanged': True,
              'scope': 'Actual GLB reimport with QA-only lights and cameras; no game or play verification.'}
    (args.output_dir / 'render-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('FUJI_MURAL_RENDERS', json.dumps(report))


if __name__ == '__main__':
    main()
