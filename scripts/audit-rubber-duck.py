"""Reopen the v04 source and inspect the actual exported rubber duck.

Blender --background --python scripts/audit-rubber-duck.py
Use -- --attachments to also repeat the static hat and carry inspection.
This neither promotes the candidate nor runs gameplay.
"""
import hashlib
import json
import struct
import subprocess
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path.cwd()
OUT = ROOT / 'assets/duck/quality/v04'
CAND = ROOT / '.local/rubber-duck-v04'
BLEND = ROOT / 'assets/duck/blend/duck__v04.blend'
GLB = CAND / 'duck.glb'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def geometry(obj):
    return ([tuple(v.co) for v in obj.data.vertices],
            [tuple(p.vertices) for p in obj.data.polygons])


def socket_matrices():
    return {o.name: [list(row) for row in o.matrix_world]
            for o in bpy.data.objects if o.name.startswith('socket_')}


def image_digest(image):
    return hashlib.sha256(np.array(image.pixels[:], dtype='<f4').tobytes()).hexdigest()


def import_objects(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return set(bpy.context.scene.objects) - before


def png_chunks(raw):
    assert raw[:8] == b'\x89PNG\r\n\x1a\n'
    result = []
    i = 8
    while i < len(raw):
        n = struct.unpack_from('>I', raw, i)[0]
        result.append(raw[i+4:i+8].decode('ascii'))
        i += n + 12
    assert i == len(raw)
    return result


if '--attachments' in sys.argv:
    models = CAND / 'attachment-models'
    models.mkdir(exist_ok=True)
    for name in ('duck', 'hat_sauna_duck', 'child', 'adult'):
        target = GLB if name == 'duck' else ROOT / f'public/models/{name}.glb'
        link = models / f'{name}.glb'
        if link.is_symlink():
            link.unlink()
        assert not link.exists(), 'Refuse to replace a non-symlink attachment input'
        link.symlink_to(target)
    subprocess.run([bpy.app.binary_path, '--background', '--python',
                    'scripts/inspect-character-attachments.py', '--',
                    '--models', str(models), '--out', str(OUT / 'attachments')], check=True)

bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'assets/duck/blend/duck__v03.blend'))
old_eyes = geometry(bpy.data.objects['duck_eyes'])
old_sockets = socket_matrices()
old_root = [list(row) for row in bpy.data.objects['duck'].matrix_world]
old_texture = image_digest(next(n.image for n in bpy.data.objects['duck_body'].data.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE'))
old_eye_color = list(bpy.data.objects['duck_eyes'].data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value)
bpy.ops.wm.open_mainfile(filepath=str(BLEND))
assert geometry(bpy.data.objects['duck_eyes']) == old_eyes
assert socket_matrices() == old_sockets
assert [list(row) for row in bpy.data.objects['duck'].matrix_world] == old_root
assert image_digest(next(n.image for n in bpy.data.objects['duck_body'].data.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE')) == old_texture
assert list(bpy.data.objects['duck_eyes'].data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value) == old_eye_color
retained_raw = geometry(bpy.data.objects['SOURCE_RAW_UNMODIFIED'])
fresh_raw = next(o for o in import_objects(ROOT / 'assets/duck/gen/duck__meshy6lite_raw_v01.glb') if o.type == 'MESH')
assert retained_raw == geometry(fresh_raw)
packed_images = [{'name': im.name, 'packed': bool(im.packed_file),
                  'relative_path': not im.filepath or im.filepath.startswith('//')}
                 for im in bpy.data.images if im.source == 'FILE']
assert all(i['packed'] and i['relative_path'] for i in packed_images)

rawblend = subprocess.run(['zstd', '-d', '--stdout', str(BLEND)], check=True, capture_output=True).stdout
markers = [b'/' + name + b'/' for name in (b'Users', b'private', b'home')]
markers += [b'.codex' + b'/', b'@' + b'gmail.com']
private_marker_count = sum(rawblend.count(marker) for marker in markers)
assert private_marker_count == 0

raw = GLB.read_bytes()
n = struct.unpack_from('<I', raw, 12)[0]
gltf = json.loads(raw[20:20+n])
assert all('uri' not in b for b in gltf.get('buffers', []))
assert all('uri' not in image for image in gltf.get('images', []))
assert not gltf.get('cameras') and not gltf.get('extensions', {}).get('KHR_lights_punctual')
image_chunks = []
for im in gltf.get('images', []):
    view = gltf['bufferViews'][im['bufferView']]
    start = 28+n+view.get('byteOffset', 0)
    image_chunks.append(png_chunks(raw[start:start+view['byteLength']]))
png_evidence = {str(path.relative_to(OUT)): png_chunks(path.read_bytes()) for path in sorted(OUT.rglob('*.png'))}
for chunks in [*image_chunks, *png_evidence.values()]:
    assert not set(chunks) & {'tEXt', 'zTXt', 'iTXt', 'eXIf'}

bpy.ops.wm.read_factory_settings(use_empty=True)
import_objects(ROOT / 'assets/duck/blend/duck__v03.glb')
old_runtime_sockets = socket_matrices()
bpy.ops.wm.read_factory_settings(use_empty=True)
import_objects(GLB)
assert socket_matrices() == old_runtime_sockets
body = bpy.data.objects['duck_body']
tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
hits = []
for x in (-.02, 0, .02):
    point, _, _, _ = tree.ray_cast(Vector((x, 0, -.03)), Vector((0, 0, 1)), .35)
    assert point is not None and abs(point.z) < 1e-7
    hits.append({'gltf_x_m': x, 'gltf_z_m': 0, 'hit_gltf_y_m': point.z})
attachments = json.loads((OUT / 'attachments/measurements.json').read_text())
assert attachments['assets']['duck']['sha256'] == sha(GLB)
assert attachments['attachments']['duck_hat']['label_clearance_m'] > 0
measurement = json.loads((OUT / 'measurements.json').read_text())
assert measurement['glb_sha256'] == sha(GLB) and measurement['blend_sha256'] == sha(BLEND)
audit = {
    'revision': 'v04', 'blender': bpy.app.version_string,
    'glb_sha256': sha(GLB), 'blend_sha256': sha(BLEND),
    'scope': 'Reopened Blend; fresh raw import; actual exported GLB; static attachment images. No gameplay or GPU benchmark.',
    'raw_geometry_exactly_matches_fresh_import': True,
    'eyes_geometry_and_base_color_unchanged': True,
    'body_texture_pixels_unchanged': True,
    'root_matrix_unchanged': True,
    'blend_socket_matrices_exact': True,
    'runtime_socket_matrices_exact': True,
    'bottom_center_rays': hits,
    'packed_images': packed_images,
    'metadata': {'png_files_checked': len(png_evidence), 'png_text_exif_chunks_found': 0,
                 'embedded_glb_png_chunks': image_chunks,
                 'private_path_markers_in_decompressed_blend': private_marker_count,
                 'all_glb_images_embedded': True, 'all_glb_buffers_embedded': True,
                 'glb_has_no_camera_or_lights': True},
    'attachment_measurements': 'attachments/measurements.json',
    'hat_label_clearance_m': attachments['attachments']['duck_hat']['label_clearance_m'],
}
(OUT / 'audit.json').write_text(json.dumps(audit, indent=2) + '\n')
print('V04_AUDIT_DONE', json.dumps(audit), flush=True)
