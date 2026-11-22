"""Save a packed editable v04 from the reviewed tattoo-visitor world candidate.

Blender --background --python-exit-code 1 --python scripts/save-tattooed-world-blend.py

This reimport does not re-export the GLB or alter the prior editable source.
"""
import importlib.util
import json
from pathlib import Path
import re
import sys
sys.dont_write_bytecode = True

import bpy

SPEC = importlib.util.spec_from_file_location('fuji_editable', Path(__file__).with_name('save-fuji-mural-blend.py'))
QA = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(QA)
BASE = QA.BASE


def main():
    directory = Path('.local/tattooed-visitor/world')
    source = directory / 'sento_environment.glb'
    output = directory / 'sento_environment__v04.blend'
    previous = Path('assets/sento_environment/blend/sento_environment__v03.blend')
    previous_hash = BASE.sha(previous.read_bytes())
    assert previous_hash == '95ee169db14ea863c656f987e090f8d162398f304d02340bc0d746daaf04d838'
    input_bytes = source.read_bytes(); input_hash = BASE.sha(input_bytes)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
    slot = bpy.data.objects.get('npc_slot_2')
    assert slot and slot.get('npc_role') == 'npc_bath_tattooed', 'Expected reviewed tattooed visitor slot'
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
    text.write('Sento environment editable v04\n\n'
               'Exact reimport of the tattooed-visitor composite; no geometry was remodeled.\n'
               'GLB SHA256: ' + input_hash + '\n'
               'Previous source: assets/sento_environment/blend/sento_environment__v03.blend\n'
               'Previous source SHA256: ' + previous_hash + '\n'
               'Tattooed visitor sources: assets/sento_visitors/tattoo/README.md\n'
               'Original tattoo art: assets/sento_visitors/tattoo/ref/koi_waves__v01.png\n'
               'Producer: scripts/replace-tattooed-visitor.py\n'
               'Other visitors, architecture and corrected Fuji mural retain v03 data.\n'
               'This is editable source; the reviewed GLB remains the publication authority.\n')
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == 'FILE_BROWSER' and space.params:
                    space.params.directory = b'/' * 1023; space.params.directory = b'//'
    bpy.context.scene.render.filepath = '//'
    bpy.context.preferences.filepaths.save_version = 0
    before_objects, before_images = QA.object_facts(), BASE.image_facts()
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output.resolve()), compress=True)
    bpy.ops.wm.open_mainfile(filepath=str(output.resolve()))
    after_objects, after_images = QA.object_facts(), BASE.image_facts()
    assert before_objects == after_objects, 'Hierarchy, geometry, or UVs changed after reopening'
    assert before_images == after_images, 'Packed image pixels changed after reopening'
    assert BASE.sha(previous.read_bytes()) == previous_hash, 'Previous editable source changed'
    assert source.read_bytes() == input_bytes, 'Input GLB changed'
    report = {'source_glb_sha256': input_hash, 'blend_sha256': BASE.sha(output.read_bytes()),
              'previous_v03_sha256': previous_hash, 'previous_v03_unchanged': True,
              'reopened_meshes_hierarchy_uvs_identical': True, 'packed_images_reopened_identical': True,
              'objects': after_objects, 'images': after_images,
              'binary_metadata_audit': BASE.binary_metadata_audit(output),
              'scope': 'Editable GLB reimport only; not a game-lighting or gameplay result'}
    output.with_suffix('.audit.json').write_text(json.dumps(report, indent=2) + '\n')
    print('TATTOO_WORLD_EDITABLE', json.dumps({'sha256': report['blend_sha256'],
          'objects': len(after_objects), 'packed_images': len(after_images), 'roundtrip_verified': True}))


if __name__ == '__main__':
    main()
