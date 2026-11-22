"""Save an editable v02 from the audited world candidate; never re-export it.

Blender --background --python-exit-code 1 --python scripts/save-replaced-world-blend.py --
    [--input .local/distinct-sento-npcs/world/sento_environment.glb]
    [--output .local/distinct-sento-npcs/world/sento_environment__v02.blend]

The detailed v01 construction file remains unchanged. This new file preserves
the accepted GLB's hierarchy and editable meshes, packs all imported textures,
and records links to the original construction and independent NPC sources.
"""
import argparse
from array import array
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys
sys.dont_write_bytecode = True

import bpy
import bmesh


def sha(data):
    return hashlib.sha256(data).hexdigest()


def object_facts():
    result = {}
    for obj in bpy.context.scene.objects:
        fact = {"type": obj.type, "parent": obj.parent.name if obj.parent else None,
                "matrix": [v for row in obj.matrix_world for v in row],
                "properties": obj.id_properties_ensure().to_dict()}
        if obj.type == 'MESH':
            obj.data.calc_loop_triangles()
            positions = array('f', (v for vertex in obj.data.vertices for v in vertex.co))
            bm = bmesh.new(); bm.from_mesh(obj.data)
            legacy_degenerate = sum(face.calc_area() < 1e-14 for face in bm.faces); bm.free()
            fact.update(vertices=len(obj.data.vertices), triangles=len(obj.data.loop_triangles),
                        polygon_degenerate_faces=sum(face.area < 1e-14 for face in obj.data.polygons),
                        legacy_bmesh_degenerate_faces=legacy_degenerate,
                        positions_sha256=sha(positions.tobytes()),
                        materials=[slot.material.name if slot.material else None for slot in obj.material_slots])
        result[obj.name] = fact
    return result


def image_facts():
    result = []
    for image in bpy.data.images:
        if image.type != 'IMAGE' or not image.size[0]:
            continue
        pixels = array('f', [0]) * len(image.pixels)
        image.pixels.foreach_get(pixels)
        assert pixels and all(math.isfinite(p) for p in pixels), 'Invalid image pixels'
        assert image.packed_file, 'Texture is not packed'
        assert image.filepath.startswith('//'), 'Texture path is not relative'
        assert all(packed.filepath.startswith('//') for packed in image.packed_files), 'Packed texture path is not relative'
        result.append({"name": image.name, "path": image.filepath, "packed": True,
                       "packed_paths": [p.filepath for p in image.packed_files],
                       "size": list(image.size), "decoded_pixels_sha256": sha(pixels.tobytes())})
    return sorted(result, key=lambda x: x['name'])


