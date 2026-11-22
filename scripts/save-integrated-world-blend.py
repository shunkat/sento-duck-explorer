"""Save packed editable v05 from the exact combined growth/visitor candidate.

Blender --background --python-exit-code 1 --python scripts/save-integrated-world-blend.py

This is an editable reimport only. The byte-preserving composition remains the
authority for the publication GLB; no source geometry is exported again.
"""
import importlib.util
import json
from pathlib import Path
import re
import sys

sys.dont_write_bytecode = True
import bpy

SPEC = importlib.util.spec_from_file_location('editable_qa', Path(__file__).with_name('save-fuji-mural-blend.py'))
QA = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(QA)
BASE = QA.BASE


def main():
    directory = Path('.local/integrated-world')
    source = directory/'sento_environment.glb'; output = directory/'sento_environment__v05.blend'
    expected = '98f43e692fa430c2595acdf7c879a004735b4d0bc1b503a00fa69889b6cdde46'
    source_bytes = source.read_bytes(); assert BASE.sha(source_bytes) == expected
    predecessors = [Path('assets/sento_environment/blend')/name for name in
                    ('sento_environment__v04.blend', 'sento_environment__growth_v02.blend')]
    previous_hashes = {str(path): BASE.sha(path.read_bytes()) for path in predecessors}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
    assert bpy.data.objects['npc_slot_2'].get('npc_role') == 'npc_bath_tattooed'
    for name in ('growth_kids_gate', 'growth_front_exit'):
        assert bpy.data.objects[name].parent.name == 'sento_environment'
    for image in bpy.data.images:
        if image.type != 'IMAGE' or not image.size[0]:
            continue
        if not image.packed_file:
            image.pack()
        relative = '//textures/'+re.sub(r'[^A-Za-z0-9_.-]', '_', image.name)+'.png'
        image.filepath = '//'+'x'*1000; image.filepath = relative
        for packed in image.packed_files:
            packed.filepath = '//'+'x'*1000; packed.filepath = relative
    refs = bpy.data.texts.new('SOURCE_REFERENCES.txt')
    refs.write('Sento environment editable v05\n\n'
               'Exact reimport of the combined growth architecture and independent visitors.\n'
               'GLB SHA256: '+expected+'\n'
               'Producer: scripts/integrate-growth-visitors-world.py\n'
               'Growth patch: assets/sento_environment/patch/growth_v02/patch-contract.json\n'
               'Parent preservation: assets/sento_environment/quality/v05/parent-preservation.json\n'
               'Prior editable sources and hashes:\n'+''.join(name+' '+digest+'\n' for name,digest in previous_hashes.items())+
               '\nImages are packed. Geometry, normals, UVs and node ownership are imported unchanged.\n'
               'This editable file is not a replacement export authority.\n')
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == 'FILE_BROWSER' and space.params:
                    space.params.directory = b'/'*1023; space.params.directory = b'//'
    bpy.context.scene.render.filepath = '//'; bpy.context.preferences.filepaths.save_version = 0
    before_objects, before_images = QA.object_facts(), BASE.image_facts()
    bpy.ops.wm.save_as_mainfile(filepath=str(output.resolve()), compress=True)
    bpy.ops.wm.open_mainfile(filepath=str(output.resolve()))
    objects, images = QA.object_facts(), BASE.image_facts()
    assert before_objects == objects, 'Geometry/hierarchy/UV roundtrip changed'
    assert before_images == images, 'Packed pixel roundtrip changed'
    assert source.read_bytes() == source_bytes
    assert all(BASE.sha(Path(file).read_bytes()) == digest for file,digest in previous_hashes.items())
    report = {'source_glb_sha256': expected, 'blend_sha256': BASE.sha(output.read_bytes()),
              'previous_sources_unchanged': previous_hashes, 'reopened_meshes_hierarchy_uvs_identical': True,
              'packed_images_reopened_identical': True, 'objects': objects, 'images': images,
              'binary_metadata_audit': BASE.binary_metadata_audit(output),
              'scope': 'Editable GLB reimport only; no geometry rebuild or game/normal-input verification'}
    output.with_suffix('.audit.json').write_text(json.dumps(report, indent=2)+'\n')
    print('INTEGRATED_WORLD_EDITABLE', json.dumps({'sha256': report['blend_sha256'], 'objects': len(objects), 'packed_images': len(images)}))


if __name__ == '__main__':
    main()
