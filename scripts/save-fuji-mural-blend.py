"""Save a packed editable v03 from the exact Fuji mural UV candidate.

Blender --background --python-exit-code 1 --python scripts/save-fuji-mural-blend.py

The publication GLB remains the byte-preserving fix-fuji-mural-uv.py output.
This import is editable source only and is never exported over that candidate.
"""
import argparse
from array import array
import importlib.util
import json
from pathlib import Path
import re
import sys

sys.dont_write_bytecode = True
import bpy

SPEC = importlib.util.spec_from_file_location('editable_world', Path(__file__).with_name('save-replaced-world-blend.py'))
BASE = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(BASE)
EXPECTED_GLB_SHA256 = '6ac2a9e99b4d068118ad30ddd01c9feda9ec273ade594aa157a39010d21b4c98'


def object_facts():
    facts = BASE.object_facts()
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            facts[obj.name]['uv_layers'] = [
                {'name': layer.name, 'loop_count': len(layer.data),
                 'uv_sha256': BASE.sha(array('f', (v for datum in layer.data for v in datum.uv)).tobytes())}
                for layer in obj.data.uv_layers]
    return facts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=Path('.local/fuji-mural/sento_environment.glb'))
    parser.add_argument('--output', type=Path, default=Path('.local/fuji-mural/sento_environment__v03.blend'))
    parser.add_argument('--report', type=Path, default=Path('.local/fuji-mural/sento_environment__v03.audit.json'))
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    private = (Path.cwd()/'.local/fuji-mural').resolve()
    assert args.output.resolve().is_relative_to(private) and args.report.resolve().is_relative_to(private)
    assert args.output.name.endswith('__v03.blend'), 'Use a new v03 editable source'
    assert len({args.input.resolve(), args.output.resolve(), args.report.resolve()}) == 3
    raw = args.input.read_bytes(); input_hash = BASE.sha(raw)
    assert input_hash == EXPECTED_GLB_SHA256, 'Import only the audited mural candidate'
    previous = Path('assets/sento_environment/blend/sento_environment__v02.blend')
    previous_hash = BASE.sha(previous.read_bytes())
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    for image in bpy.data.images:
        if image.type != 'IMAGE' or not image.size[0]:
            continue
        if not image.packed_file:
            image.pack()
        relative = '//textures/' + re.sub(r'[^A-Za-z0-9_.-]', '_', image.name) + '.png'
        image.filepath = '//' + 'x' * 1000; image.filepath = relative
        for packed in image.packed_files:
            packed.filepath = '//' + 'x' * 1000; packed.filepath = relative
    text = bpy.data.texts.new('SOURCE_REFERENCES.txt')
    text.write('Sento environment editable v03\n\n'
               'Imported from the audited Fuji mural UV candidate; no architecture was rebuilt.\n'
               'GLB SHA256: ' + input_hash + '\n'
               'Previous editable scene: assets/sento_environment/blend/sento_environment__v02.blend\n'
               'Previous editable SHA256: ' + previous_hash + '\n'
               'Geometry and independent NPC sources are documented in assets/sento_environment/README.md.\n'
               'Original mural image: assets/sento_mural/ref/sento_mural__v01.png\n'
               'Only inward-face mural U coordinates changed; all image bytes remain original.\n'
               'The publication GLB is produced by scripts/fix-fuji-mural-uv.py.\n'
               'This file is editable source, not a replacement export authority.\n')
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == 'FILE_BROWSER' and space.params:
                    space.params.directory = b'/' * 1023; space.params.directory = b'//'
    bpy.context.scene.render.filepath = '//'
    bpy.context.preferences.filepaths.save_version = 0
    before_objects, before_images = object_facts(), BASE.image_facts()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output.resolve()), compress=True)
    bpy.ops.wm.open_mainfile(filepath=str(args.output.resolve()))
    after_objects, after_images = object_facts(), BASE.image_facts()
    assert before_objects == after_objects, 'Reopened hierarchy, geometry, or UVs changed'
    assert before_images == after_images, 'Reopened packed image pixels changed'
    assert BASE.sha(previous.read_bytes()) == previous_hash, 'Previous editable source changed'
    assert args.input.read_bytes() == raw, 'Input GLB changed'
    report = {'source_glb_sha256': input_hash, 'blend_sha256': BASE.sha(args.output.read_bytes()),
              'previous_v02_sha256': previous_hash, 'previous_v02_unchanged': True,
              'reopened_meshes_hierarchy_uvs_identical': True, 'packed_images_reopened_identical': True,
              'objects': after_objects, 'images': after_images,
              'binary_metadata_audit': BASE.binary_metadata_audit(args.output),
              'scope': 'Editable reimport only; no canonical source or GLB was overwritten'}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    print('FUJI_EDITABLE_SAVED', json.dumps({'sha256': report['blend_sha256'], 'objects': len(after_objects),
                                          'packed_images': len(after_images), 'roundtrip_verified': True}))


if __name__ == '__main__':
    main()