def binary_metadata_audit(path):
    raw = path.read_bytes()
    if raw.startswith(b'BLENDER'):
        decoded = raw
    else:
        zstd = shutil.which('zstd')
        assert zstd, 'zstd is required to audit the compressed editable file'
        decoded = subprocess.run([zstd, '-d', '-q', '-c', str(path)], check=True, capture_output=True).stdout
    checks = {'personal_absolute_paths': rb'/(?:Users|home)/[^\x00\r\n]+',
              'private_candidate_paths': rb'\.local/[^\x00\r\n]+',
              'file_uris': rb'file://[^\x00\r\n]+'}
    counts = {kind: len(re.findall(pattern, decoded)) for kind, pattern in checks.items()}
    assert not any(counts.values()), 'Editable binary contains a private path (values redacted)'
    return {'decompressed_bytes': len(decoded), 'redacted_match_counts': counts}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=Path('.local/distinct-sento-npcs/world/sento_environment.glb'))
    parser.add_argument('--output', type=Path, default=Path('.local/distinct-sento-npcs/world/sento_environment__v02.blend'))
    parser.add_argument('--report', type=Path)
    parser.add_argument('--npc-source', action='append', default=[], help='Repository-relative editable NPC source reference')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    assert '.local' in args.output.resolve().parts, 'Output must remain a private candidate'
    assert args.output.name.endswith('__v02.blend'), 'Use a new v02 source file'
    assert args.output.resolve() != args.input.resolve()
    original_source = Path('assets/sento_environment/blend/sento_environment__v01.blend')
    original_hash = sha(original_source.read_bytes())
    input_hash = sha(args.input.read_bytes())
    spec = importlib.util.spec_from_file_location('npc_patch', Path(__file__).with_name('replace-background-npcs.py'))
    patch = importlib.util.module_from_spec(spec); spec.loader.exec_module(patch)
    glb = patch.Glb(args.input); patch.metadata_audit(glb)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    for image in bpy.data.images:
        if image.type != 'IMAGE' or not image.size[0]:
            continue
        if not image.packed_file:
            image.pack()
        # Clear fixed-size filepath buffers before assigning a shorter relative path.
        relative = '//textures/' + re.sub(r'[^A-Za-z0-9_.-]', '_', image.name) + '.png'
        image.filepath = '//' + 'x' * 1000; image.filepath = relative
        for packed in image.packed_files:
            packed.filepath = '//' + 'x' * 1000; packed.filepath = relative
    refs = args.npc_source or [f'assets/sento_visitors/blend/{role}__v01.blend'
                                   for role in ('npc_staff', 'npc_bath_standing', 'npc_seated')]
    assert all(not Path(ref).is_absolute() and '.local/' not in ref and '..' not in Path(ref).parts for ref in refs)
    text = bpy.data.texts.new('SOURCE_REFERENCES.txt')
    text.write('Sento environment editable v02\n\n'
               'Imported from the audited public-model candidate; no architecture was rebuilt.\n'
               'GLB SHA256: ' + input_hash + '\n'
               'Detailed original construction: assets/sento_environment/blend/sento_environment__v01.blend\n'
               'Original construction SHA256: ' + original_hash + '\n'
               'Independent NPC editable sources:\n' + ''.join('- ' + ref + '\n' for ref in refs) +
               '\nThe publication GLB is produced by replace-background-npcs.py.\n'
               'This file is editable source, not a replacement export authority.\n')
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == 'FILE_BROWSER' and space.params:
                    space.params.directory = b'/' * 1023; space.params.directory = b'//'
    bpy.context.scene.render.filepath = '//'
    bpy.context.preferences.filepaths.save_version = 0
    before_objects, before_images = object_facts(), image_facts()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output.resolve()), compress=True)
    bpy.ops.wm.open_mainfile(filepath=str(args.output.resolve()))
    after_objects, after_images = object_facts(), image_facts()
    assert before_objects == after_objects, 'Saved/reopened editable geometry or hierarchy changed'
    assert before_images == after_images, 'Saved/reopened packed image pixels changed'
    assert sha(original_source.read_bytes()) == original_hash, 'Original source changed'
    assert sha(args.input.read_bytes()) == input_hash, 'Input GLB changed'
    binary_metadata = binary_metadata_audit(args.output)
    report = {"binary_metadata_audit": binary_metadata, "source_glb_sha256": input_hash, "blend_sha256": sha(args.output.read_bytes()),
              "original_v01_unchanged": True, "original_v01_sha256": original_hash,
              "reopened_meshes_and_hierarchy_identical": True, "packed_images_reopened_identical": True,
              "objects": after_objects, "images": after_images, "npc_source_references": refs,
              "blender_polygon_degenerate_faces": sum(o.get("polygon_degenerate_faces", 0) for o in after_objects.values()),
              "legacy_bmesh_degenerate_faces": sum(o.get("legacy_bmesh_degenerate_faces", 0) for o in after_objects.values()),
              "scope": 'Editable reimport only; no canonical source or GLB was overwritten.'}
    report_path = args.report or args.output.with_suffix('.audit.json')
    assert '.local' in report_path.resolve().parts, 'Report must remain private until reviewed'
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    print('WORLD_EDITABLE_SAVED', json.dumps({"file": args.output.name, "sha256": report['blend_sha256'],
          "objects": len(after_objects), "packed_images": len(after_images), "roundtrip_verified": True}))


if __name__ == '__main__':
    main()
